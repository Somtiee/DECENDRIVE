module decendrive::decendrive {
    use std::option::{Self, Option};
    use std::string::String;
    use sui::event;
    use sui::object::{Self, ID, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::vec_map::{Self, VecMap};

    const E_NOT_OWNER: u64 = 1;
    const E_ACCESS_NOT_FOUND: u64 = 2;
    const E_NOT_RECIPIENT: u64 = 3;
    const E_INVALID_STATUS: u64 = 4;
    const E_SELF_SHARE: u64 = 5;

    const STATUS_PENDING: u8 = 0;
    const STATUS_ACCEPTED: u8 = 1;
    const STATUS_DECLINED: u8 = 2;

    /// Bit 0 = view, bit 1 = download
    const PERM_VIEW: u8 = 1;
    const PERM_DOWNLOAD: u8 = 2;

    public struct AccessEntry has copy, drop, store {
        address: address,
        expires_at: u64,
        revoked: bool,
    }

    public struct File has key, store {
        id: UID,
        blob_id: String,
        owner: address,
        size: u64,
        uploaded_at: u64,
        last_accessed: u64,
        in_trash: bool,
        encryption_key_hash: String,
        access_list: vector<AccessEntry>,
        metadata: VecMap<String, String>,
    }

    /// Wallet-to-wallet share delivered as an owned object in the recipient's wallet.
    public struct ShareInvitation has key, store {
        id: UID,
        blob_id: String,
        sender: address,
        recipient: address,
        filename: String,
        mime_type: String,
        size: u64,
        encryption_key_hash: String,
        key_wrapper: String,
        permissions: u8,
        expires_at: u64,
        status: u8,
        created_at: u64,
        accepted_at: u64,
        walrus_object_id: Option<ID>,
        file_object_id: Option<ID>,
    }

    public struct ShareSentEvent has copy, drop {
        invitation_id: ID,
        blob_id: String,
        sender: address,
        recipient: address,
        permissions: u8,
        created_at: u64,
    }

    public struct ShareAcceptedEvent has copy, drop {
        invitation_id: ID,
        blob_id: String,
        recipient: address,
        accepted_at: u64,
    }

    /// Per-wallet drive layout anchor — points at encrypted Walrus manifest blob.
    public struct DriveProfile has key, store {
        id: UID,
        owner: address,
        state_blob_id: String,
        state_version: u64,
        updated_at: u64,
    }

    public struct FileRegisteredEvent has copy, drop {
        file_id: ID,
        blob_id: String,
        owner: address,
        uploaded_at: u64,
    }

    fun assert_owner(file: &File, sender: address) {
        assert!(file.owner == sender, E_NOT_OWNER);
    }

    fun find_access_index(access_list: &vector<AccessEntry>, target: address): u64 {
        let length = vector::length(access_list);
        let mut i = 0;
        while (i < length) {
            let entry = vector::borrow(access_list, i);
            if (entry.address == target) {
                return i;
            };
            i = i + 1;
        };

        length
    }

    public entry fun register_file(
        blob_id: String,
        size: u64,
        uploaded_at: u64,
        encryption_key_hash: String,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let file = File {
            id: object::new(ctx),
            blob_id,
            owner: sender,
            size,
            uploaded_at,
            last_accessed: uploaded_at,
            in_trash: false,
            encryption_key_hash,
            access_list: vector[],
            metadata: vec_map::empty(),
        };

        let file_id = object::id(&file);
        event::emit(FileRegisteredEvent {
            file_id,
            blob_id: file.blob_id,
            owner: sender,
            uploaded_at,
        });

        transfer::public_transfer(file, sender);
    }

    public entry fun create_drive_profile(ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        let profile = DriveProfile {
            id: object::new(ctx),
            owner: sender,
            state_blob_id: std::string::utf8(b""),
            state_version: 0,
            updated_at: 0,
        };
        transfer::public_transfer(profile, sender);
    }

    public entry fun update_drive_state(
        profile: &mut DriveProfile,
        state_blob_id: String,
        state_version: u64,
        updated_at: u64,
        ctx: &TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(profile.owner == sender, E_NOT_OWNER);
        profile.state_blob_id = state_blob_id;
        profile.state_version = state_version;
        profile.updated_at = updated_at;
    }

    public entry fun share_file(
        file: &mut File,
        shared_with: address,
        expires_at: u64,
        ctx: &TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert_owner(file, sender);

        let index = find_access_index(&file.access_list, shared_with);
        let length = vector::length(&file.access_list);

        if (index < length) {
            let entry = vector::borrow_mut(&mut file.access_list, index);
            entry.expires_at = expires_at;
            entry.revoked = false;
        } else {
            vector::push_back(
                &mut file.access_list,
                AccessEntry {
                    address: shared_with,
                    expires_at,
                    revoked: false,
                },
            );
        };
    }

    /// Send a Walrus-backed file to another wallet. Recipient must accept to mark as received.
    public entry fun send_share_invitation(
        blob_id: String,
        recipient: address,
        filename: String,
        mime_type: String,
        size: u64,
        encryption_key_hash: String,
        key_wrapper: String,
        permissions: u8,
        expires_at: u64,
        created_at: u64,
        walrus_object_id: Option<ID>,
        file_object_id: Option<ID>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender != recipient, E_SELF_SHARE);

        let invitation = ShareInvitation {
            id: object::new(ctx),
            blob_id,
            sender,
            recipient,
            filename,
            mime_type,
            size,
            encryption_key_hash,
            key_wrapper,
            permissions,
            expires_at,
            status: STATUS_PENDING,
            created_at,
            accepted_at: 0,
            walrus_object_id,
            file_object_id,
        };

        let invitation_id = object::id(&invitation);
        event::emit(ShareSentEvent {
            invitation_id,
            blob_id: invitation.blob_id,
            sender,
            recipient,
            permissions,
            created_at,
        });

        transfer::public_transfer(invitation, recipient);
    }

    /// Same as send_share_invitation, but invitation + event use @0x0 as sender (shielded on Suiscan).
    /// Client embeds the ephemeral decrypt channel inside key_wrapper (see app priv-share encoding).
    public entry fun send_private_share_invitation(
        blob_id: String,
        recipient: address,
        filename: String,
        mime_type: String,
        size: u64,
        encryption_key_hash: String,
        key_wrapper: String,
        permissions: u8,
        expires_at: u64,
        created_at: u64,
        walrus_object_id: Option<ID>,
        file_object_id: Option<ID>,
        ctx: &mut TxContext
    ) {
        let payer = tx_context::sender(ctx);
        assert!(payer != recipient, E_SELF_SHARE);
        let anonymous_sender = @0x0;

        let invitation = ShareInvitation {
            id: object::new(ctx),
            blob_id,
            sender: anonymous_sender,
            recipient,
            filename,
            mime_type,
            size,
            encryption_key_hash,
            key_wrapper,
            permissions,
            expires_at,
            status: STATUS_PENDING,
            created_at,
            accepted_at: 0,
            walrus_object_id,
            file_object_id,
        };

        let invitation_id = object::id(&invitation);
        event::emit(ShareSentEvent {
            invitation_id,
            blob_id: invitation.blob_id,
            sender: anonymous_sender,
            recipient,
            permissions,
            created_at,
        });

        transfer::public_transfer(invitation, recipient);
    }

    public entry fun accept_share_invitation(
        invitation: &mut ShareInvitation,
        accepted_at: u64,
        ctx: &TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(invitation.recipient == sender, E_NOT_RECIPIENT);
        assert!(invitation.status == STATUS_PENDING, E_INVALID_STATUS);

        invitation.status = STATUS_ACCEPTED;
        invitation.accepted_at = accepted_at;

        event::emit(ShareAcceptedEvent {
            invitation_id: object::id(invitation),
            blob_id: invitation.blob_id,
            recipient: sender,
            accepted_at,
        });
    }

    public entry fun decline_share_invitation(invitation: ShareInvitation, ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        assert!(invitation.recipient == sender, E_NOT_RECIPIENT);
        assert!(invitation.status == STATUS_PENDING, E_INVALID_STATUS);

        let ShareInvitation { id, .. } = invitation;
        object::delete(id);
    }

    public entry fun revoke_access(file: &mut File, shared_with: address, ctx: &TxContext) {
        let sender = tx_context::sender(ctx);
        assert_owner(file, sender);

        let index = find_access_index(&file.access_list, shared_with);
        let length = vector::length(&file.access_list);
        assert!(index < length, E_ACCESS_NOT_FOUND);

        let entry = vector::borrow_mut(&mut file.access_list, index);
        entry.revoked = true;
    }

    public entry fun move_to_trash(file: &mut File, ctx: &TxContext) {
        let sender = tx_context::sender(ctx);
        assert_owner(file, sender);
        file.in_trash = true;
    }

    public entry fun restore_from_trash(file: &mut File, ctx: &TxContext) {
        let sender = tx_context::sender(ctx);
        assert_owner(file, sender);
        file.in_trash = false;
    }

    public entry fun touch_access(file: &mut File, now_ms: u64, ctx: &TxContext) {
        let sender = tx_context::sender(ctx);
        let can_touch = is_accessible(file, sender, now_ms);
        assert!(can_touch, E_NOT_OWNER);
        file.last_accessed = now_ms;
    }

    public fun is_accessible(file: &File, account: address, now_ms: u64): bool {
        if (file.owner == account) {
            return true;
        };

        let length = vector::length(&file.access_list);
        let mut i = 0;

        while (i < length) {
            let entry = vector::borrow(&file.access_list, i);
            let is_target = entry.address == account;
            let not_revoked = !entry.revoked;
            let no_expiry = entry.expires_at == 0;
            let not_expired = entry.expires_at > now_ms;

            if (is_target && not_revoked && (no_expiry || not_expired)) {
                return true;
            };
            i = i + 1;
        };

        false
    }

    public entry fun update_metadata(
        file: &mut File,
        size: u64,
        uploaded_at: u64,
        encryption_key_hash: String,
        ctx: &TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert_owner(file, sender);

        file.size = size;
        file.uploaded_at = uploaded_at;
        file.last_accessed = uploaded_at;
        file.encryption_key_hash = encryption_key_hash;
    }

    public entry fun upsert_metadata_key(
        file: &mut File,
        key: String,
        value: String,
        ctx: &TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert_owner(file, sender);

        if (vec_map::contains(&file.metadata, &key)) {
            let value_ref = vec_map::get_mut(&mut file.metadata, &key);
            *value_ref = value;
        } else {
            vec_map::insert(&mut file.metadata, key, value);
        };
    }
}
