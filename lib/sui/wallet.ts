import { isValidSuiAddress } from "@mysten/sui/utils";

import { getSuiClient } from "./client";

export const WAL_COIN_TYPE =
  "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL";

export type WalletEncryptionSigner = (message: Uint8Array) => Promise<Uint8Array>;

type DerivedWalletEncryptionKey = {
  keyBytes: Uint8Array<ArrayBuffer>;
  keyHashHex: string;
};

const derivedEncryptionKeyCache = new Map<string, Promise<DerivedWalletEncryptionKey>>();

export function clearWalletEncryptionKeyCache(ownerAddress?: string) {
  if (ownerAddress) {
    derivedEncryptionKeyCache.delete(ownerAddress.toLowerCase());
    return;
  }
  derivedEncryptionKeyCache.clear();
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function estimateWalRequired(fileSizeBytes: number) {
  // Conservative estimate for storage reservation + Walrus write overhead.
  return 0.05 + (fileSizeBytes / 1_000_000_000) * 0.25;
}

export function formatWalAmount(amount: number) {
  return amount.toFixed(3);
}

export async function getWALBalance(address: string) {
  if (!isValidSuiAddress(address)) {
    throw new Error("Invalid wallet address for WAL balance check.");
  }

  const client = getSuiClient();
  const balance = await client.getBalance({
    owner: address,
    coinType: WAL_COIN_TYPE,
  });

  const totalMist = Number(balance.totalBalance ?? 0);
  const totalWal = totalMist / 1_000_000_000;

  return {
    totalMist,
    totalWal,
  };
}

export async function getSuiBalance(address: string) {
  if (!isValidSuiAddress(address)) {
    throw new Error("Invalid wallet address for SUI balance check.");
  }

  const client = getSuiClient();
  const balance = await client.getBalance({
    owner: address,
  });

  const totalMist = Number(balance.totalBalance ?? 0);
  const totalSui = totalMist / 1_000_000_000;

  return {
    totalMist,
    totalSui,
  };
}

async function deriveWalletEncryptionKeyOnce(
  ownerAddress: string,
  signer: WalletEncryptionSigner,
): Promise<DerivedWalletEncryptionKey> {
  const message = new TextEncoder().encode(
    `DecenDrive::SealFallback::${ownerAddress.toLowerCase()}::Mainnet`,
  );

  const signatureBytes = await signer(message);
  const digestInput = Uint8Array.from(signatureBytes);
  const hashBuffer = await crypto.subtle.digest("SHA-256", digestInput);
  const keyBytes = Uint8Array.from(new Uint8Array(hashBuffer)) as Uint8Array<ArrayBuffer>;

  return {
    keyBytes,
    keyHashHex: toHex(keyBytes),
  };
}

/** Derives the wallet encryption key. Signs at most once per wallet per browser session. */
export async function deriveWalletEncryptionKey(
  ownerAddress: string,
  signer: WalletEncryptionSigner,
) {
  const cacheKey = ownerAddress.toLowerCase();
  let pending = derivedEncryptionKeyCache.get(cacheKey);
  if (!pending) {
    pending = deriveWalletEncryptionKeyOnce(ownerAddress, signer).catch((error) => {
      derivedEncryptionKeyCache.delete(cacheKey);
      throw error;
    });
    derivedEncryptionKeyCache.set(cacheKey, pending);
  }
  return pending;
}
