"use client";

import type { OwnedFileView } from "@/components/drive/types";
import {
  addLocalRevokedInvitation,
  removeLocalRevokedInvitation,
} from "@/lib/drive/share-revoke";
import { mergeFileMeta, renameFile, saveFileMeta } from "@/lib/drive/file-metadata";
import { captureTrashFolderSnapshot, clearTrashFolderSnapshot } from "@/lib/drive/trash";
import {
  META_DISPLAY_NAME,
  META_MIME_TYPE,
  META_SHARE_REVOKED_INVITATIONS,
} from "@/lib/sui/file-metadata-keys";
import {
  moveFilesToTrashOnChainBatch,
  restoreFilesFromTrashOnChainBatch,
  upsertFileMetadataKeys,
  type ContractExecutor,
} from "@/lib/sui/contract";
import { findDecenDriveFileForBlob } from "@/lib/sui/find-decendrive-file";
import {
  addRevokedInvitation,
  removeRevokedInvitation,
} from "@/lib/drive/share-revoke-utils";

export function resolveDecendriveFileId(file: OwnedFileView): string | null {
  if (file.decendriveFileId) {
    return file.decendriveFileId;
  }
  if (!file.isWalrusBlob && file.isOwner) {
    return file.objectId;
  }
  return null;
}

export async function resolveDecendriveFileIdForBlob(
  owner: string,
  file: OwnedFileView,
): Promise<string | null> {
  if (file.decendriveFileId) {
    return file.decendriveFileId;
  }
  if (file.shareInvitationId || file.shareKeyWrapper) {
    return resolveSenderFileObjectId(owner, file.blobId);
  }
  const direct = resolveDecendriveFileId(file);
  if (direct && !file.shareInvitationId) {
    const match = await findDecenDriveFileForBlob(owner, file.blobId);
    if (match && match.objectId !== direct) {
      return match.objectId;
    }
    return direct;
  }
  return resolveSenderFileObjectId(owner, file.blobId);
}

/** Sender-owned Move File for a blob — never a ShareInvitation (owned by recipient). */
export async function resolveSenderFileObjectId(
  owner: string,
  blobId: string,
): Promise<string | null> {
  const match = await findDecenDriveFileForBlob(owner, blobId);
  return match?.objectId ?? null;
}

export async function syncDisplayNameOnChain(
  executor: ContractExecutor,
  fileObjectId: string,
  blobId: string,
  name: string,
  mimeType?: string,
) {
  const entries = [
    { key: META_DISPLAY_NAME, value: name },
    ...(mimeType ? [{ key: META_MIME_TYPE, value: mimeType }] : []),
  ];
  await upsertFileMetadataKeys(executor, fileObjectId, entries);
  renameFile(blobId, name);
  if (mimeType) {
    const map = { name, mimeType, uploadedAt: Date.now() };
    saveFileMeta(blobId, map);
  }
}

export async function resolveFileObjectIdFromInvitation(
  invitationId: string,
): Promise<string | null> {
  if (!invitationId) {
    return null;
  }
  try {
    const response = await fetch(
      `/api/files/share-invitation?invitationId=${encodeURIComponent(invitationId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { fileObjectId?: string | null };
    return data.fileObjectId ?? null;
  } catch {
    return null;
  }
}

export async function resolveFileObjectIdForShareItem(item: {
  invitationId: string;
  fileObjectId?: string;
  blobId: string;
  sender?: string;
}): Promise<string | null> {
  if (item.fileObjectId) {
    return item.fileObjectId;
  }
  const fromInvitation = await resolveFileObjectIdFromInvitation(item.invitationId);
  if (fromInvitation) {
    return fromInvitation;
  }
  if (item.sender) {
    return resolveSenderFileObjectId(item.sender, item.blobId);
  }
  return null;
}

export async function syncRevokeRecipientOnChain(
  executor: ContractExecutor,
  fileObjectId: string,
  invitationId: string,
) {
  let currentRaw = "";
  try {
    const params = new URLSearchParams({
      fileObjectId,
      invitationId,
      includeRevokedList: "1",
    });
    const response = await fetch(`/api/files/share-access?${params.toString()}`);
    if (response.ok) {
      const data = (await response.json()) as { revokedInvitationsRaw?: string };
      currentRaw = data.revokedInvitationsRaw ?? "";
    }
  } catch {
    // Fall back to empty list when the lookup fails.
  }
  const serialized = addRevokedInvitation(currentRaw, invitationId);
  await upsertFileMetadataKeys(executor, fileObjectId, [
    { key: META_SHARE_REVOKED_INVITATIONS, value: serialized },
  ]);
  addLocalRevokedInvitation(invitationId);
}

export async function syncRestoreRecipientOnChain(
  executor: ContractExecutor,
  fileObjectId: string,
  invitationId: string,
) {
  let currentRaw = "";
  try {
    const params = new URLSearchParams({
      fileObjectId,
      invitationId,
      includeRevokedList: "1",
    });
    const response = await fetch(`/api/files/share-access?${params.toString()}`);
    if (response.ok) {
      const data = (await response.json()) as { revokedInvitationsRaw?: string };
      currentRaw = data.revokedInvitationsRaw ?? "";
    }
  } catch {
    // Fall back to empty list when the lookup fails.
  }
  const serialized = removeRevokedInvitation(currentRaw, invitationId);
  await upsertFileMetadataKeys(executor, fileObjectId, [
    { key: META_SHARE_REVOKED_INVITATIONS, value: serialized },
  ]);
  removeLocalRevokedInvitation(invitationId);
}

export async function moveFilesToTrashWithChain(
  executor: ContractExecutor,
  owner: string,
  files: OwnedFileView[],
) {
  const fileObjectIds: string[] = [];
  for (const file of files) {
    captureTrashFolderSnapshot(file.blobId);
    const fileId = await resolveDecendriveFileIdForBlob(owner, file);
    if (fileId) {
      fileObjectIds.push(fileId);
    }
  }
  if (fileObjectIds.length > 0) {
    await moveFilesToTrashOnChainBatch(executor, fileObjectIds);
  }
}

export async function restoreFilesFromTrashWithChain(
  executor: ContractExecutor,
  owner: string,
  files: OwnedFileView[],
) {
  const fileObjectIds: string[] = [];
  for (const file of files) {
    const fileId = await resolveDecendriveFileIdForBlob(owner, file);
    if (fileId) {
      fileObjectIds.push(fileId);
    }
    clearTrashFolderSnapshot(file.blobId);
  }
  if (fileObjectIds.length > 0) {
    await restoreFilesFromTrashOnChainBatch(executor, fileObjectIds);
  }
}

/** Apply on-chain metadata from owned files into local cache (display names). */
export function hydrateLocalFromOwnedMetadata(
  files: Array<{
    blobId: string;
    name?: string;
    mimeType?: string;
    metadata?: Record<string, string>;
  }>,
) {
  const entries: Record<string, { name: string; mimeType?: string; uploadedAt: number }> = {};
  for (const file of files) {
    const metadata = file.metadata ?? {};
    const displayName = metadata[META_DISPLAY_NAME]?.trim();
    if (displayName) {
      entries[file.blobId] = {
        name: displayName,
        mimeType: metadata[META_MIME_TYPE] ?? file.mimeType,
        uploadedAt: Date.now(),
      };
    }
  }
  mergeFileMeta(entries);
}
