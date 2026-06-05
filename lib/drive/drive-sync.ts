"use client";

import { toast } from "sonner";

import {
  DRIVE_STATE_SCHEMA_VERSION,
  emptyDriveState,
  type DriveStateSnapshot,
} from "@/lib/drive/drive-state";
import {
  createDriveProfile,
  updateDriveStateOnProfile,
  upsertFileMetadataKeys,
} from "@/lib/sui/contract";
import {
  DRIVE_ANCHOR_KEY,
  DRIVE_STATE_BLOB_KEY,
  DRIVE_STATE_VERSION_KEY,
} from "@/lib/sui/parse-metadata";
import { deriveWalletEncryptionKey } from "@/lib/sui/wallet";
import type { WalletEncryptionSigner } from "@/lib/sui/wallet";
import { hideBlobFromDrive } from "@/lib/drive/hidden-blobs";
import { persistEncryptedBytesToWalrus } from "@/lib/sui/walrus";

export const DRIVE_SYNC_EVENT = "decendrive:drive-sync-changed";

export type DriveAnchor = {
  profileObjectId?: string;
  fileObjectId?: string;
  stateBlobId: string;
  stateVersion: number;
};

type OwnedFileWithMeta = {
  objectId: string;
  blobId: string;
  name?: string;
  mimeType?: string;
  isWalrusBlob?: boolean;
  metadata?: Record<string, string>;
};

function parseFileAnchor(files: OwnedFileWithMeta[]): DriveAnchor | null {
  for (const file of files) {
    const metadata = file.metadata ?? {};
    if (metadata[DRIVE_ANCHOR_KEY] === "1" && metadata[DRIVE_STATE_BLOB_KEY]) {
      return {
        fileObjectId: file.objectId,
        stateBlobId: metadata[DRIVE_STATE_BLOB_KEY],
        stateVersion: Number(metadata[DRIVE_STATE_VERSION_KEY] ?? 0),
      };
    }
  }
  for (const file of files) {
    const metadata = file.metadata ?? {};
    if (metadata[DRIVE_STATE_BLOB_KEY]) {
      return {
        fileObjectId: file.objectId,
        stateBlobId: metadata[DRIVE_STATE_BLOB_KEY],
        stateVersion: Number(metadata[DRIVE_STATE_VERSION_KEY] ?? 0),
      };
    }
  }
  return null;
}

function pickAnchorFile(files: OwnedFileWithMeta[]): OwnedFileWithMeta | null {
  const decendriveFiles = files.filter((file) => !file.isWalrusBlob);
  if (decendriveFiles.length > 0) {
    return decendriveFiles[0];
  }
  return files[0] ?? null;
}

async function decryptManifestBytes(
  bytes: Uint8Array,
  owner: string,
  signer: WalletEncryptionSigner,
): Promise<DriveStateSnapshot | null> {
  try {
    const { keyBytes } = await deriveWalletEncryptionKey(owner, signer);
    if (bytes.length < 13) {
      return null;
    }
    const iv = bytes.slice(0, 12);
    const cipher = bytes.slice(12);
    const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
    const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, cipher);
    const parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(plainBuffer))) as DriveStateSnapshot;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return { ...emptyDriveState(), ...parsed, version: DRIVE_STATE_SCHEMA_VERSION };
  } catch {
    return null;
  }
}

async function encryptManifest(snapshot: DriveStateSnapshot, owner: string, signer: WalletEncryptionSigner) {
  const { keyBytes } = await deriveWalletEncryptionKey(owner, signer);
  const plain = new TextEncoder().encode(JSON.stringify(snapshot));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, plain);
  const cipher = new Uint8Array(cipherBuffer);
  const payload = new Uint8Array(iv.length + cipher.length);
  payload.set(iv, 0);
  payload.set(cipher, iv.length);
  return payload;
}

export async function fetchOwnedFilesWithMetadata(owner: string): Promise<OwnedFileWithMeta[]> {
  const response = await fetch(`/api/files/owned?owner=${encodeURIComponent(owner)}&page=1&pageSize=200`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as {
    files?: Array<{
      objectId: string;
      blobId: string;
      name?: string;
      mimeType?: string;
      isWalrusBlob?: boolean;
      metadata?: Record<string, string>;
    }>;
  };
  return payload.files ?? [];
}

async function fetchDriveProfileAnchor(owner: string): Promise<DriveAnchor | null> {
  const response = await fetch(`/api/files/drive-profile?owner=${encodeURIComponent(owner)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as {
    profile?: {
      objectId: string;
      stateBlobId: string;
      stateVersion: number;
    } | null;
  };
  if (!payload.profile?.stateBlobId) {
    return null;
  }
  return {
    profileObjectId: payload.profile.objectId,
    stateBlobId: payload.profile.stateBlobId,
    stateVersion: payload.profile.stateVersion,
  };
}

export async function resolveDriveAnchor(owner: string): Promise<DriveAnchor | null> {
  const profileAnchor = await fetchDriveProfileAnchor(owner);
  if (profileAnchor?.stateBlobId) {
    return profileAnchor;
  }
  const files = await fetchOwnedFilesWithMetadata(owner);
  return parseFileAnchor(files);
}

export async function loadDriveStateFromWalrus(input: {
  owner: string;
  signer: WalletEncryptionSigner;
}): Promise<{ snapshot: DriveStateSnapshot | null; anchor: DriveAnchor | null }> {
  const anchor = await resolveDriveAnchor(input.owner);
  if (!anchor?.stateBlobId) {
    return { snapshot: null, anchor };
  }

  const response = await fetch(`/api/blob?blobId=${encodeURIComponent(anchor.stateBlobId)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return { snapshot: null, anchor };
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const snapshot = await decryptManifestBytes(bytes, input.owner, input.signer);
  return { snapshot, anchor };
}

async function ensureDriveProfile(
  owner: string,
  executeTransaction: (tx: import("@mysten/sui/transactions").Transaction) => Promise<{ digest: string }>,
): Promise<string> {
  const existing = await fetchDriveProfileAnchor(owner);
  if (existing?.profileObjectId) {
    return existing.profileObjectId;
  }
  await createDriveProfile({ executeTransaction });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    const created = await fetchDriveProfileAnchor(owner);
    if (created?.profileObjectId) {
      return created.profileObjectId;
    }
  }
  throw new Error("Could not create DriveProfile on Sui. Upgrade the contract (npm run upgrade:contract) and retry.");
}

export async function pushDriveStateToWalrus(input: {
  owner: string;
  snapshot: DriveStateSnapshot;
  signer: WalletEncryptionSigner;
  executeTransaction: (tx: import("@mysten/sui/transactions").Transaction) => Promise<{ digest: string }>;
}) {
  const files = await fetchOwnedFilesWithMetadata(input.owner);
  const anchor = await resolveDriveAnchor(input.owner);
  const nextVersion = (anchor?.stateVersion ?? 0) + 1;
  const snapshot: DriveStateSnapshot = {
    ...input.snapshot,
    version: DRIVE_STATE_SCHEMA_VERSION,
    updatedAt: Date.now(),
  };

  const encrypted = await encryptManifest(snapshot, input.owner, input.signer);
  const persisted = await persistEncryptedBytesToWalrus(
    {
      address: input.owner,
      executeTransaction: input.executeTransaction,
    },
    encrypted,
    {
      label: "drive-state",
      size: encrypted.length,
    },
  );

  let profileUpdated = false;
  try {
    const profileId = await ensureDriveProfile(input.owner, input.executeTransaction);
    await updateDriveStateOnProfile(
      { executeTransaction: input.executeTransaction },
      profileId,
      {
        stateBlobId: persisted.blobId,
        stateVersion: nextVersion,
        updatedAt: snapshot.updatedAt,
      },
    );
    profileUpdated = true;
  } catch {
    // Fallback: anchor on File metadata until contract upgrade
    const anchorFile = pickAnchorFile(files);
    if (!anchorFile) {
      throw new Error("Upload at least one file before syncing drive layout.");
    }
    await upsertFileMetadataKeys(
      { executeTransaction: input.executeTransaction },
      anchorFile.objectId,
      [
        { key: DRIVE_ANCHOR_KEY, value: "1" },
        { key: DRIVE_STATE_BLOB_KEY, value: persisted.blobId },
        { key: DRIVE_STATE_VERSION_KEY, value: String(nextVersion) },
      ],
    );
  }

  hideBlobFromDrive(persisted.blobId, { silent: true });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DRIVE_SYNC_EVENT));
  }

  return { blobId: persisted.blobId, version: nextVersion, profileUpdated };
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSnapshot: DriveStateSnapshot | null = null;

export function scheduleDriveStatePush(snapshot: DriveStateSnapshot, delayMs = 10_000) {
  pendingSnapshot = snapshot;
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("decendrive:drive-sync-pending", { detail: pendingSnapshot }),
      );
    }
  }, delayMs);
}

export function notifyDriveSyncSuccess() {
  toast.success("Drive layout synced to Walrus + Sui — survives browser clears.", { duration: 4000 });
}
