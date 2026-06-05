import "server-only";

import {
  isInvitationRevoked,
  isRecipientRevoked,
} from "@/lib/drive/share-revoke-utils";
import {
  META_LINK_DOWNLOAD,
  META_LINK_VIEW,
  META_SHARE_REVOKED,
  META_SHARE_REVOKED_INVITATIONS,
} from "@/lib/sui/file-metadata-keys";
import { findDecenDriveFileForBlob } from "@/lib/sui/find-decendrive-file";
import { parseVecMapMetadata } from "@/lib/sui/parse-metadata";
import { multiGetObjectsResilient } from "@/lib/sui/rpc-resilient";

export type LiveShareAccess = {
  canView: boolean;
  canDownload: boolean;
  accessRevoked: boolean;
  revokedRecipients: string[];
  revokedInvitations: string[];
  revokedInvitationsRaw: string;
  revokedRecipientsRaw: string;
};

function metadataFromFields(
  fields: Record<string, unknown> | undefined,
  recipient?: string,
): LiveShareAccess | null {
  if (!fields) {
    return null;
  }
  const metadata = parseVecMapMetadata(fields.metadata);
  const revokedRecipientsRaw = metadata[META_SHARE_REVOKED] ?? "";
  const revokedInvitationsRaw = metadata[META_SHARE_REVOKED_INVITATIONS] ?? "";
  const revokedRecipients = revokedRecipientsRaw
    ? revokedRecipientsRaw.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean)
    : [];
  const revokedInvitations = revokedInvitationsRaw
    ? revokedInvitationsRaw.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean)
    : [];
  const hasRevokeKey =
    META_SHARE_REVOKED in metadata || META_SHARE_REVOKED_INVITATIONS in metadata;
  const hasAccessKeys = META_LINK_VIEW in metadata || META_LINK_DOWNLOAD in metadata;
  if (!hasAccessKeys && !hasRevokeKey && revokedRecipients.length === 0 && revokedInvitations.length === 0) {
    return null;
  }
  const parsed: LiveShareAccess = {
    canView: metadata[META_LINK_VIEW] === "1",
    canDownload: metadata[META_LINK_DOWNLOAD] === "1",
    accessRevoked: false,
    revokedRecipients,
    revokedInvitations,
    revokedInvitationsRaw,
    revokedRecipientsRaw,
  };
  if (recipient) {
    parsed.accessRevoked = isRecipientRevoked(revokedRecipientsRaw, recipient);
  }
  return parsed;
}

export function isShareInvitationRevoked(
  live: LiveShareAccess | null | undefined,
  invitationId?: string,
  recipient?: string,
): boolean {
  if (!live) {
    return false;
  }
  if (invitationId && isInvitationRevoked(live.revokedInvitationsRaw, invitationId)) {
    return true;
  }
  if (recipient) {
    return isRecipientRevoked(live.revokedRecipientsRaw, recipient);
  }
  return false;
}

function parseLiveShareAccessFromContent(
  content: Record<string, unknown> | undefined,
  recipient?: string,
): LiveShareAccess | null {
  if (!content || content.dataType !== "moveObject") {
    return null;
  }
  return metadataFromFields(content.fields as Record<string, unknown> | undefined, recipient);
}

export async function readLiveShareAccessFromFileObject(
  fileObjectId: string,
  recipient?: string,
): Promise<LiveShareAccess | null> {
  try {
    const [response] = await multiGetObjectsResilient([fileObjectId], { showContent: true });
    return parseLiveShareAccessFromContent(
      response?.data?.content as Record<string, unknown> | undefined,
      recipient,
    );
  } catch {
    return null;
  }
}

export async function readLiveShareAccessBatch(
  fileObjectIds: string[],
  recipient?: string,
): Promise<Map<string, LiveShareAccess>> {
  const uniqueIds = [...new Set(fileObjectIds.filter(Boolean))];
  const result = new Map<string, LiveShareAccess>();
  if (uniqueIds.length === 0) {
    return result;
  }

  try {
    const responses = await multiGetObjectsResilient(uniqueIds, { showContent: true });
    for (const response of responses) {
      const objectId = response?.data?.objectId;
      if (!objectId) {
        continue;
      }
      const parsed = parseLiveShareAccessFromContent(
        response.data?.content as Record<string, unknown> | undefined,
        recipient,
      );
      if (parsed) {
        result.set(objectId, parsed);
      }
    }
  } catch {
    // Caller falls back to invitation defaults.
  }

  return result;
}

export async function readLiveShareAccessForBlob(
  sender: string,
  blobId: string,
  recipient?: string,
  invitationId?: string,
): Promise<LiveShareAccess | null> {
  const file = await findDecenDriveFileForBlob(sender, blobId);
  if (!file?.objectId) {
    return null;
  }
  const live = await readLiveShareAccessFromFileObject(file.objectId, recipient);
  if (!live) {
    return null;
  }
  if (invitationId) {
    live.accessRevoked = isShareInvitationRevoked(live, invitationId, recipient);
  }
  return live;
}

export async function readLiveShareAccessForInvitation(
  fileObjectId: string,
  invitationId: string,
  recipient?: string,
): Promise<LiveShareAccess | null> {
  const live = await readLiveShareAccessFromFileObject(fileObjectId, recipient);
  if (!live) {
    return null;
  }
  live.accessRevoked = isShareInvitationRevoked(live, invitationId, recipient);
  return live;
}
