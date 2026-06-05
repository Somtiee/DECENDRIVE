import type { ShareInvitationView } from "@/components/drive/types";

type RevokeCheckItem = Pick<ShareInvitationView, "sender" | "blobId" | "recipient" | "objectId"> &
  Partial<ShareInvitationView>;

async function isRevokedForInvitation(
  invite: RevokeCheckItem,
  recipient: string,
): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      sender: invite.sender,
      recipient,
      blobId: invite.blobId,
      invitationId: invite.objectId,
    });
    if (invite.fileObjectId) {
      params.set("fileObjectId", invite.fileObjectId);
    }
    const response = await fetch(`/api/files/share-access?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return false;
    }
    const data = (await response.json()) as { revoked?: boolean };
    return data.revoked === true;
  } catch {
    return false;
  }
}

export async function applyRevokeStatusToInvites<T extends RevokeCheckItem>(
  items: T[],
  recipient: string,
): Promise<T[]> {
  const revokeCache = new Map<string, boolean>();

  return Promise.all(
    items.map(async (invite) => {
      if (invite.accessRevoked) {
        return {
          ...invite,
          canView: false,
          canDownload: false,
          permissions: 0,
        };
      }
      const key = invite.objectId;
      let revoked = revokeCache.get(key);
      if (revoked === undefined) {
        revoked = await isRevokedForInvitation(invite, recipient);
        revokeCache.set(key, revoked);
      }
      if (!revoked) {
        return invite;
      }
      return {
        ...invite,
        accessRevoked: true,
        canView: false,
        canDownload: false,
        permissions: 0,
      };
    }),
  );
}
