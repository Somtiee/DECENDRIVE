import type { OwnedFileView } from "@/components/drive/types";
import { isHiddenFromDrive } from "@/lib/drive/hidden-blobs";
import { isSystemWalrusBlob } from "@/lib/drive/system-blobs";

/** Show storage rent UI when this many days or fewer remain. */
export const STORAGE_RENT_WARNING_DAYS = 30;

export function computeStorageExpiresAtMs(
  storageEndEpoch: number,
  epochInfo: { firstEpochStartMs: number; epochDurationMs: number },
) {
  return epochInfo.firstEpochStartMs + storageEndEpoch * epochInfo.epochDurationMs;
}

export function estimateStorageDaysLeft(epochsUntilExpiry: number, epochDurationMs: number) {
  if (!Number.isFinite(epochsUntilExpiry) || epochsUntilExpiry <= 0) {
    return 0;
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  const totalMs = epochsUntilExpiry * epochDurationMs;
  return Math.max(1, Math.ceil(totalMs / msPerDay));
}

export function isExpiredRentFile(file: OwnedFileView) {
  if (!file.isOwner || !file.isWalrusBlob || file.storageEndEpoch == null) {
    return false;
  }
  if (isSystemWalrusBlob({ name: file.name, purpose: file.metadata?.purpose })) {
    return false;
  }
  if (isHiddenFromDrive(file.blobId)) {
    return false;
  }
  if (file.storageExpiresAtMs) {
    return Date.now() >= file.storageExpiresAtMs;
  }
  return Boolean(file.storageExpired || (file.epochsUntilExpiry != null && file.epochsUntilExpiry <= 0));
}

export function selectExpiredRentFiles(files: OwnedFileView[]) {
  return files.filter(isExpiredRentFile);
}
