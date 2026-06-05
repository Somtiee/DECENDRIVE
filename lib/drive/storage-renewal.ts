"use client";

import type { OwnedFileView } from "@/components/drive/types";
import { isHiddenFromDrive } from "@/lib/drive/hidden-blobs";
import { isSystemWalrusBlob } from "@/lib/drive/system-blobs";
import { readWalletJson, writeWalletJson } from "@/lib/drive/wallet-storage";
import {
  WALRUS_EXTEND_EPOCHS,
  WALRUS_RENEWAL_BUFFER_EPOCHS,
  buildExtendBlobsTransaction,
  ensureWalBalanceForExtensions,
  estimateWalForBlobExtensions,
  shouldRenewWalrusStorage,
} from "@/lib/sui/walrus-storage";
import type { Transaction } from "@mysten/sui/transactions";

const RENEWAL_CACHE_KEY = "decendrive:storage-renewal-cache";

type RenewalCacheEntry = {
  extendedAt: number;
  previousEndEpoch: number;
  addedEpochs: number;
};

type RenewalCache = Record<string, RenewalCacheEntry>;

type WalletExecutor = {
  address: string;
  executeTransaction: (transaction: Transaction) => Promise<{ digest: string }>;
};

export type RenewalCandidate = {
  objectId: string;
  blobId: string;
  name: string;
  storageEndEpoch: number;
  storageSize: number;
};

function readRenewalCache(): RenewalCache {
  return readWalletJson<RenewalCache>(RENEWAL_CACHE_KEY, {});
}

function writeRenewalCache(cache: RenewalCache) {
  writeWalletJson(RENEWAL_CACHE_KEY, cache);
}

export function toRenewalCandidate(file: OwnedFileView): RenewalCandidate | null {
  if (!file.isOwner || !file.isWalrusBlob || !file.storageEndEpoch) {
    return null;
  }
  if (isSystemWalrusBlob({ name: file.name, purpose: file.metadata?.purpose })) {
    return null;
  }
  if (isHiddenFromDrive(file.blobId)) {
    return null;
  }
  return {
    objectId: file.objectId,
    blobId: file.blobId,
    name: file.name,
    storageEndEpoch: file.storageEndEpoch,
    storageSize: file.storageSize ?? file.size,
  };
}

export function canManuallyRenewStorage(file: OwnedFileView) {
  return toRenewalCandidate(file) !== null;
}

function wasRecentlyRenewed(objectId: string, currentEndEpoch: number) {
  const entry = readRenewalCache()[objectId];
  if (!entry) {
    return false;
  }
  const expectedMinEnd = entry.previousEndEpoch + entry.addedEpochs;
  return entry.extendedAt > Date.now() - 6 * 60 * 60 * 1000 && currentEndEpoch >= expectedMinEnd - 1;
}

export function selectStorageRenewalCandidates(
  files: OwnedFileView[],
  currentEpoch: number,
): RenewalCandidate[] {
  const candidates: RenewalCandidate[] = [];

  for (const file of files) {
    const candidate = toRenewalCandidate(file);
    if (!candidate) {
      continue;
    }
    if (!shouldRenewWalrusStorage(file.storageEndEpoch!, currentEpoch, WALRUS_RENEWAL_BUFFER_EPOCHS)) {
      continue;
    }
    if (wasRecentlyRenewed(file.objectId, file.storageEndEpoch!)) {
      continue;
    }
    candidates.push(candidate);
  }

  return candidates;
}

export async function renewWalrusStorageBatch(input: {
  wallet: WalletExecutor;
  candidates: RenewalCandidate[];
  epochs?: number;
}) {
  const epochs = input.epochs ?? WALRUS_EXTEND_EPOCHS;
  if (input.candidates.length === 0) {
    return { renewed: 0, digest: "" };
  }

  const requiredWal = await estimateWalForBlobExtensions(
    input.candidates.map((file) => ({ storageSize: file.storageSize })),
    epochs,
  );
  await ensureWalBalanceForExtensions(input.wallet, requiredWal);

  const tx = await buildExtendBlobsTransaction(
    input.candidates.map((file) => file.objectId),
    epochs,
  );
  const result = await input.wallet.executeTransaction(tx);

  const cache = readRenewalCache();
  const now = Date.now();
  for (const file of input.candidates) {
    cache[file.objectId] = {
      extendedAt: now,
      previousEndEpoch: file.storageEndEpoch,
      addedEpochs: epochs,
    };
  }
  writeRenewalCache(cache);

  return { renewed: input.candidates.length, digest: result.digest };
}
