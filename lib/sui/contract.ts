import { Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress } from "@mysten/sui/utils";

import { getSuiClient } from "./client";
import { appendTreasuryFee, calculateShareFeeSui } from "./fees";

const PACKAGE_ID_PLACEHOLDER = "0x0";
const DECENDRIVE_MODULE_NAME = "decendrive";

export const decenDrivePackageId =
  process.env.NEXT_PUBLIC_DECENDRIVE_PACKAGE_ID ?? PACKAGE_ID_PLACEHOLDER;

/** v1 mainnet publish — existing File objects still use this package ID in their type. */
export const decenDriveLegacyPackageId =
  "0x96458b85b6b653a17ccf01f2c5691824e7177be2069d299737451ab657ead362";

/** Share invitations created before the latest package upgrade. */
export const decenDriveShareLegacyPackageId =
  "0xa7dda3a1ce40b323f45d7d349db78e661ac7918f200bebb70da82619e54a6a7f";

export function getDecendrivePackageIdsForQuery(): string[] {
  const ids = new Set<string>();
  if (isValidSuiAddress(decenDrivePackageId) && decenDrivePackageId !== PACKAGE_ID_PLACEHOLDER) {
    ids.add(decenDrivePackageId);
  }
  if (isValidSuiAddress(decenDriveLegacyPackageId)) {
    ids.add(decenDriveLegacyPackageId);
  }
  if (isValidSuiAddress(decenDriveShareLegacyPackageId)) {
    ids.add(decenDriveShareLegacyPackageId);
  }
  return [...ids];
}

async function resolvePackageForObject(objectId: string): Promise<string> {
  const client = getSuiClient();
  const response = await client.getObject({ id: objectId, options: { showType: true } });
  const objectType = response.data?.type;
  if (objectType?.includes("::decendrive::")) {
    const packageId = objectType.split("::")[0];
    if (isValidSuiAddress(packageId)) {
      return packageId;
    }
  }
  return decenDrivePackageId;
}

export type ContractExecutor = {
  executeTransaction: (tx: Transaction) => Promise<{ digest: string }>;
};

export type RegisterFileInput = {
  blobId: string;
  size: number;
  uploadedAt: number;
  encryptionKeyHash: string;
};

export type ShareFileInput = {
  fileObjectId: string;
  sharedWith: string;
  expiresAt: number;
  permissions?: number;
};

export type SendShareInvitationInput = {
  blobId: string;
  recipient: string;
  filename: string;
  mimeType: string;
  size: number;
  encryptionKeyHash: string;
  keyWrapper: string;
  permissions: number;
  expiresAt: number;
  createdAt: number;
  walrusObjectId?: string | null;
  fileObjectId?: string | null;
};

export type RevokeAccessInput = {
  fileObjectId: string;
  sharedWith: string;
};

export type AccessEntry = {
  address: string;
  expiresAt: number;
  revoked: boolean;
};

function isPackageConfigured() {
  return decenDrivePackageId !== PACKAGE_ID_PLACEHOLDER && isValidSuiAddress(decenDrivePackageId);
}

function ensurePackageConfigured() {
  if (!isPackageConfigured()) {
    throw new Error(
      "DecenDrive package ID is not configured. Set NEXT_PUBLIC_DECENDRIVE_PACKAGE_ID after deployment.",
    );
  }
}

function parseAccessList(raw: unknown): AccessEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      const value = entry as Record<string, unknown>;
      const fields = (value.fields ?? value) as Record<string, unknown>;
      const address = String(fields.address ?? fields.shared_with ?? "");
      const expiresAt = Number(fields.expires_at ?? 0);
      const revoked = Boolean(fields.revoked ?? false);

      if (!isValidSuiAddress(address)) {
        return null;
      }

      return {
        address,
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
        revoked,
      } satisfies AccessEntry;
    })
    .filter((entry): entry is AccessEntry => entry !== null);
}

export function appendRegisterFileCall(tx: Transaction, input: RegisterFileInput) {
  if (!isPackageConfigured()) {
    return false;
  }

  tx.moveCall({
    package: decenDrivePackageId,
    module: DECENDRIVE_MODULE_NAME,
    function: "register_file",
    arguments: [
      tx.pure.string(input.blobId),
      tx.pure.u64(BigInt(Math.max(0, Math.floor(input.size)))),
      tx.pure.u64(BigInt(Math.max(0, Math.floor(input.uploadedAt)))),
      tx.pure.string(input.encryptionKeyHash),
    ],
  });

  return true;
}

export async function registerFile(executor: ContractExecutor, input: RegisterFileInput) {
  ensurePackageConfigured();
  const tx = new Transaction();
  appendRegisterFileCall(tx, input);
  return executor.executeTransaction(tx);
}

export async function shareFile(
  executor: ContractExecutor,
  input: ShareFileInput & { fileSizeBytes: number },
) {
  ensurePackageConfigured();
  if (!isValidSuiAddress(input.sharedWith)) {
    throw new Error("Invalid share target address.");
  }

  const packageId = await resolvePackageForObject(input.fileObjectId);
  const tx = new Transaction();
  tx.moveCall({
    package: packageId,
    module: DECENDRIVE_MODULE_NAME,
    function: "share_file",
    arguments: [
      tx.object(input.fileObjectId),
      tx.pure.address(input.sharedWith),
      tx.pure.u64(BigInt(Math.max(0, Math.floor(input.expiresAt)))),
    ],
  });

  await appendTreasuryFee(tx, calculateShareFeeSui(input.fileSizeBytes));
  return executor.executeTransaction(tx);
}

export function appendSendShareInvitationCall(tx: Transaction, input: SendShareInvitationInput) {
  if (!isPackageConfigured()) {
    return false;
  }

  const walrusArg = input.walrusObjectId
    ? tx.pure.option("id", input.walrusObjectId)
    : tx.pure.option("id", null);
  const fileArg = input.fileObjectId
    ? tx.pure.option("id", input.fileObjectId)
    : tx.pure.option("id", null);

  tx.moveCall({
    package: decenDrivePackageId,
    module: DECENDRIVE_MODULE_NAME,
    function: "send_share_invitation",
    arguments: [
      tx.pure.string(input.blobId),
      tx.pure.address(input.recipient),
      tx.pure.string(input.filename),
      tx.pure.string(input.mimeType),
      tx.pure.u64(BigInt(Math.max(0, Math.floor(input.size)))),
      tx.pure.string(input.encryptionKeyHash),
      tx.pure.string(input.keyWrapper),
      tx.pure.u8(input.permissions),
      tx.pure.u64(BigInt(Math.max(0, Math.floor(input.expiresAt)))),
      tx.pure.u64(BigInt(Math.max(0, Math.floor(input.createdAt)))),
      walrusArg,
      fileArg,
    ],
  });

  return true;
}

export async function sendShareInvitation(executor: ContractExecutor, input: SendShareInvitationInput) {
  ensurePackageConfigured();
  const tx = new Transaction();
  appendSendShareInvitationCall(tx, input);
  await appendTreasuryFee(tx, calculateShareFeeSui(input.size));
  return executor.executeTransaction(tx);
}

export async function sendShareInvitationsBatch(
  executor: ContractExecutor,
  inputs: SendShareInvitationInput[],
) {
  ensurePackageConfigured();
  if (inputs.length === 0) {
    throw new Error("No share invitations to send.");
  }
  const tx = new Transaction();
  let added = 0;
  for (const input of inputs) {
    if (appendSendShareInvitationCall(tx, input)) {
      added += 1;
    }
  }
  if (added === 0) {
    throw new Error("Package is not configured for sharing.");
  }
  const totalSize = inputs.reduce((sum, entry) => sum + Math.max(0, entry.size), 0);
  await appendTreasuryFee(tx, calculateShareFeeSui(totalSize));
  return executor.executeTransaction(tx);
}

export async function acceptShareInvitation(
  executor: ContractExecutor,
  invitationObjectId: string,
  acceptedAt: number,
) {
  ensurePackageConfigured();
  const tx = new Transaction();
  tx.moveCall({
    package: decenDrivePackageId,
    module: DECENDRIVE_MODULE_NAME,
    function: "accept_share_invitation",
    arguments: [
      tx.object(invitationObjectId),
      tx.pure.u64(BigInt(Math.max(0, Math.floor(acceptedAt)))),
    ],
  });
  return executor.executeTransaction(tx);
}

export async function declineShareInvitation(executor: ContractExecutor, invitationObjectId: string) {
  ensurePackageConfigured();
  const tx = new Transaction();
  tx.moveCall({
    package: decenDrivePackageId,
    module: DECENDRIVE_MODULE_NAME,
    function: "decline_share_invitation",
    arguments: [tx.object(invitationObjectId)],
  });
  return executor.executeTransaction(tx);
}

export type UpsertMetadataInput = {
  fileObjectId: string;
  key: string;
  value: string;
};

export function appendUpsertMetadataKeyCall(
  tx: Transaction,
  packageId: string,
  input: UpsertMetadataInput,
) {
  tx.moveCall({
    package: packageId,
    module: DECENDRIVE_MODULE_NAME,
    function: "upsert_metadata_key",
    arguments: [
      tx.object(input.fileObjectId),
      tx.pure.string(input.key),
      tx.pure.string(input.value),
    ],
  });
}

export async function upsertFileMetadataKeys(
  executor: ContractExecutor,
  fileObjectId: string,
  entries: Array<{ key: string; value: string }>,
) {
  ensurePackageConfigured();
  if (entries.length === 0) {
    return { digest: "" };
  }
  const packageId = await resolvePackageForObject(fileObjectId);
  const tx = new Transaction();
  for (const entry of entries) {
    appendUpsertMetadataKeyCall(tx, packageId, {
      fileObjectId,
      key: entry.key,
      value: entry.value,
    });
  }
  return executor.executeTransaction(tx);
}

export async function moveFileToTrashOnChain(executor: ContractExecutor, fileObjectId: string) {
  ensurePackageConfigured();
  const packageId = await resolvePackageForObject(fileObjectId);
  const tx = new Transaction();
  tx.moveCall({
    package: packageId,
    module: DECENDRIVE_MODULE_NAME,
    function: "move_to_trash",
    arguments: [tx.object(fileObjectId)],
  });
  return executor.executeTransaction(tx);
}

export async function restoreFileFromTrashOnChain(executor: ContractExecutor, fileObjectId: string) {
  ensurePackageConfigured();
  const packageId = await resolvePackageForObject(fileObjectId);
  const tx = new Transaction();
  tx.moveCall({
    package: packageId,
    module: DECENDRIVE_MODULE_NAME,
    function: "restore_from_trash",
    arguments: [tx.object(fileObjectId)],
  });
  return executor.executeTransaction(tx);
}

export async function moveFilesToTrashOnChainBatch(
  executor: ContractExecutor,
  fileObjectIds: string[],
) {
  ensurePackageConfigured();
  const unique = [...new Set(fileObjectIds)].filter(Boolean);
  if (unique.length === 0) {
    return { digest: "" };
  }
  const tx = new Transaction();
  for (const fileObjectId of unique) {
    const packageId = await resolvePackageForObject(fileObjectId);
    tx.moveCall({
      package: packageId,
      module: DECENDRIVE_MODULE_NAME,
      function: "move_to_trash",
      arguments: [tx.object(fileObjectId)],
    });
  }
  return executor.executeTransaction(tx);
}

export async function restoreFilesFromTrashOnChainBatch(
  executor: ContractExecutor,
  fileObjectIds: string[],
) {
  ensurePackageConfigured();
  const unique = [...new Set(fileObjectIds)].filter(Boolean);
  if (unique.length === 0) {
    return { digest: "" };
  }
  const tx = new Transaction();
  for (const fileObjectId of unique) {
    const packageId = await resolvePackageForObject(fileObjectId);
    tx.moveCall({
      package: packageId,
      module: DECENDRIVE_MODULE_NAME,
      function: "restore_from_trash",
      arguments: [tx.object(fileObjectId)],
    });
  }
  return executor.executeTransaction(tx);
}

export async function createDriveProfile(executor: ContractExecutor) {
  ensurePackageConfigured();
  const tx = new Transaction();
  tx.moveCall({
    package: decenDrivePackageId,
    module: DECENDRIVE_MODULE_NAME,
    function: "create_drive_profile",
    arguments: [],
  });
  return executor.executeTransaction(tx);
}

export async function updateDriveStateOnProfile(
  executor: ContractExecutor,
  profileObjectId: string,
  input: { stateBlobId: string; stateVersion: number; updatedAt: number },
) {
  ensurePackageConfigured();
  const tx = new Transaction();
  tx.moveCall({
    package: decenDrivePackageId,
    module: DECENDRIVE_MODULE_NAME,
    function: "update_drive_state",
    arguments: [
      tx.object(profileObjectId),
      tx.pure.string(input.stateBlobId),
      tx.pure.u64(BigInt(Math.max(0, input.stateVersion))),
      tx.pure.u64(BigInt(Math.max(0, Math.floor(input.updatedAt)))),
    ],
  });
  return executor.executeTransaction(tx);
}

export async function revokeAccess(executor: ContractExecutor, input: RevokeAccessInput) {
  ensurePackageConfigured();
  if (!isValidSuiAddress(input.sharedWith)) {
    throw new Error("Invalid address to revoke.");
  }

  const packageId = await resolvePackageForObject(input.fileObjectId);
  const tx = new Transaction();
  tx.moveCall({
    package: packageId,
    module: DECENDRIVE_MODULE_NAME,
    function: "revoke_access",
    arguments: [tx.object(input.fileObjectId), tx.pure.address(input.sharedWith)],
  });

  return executor.executeTransaction(tx);
}

export type DriveFileView = {
  objectId: string;
  name: string;
  size: number;
  date: string;
  blobId: string;
  walrusUrl: string;
  owner: string;
  isOwner: boolean;
  canAccess: boolean;
  encryptionKeyHash: string;
  inTrash?: boolean;
  lastAccessed?: number;
  accessList: {
    address: string;
    expiresAt: number;
    expiresInDays: number;
    revoked: boolean;
  }[];
};

async function fetchFiles(url: string): Promise<DriveFileView[]> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load files from Sui mainnet.");
  }
  const payload = (await response.json()) as { files?: DriveFileView[] };
  return payload.files ?? [];
}

/**
 * Owned File objects for the connected wallet (getOwnedObjects on the server).
 */
export async function fetchOwnedFiles(owner: string): Promise<DriveFileView[]> {
  if (!isValidSuiAddress(owner)) {
    return [];
  }
  return fetchFiles(`/api/files/owned?owner=${owner}`);
}

export async function checkAccess(fileObjectId: string, accountAddress: string) {
  if (!isValidSuiAddress(accountAddress)) {
    throw new Error("Invalid account address.");
  }

  const client = getSuiClient();
  const response = await client.getObject({
    id: fileObjectId,
    options: { showContent: true },
  });

  const content = response.data?.content as Record<string, unknown> | undefined;
  const fields = (content?.fields ?? {}) as Record<string, unknown>;

  const owner = String(fields.owner ?? "");
  const accessEntries = parseAccessList(fields.access_list);
  const nowMs = Date.now();

  if (owner === accountAddress) {
    return { accessible: true, owner, accessEntries };
  }

  const matched = accessEntries.find((entry) => entry.address === accountAddress);
  if (!matched) {
    return { accessible: false, owner, accessEntries };
  }

  const notExpired = matched.expiresAt === 0 || matched.expiresAt > nowMs;
  return {
    accessible: !matched.revoked && notExpired,
    owner,
    accessEntries,
  };
}
