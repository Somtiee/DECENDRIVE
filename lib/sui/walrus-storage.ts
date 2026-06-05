import { Transaction } from "@mysten/sui/transactions";
import { MAINNET_WALRUS_PACKAGE_CONFIG, WalrusClient } from "@mysten/walrus";

import { getSuiClient } from "@/lib/sui/client";
import { buildSuiToWalSwapTransaction } from "@/lib/sui/swap";
import { getSuiBalance, getWALBalance } from "@/lib/sui/wallet";

/** Initial prepaid storage period on upload. */
export const WALRUS_INITIAL_EPOCHS = 5;

/** Epochs added on each auto-renewal. */
export const WALRUS_EXTEND_EPOCHS = 5;

/** Renew when this many epochs or fewer remain. */
export const WALRUS_RENEWAL_BUFFER_EPOCHS = 2;

export type WalrusEpochInfo = {
  currentEpoch: number;
  /** Approximate epoch length in milliseconds (from on-chain staking state). */
  epochDurationMs: number;
  /** Walrus epoch 0 start (ms since epoch), used for exact expiry timestamps. */
  firstEpochStartMs: number;
};

export type WalrusBlobStorage = {
  startEpoch: number;
  endEpoch: number;
  storageSize: number;
};

type WalletExecutor = {
  address: string;
  executeTransaction: (transaction: Transaction) => Promise<{ digest: string }>;
};

function getWalrusClient() {
  return new WalrusClient({
    network: "mainnet",
    packageConfig: MAINNET_WALRUS_PACKAGE_CONFIG,
    suiClient: getSuiClient(),
  });
}

/** Parse nested Walrus `Storage` fields from a Sui object content payload. */
export function parseWalrusBlobStorage(fields: Record<string, unknown>): WalrusBlobStorage | null {
  const storage = fields["storage"] as Record<string, unknown> | undefined;
  const storageFields = (storage?.fields ?? storage) as Record<string, unknown> | undefined;
  if (!storageFields) {
    return null;
  }

  const endEpoch = Number(storageFields["end_epoch"] ?? storageFields["endEpoch"]);
  const startEpoch = Number(storageFields["start_epoch"] ?? storageFields["startEpoch"]);
  const storageSize = Number(storageFields["storage_size"] ?? storageFields["storageSize"]);

  if (!Number.isFinite(endEpoch) || endEpoch <= 0) {
    return null;
  }

  return {
    startEpoch: Number.isFinite(startEpoch) ? startEpoch : 0,
    endEpoch,
    storageSize: Number.isFinite(storageSize) && storageSize > 0 ? storageSize : 0,
  };
}

export async function fetchWalrusEpochInfo(): Promise<WalrusEpochInfo> {
  const walrusClient = getWalrusClient();
  const staking = await walrusClient.stakingState();
  const epochDurationMs = Number(staking.epoch_duration);
  const firstEpochStartMs = Number(staking.first_epoch_start);
  const fallbackEpochMs = 14 * 24 * 60 * 60 * 1000;
  return {
    currentEpoch: staking.epoch,
    epochDurationMs: Number.isFinite(epochDurationMs) && epochDurationMs > 0 ? epochDurationMs : fallbackEpochMs,
    firstEpochStartMs:
      Number.isFinite(firstEpochStartMs) && firstEpochStartMs > 0 ? firstEpochStartMs : Date.now(),
  };
}

export function epochsUntilExpiry(endEpoch: number, currentEpoch: number) {
  return Math.max(0, endEpoch - currentEpoch);
}

export function shouldRenewWalrusStorage(
  endEpoch: number,
  currentEpoch: number,
  bufferEpochs = WALRUS_RENEWAL_BUFFER_EPOCHS,
) {
  return epochsUntilExpiry(endEpoch, currentEpoch) <= bufferEpochs;
}

export async function estimateWalForBlobExtensions(
  blobs: Array<{ storageSize: number }>,
  epochs: number,
): Promise<number> {
  if (blobs.length === 0 || epochs <= 0) {
    return 0;
  }

  const walrusClient = getWalrusClient();
  let totalMist = 0n;
  for (const blob of blobs) {
    const size = blob.storageSize > 0 ? blob.storageSize : 1024;
    const { storageCost } = await walrusClient.storageCost(size, epochs);
    totalMist += storageCost;
  }
  return Number(totalMist) / 1_000_000_000;
}

export async function ensureWalBalanceForExtensions(
  wallet: WalletExecutor,
  requiredWal: number,
): Promise<{ swapPerformed: boolean; swapDigest?: string }> {
  if (requiredWal <= 0) {
    return { swapPerformed: false };
  }

  const walBalance = await getWALBalance(wallet.address);
  const missingWal = Math.max(0, requiredWal - walBalance.totalWal);
  if (missingWal <= 0) {
    return { swapPerformed: false };
  }

  const requiredWalMist = BigInt(Math.ceil(missingWal * 1_000_000_000));
  const swap = await buildSuiToWalSwapTransaction({ requiredWalMist });
  const suiBalance = await getSuiBalance(wallet.address);
  if (BigInt(suiBalance.totalMist) < swap.estimatedSuiInMist) {
    throw new Error("Add more SUI to renew Walrus storage (WAL balance too low).");
  }

  const swapResult = await wallet.executeTransaction(swap.txb);
  const postSwapWal = await getWALBalance(wallet.address);
  if (postSwapWal.totalWal + 0.000001 < requiredWal) {
    throw new Error("Storage funding is still pending. Please retry renewal in a moment.");
  }

  return { swapPerformed: true, swapDigest: swapResult.digest };
}

/** Batch-extend multiple Walrus blobs in a single wallet transaction. */
export async function buildExtendBlobsTransaction(
  blobObjectIds: string[],
  epochs: number,
): Promise<Transaction> {
  const unique = [...new Set(blobObjectIds)].filter(Boolean);
  if (unique.length === 0) {
    throw new Error("No Walrus blobs to extend.");
  }
  if (epochs <= 0) {
    throw new Error("Extension epochs must be positive.");
  }

  const walrusClient = getWalrusClient();
  const tx = new Transaction();
  for (const blobObjectId of unique) {
    await walrusClient.extendBlobTransaction({
      blobObjectId,
      epochs,
      transaction: tx,
    });
  }
  return tx;
}
