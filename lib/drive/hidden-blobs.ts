"use client";

import { FILE_INDEX_EVENT } from "@/lib/drive/file-metadata";
import { readWalletJson, writeWalletJson } from "@/lib/drive/wallet-storage";

const HIDDEN_BLOBS_KEY = "decendrive:hidden-blobs";
const LEGACY_DELETED_KEY = "decendrive:deleted";

function notifyIndexChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FILE_INDEX_EVENT));
  }
}

export function getHiddenBlobIds(): string[] {
  return readWalletJson<string[]>(HIDDEN_BLOBS_KEY, []);
}

export function isHiddenFromDrive(blobId: string): boolean {
  return getHiddenBlobIds().includes(blobId);
}

export function hideBlobFromDrive(blobId: string, options?: { silent?: boolean }) {
  if (!blobId) {
    return;
  }
  const hidden = new Set(getHiddenBlobIds());
  if (hidden.has(blobId)) {
    return;
  }
  hidden.add(blobId);
  writeWalletJson(HIDDEN_BLOBS_KEY, Array.from(hidden));
  removeFromLegacyDeletedList(blobId);
  if (!options?.silent) {
    notifyIndexChanged();
  }
}

export function unhideBlobFromDrive(blobId: string) {
  if (!blobId) {
    return;
  }
  const next = getHiddenBlobIds().filter((id) => id !== blobId);
  if (next.length === getHiddenBlobIds().length) {
    return;
  }
  writeWalletJson(HIDDEN_BLOBS_KEY, next);
  notifyIndexChanged();
}

function removeFromLegacyDeletedList(blobId: string) {
  const legacy = readWalletJson<string[]>(LEGACY_DELETED_KEY, []);
  if (!legacy.includes(blobId)) {
    return;
  }
  writeWalletJson(
    LEGACY_DELETED_KEY,
    legacy.filter((id) => id !== blobId),
  );
}
