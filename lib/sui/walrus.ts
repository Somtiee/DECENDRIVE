import { toHex } from "@mysten/bcs";
import { SealClient } from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress } from "@mysten/sui/utils";
import { MAINNET_WALRUS_PACKAGE_CONFIG, WalrusClient } from "@mysten/walrus";

import { appendRegisterFileCall } from "./contract";
import { getSuiClient } from "./client";
import {
  appendTreasuryFee,
  calculateDynamicFeeSui,
  toPremiumFeeLabel,
} from "./fees";
import { buildSuiToWalSwapTransaction, estimateAutoSwapSui } from "./swap";
import {
  deriveWalletEncryptionKey,
  estimateWalRequired,
  getSuiBalance,
  getWALBalance,
  type WalletEncryptionSigner,
} from "./wallet";
import { WALRUS_INITIAL_EPOCHS } from "./walrus-storage";

export const WALRUS_AGGREGATOR_URL = "https://aggregator.walrus-mainnet.walrus.space";
export const WALRUS_RELAY_HOST = "https://upload-relay.mainnet.walrus.space";
const DEFAULT_SEAL_PACKAGE_ID = "0x1";
const WALRUS_REQUEST_TIMEOUT_MS = 120_000;
const WALRUS_UPLOAD_RETRY_ATTEMPTS = 3;
const WALRUS_RETRY_BASE_DELAY_MS = 1200;

type WalletExecutor = {
  address: string;
  executeTransaction: (transaction: Transaction) => Promise<{ digest: string }>;
};

type SealEncryptionResult = {
  encryptedBlob: Uint8Array;
  keyHashHex: string;
  mode: "seal" | "local-fallback";
};

type PreparedWalrusUpload = {
  blobId: string;
  proof: string;
  unencodedSize: number;
  _flow: ReturnType<WalrusClient["writeBlobFlow"]>;
};

type RegisterMetadata = {
  name: string;
  size: number;
  mimeType: string;
  owner: string;
  expiresAtEpoch?: number;
  encryptionKeyHash: string;
  upload: PreparedWalrusUpload;
};

export type UploadedFileRecord = {
  name: string;
  size: number;
  date: string;
  blobId: string;
  walrusUrl: string;
  digest: string;
};

type StoragePreparationResult = {
  swapPerformed: boolean;
  swapDigest?: string;
};

type DownloadAndDecryptInput = {
  blobId: string;
  filename: string;
  owner: string;
  encryptionKeyHash: string;
  signer: WalletEncryptionSigner;
};

type EncryptOptions = {
  signer?: WalletEncryptionSigner;
};

function getWalrusClient() {
  // Walrus writes are orchestrated through production relay + aggregator for reliability on mainnet.
  return new WalrusClient({
    network: "mainnet",
    packageConfig: MAINNET_WALRUS_PACKAGE_CONFIG,
    suiClient: getSuiClient(),
    storageNodeClientOptions: {
      timeout: WALRUS_REQUEST_TIMEOUT_MS,
    },
    uploadRelay: {
      host: WALRUS_RELAY_HOST,
      timeout: WALRUS_REQUEST_TIMEOUT_MS,
      // Relay requires tip-verification metadata; max is in MIST (0.15 SUI cap).
      sendTip: {
        max: 150_000_000,
      },
    },
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableWalrusError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("429") ||
    message.includes("503") ||
    message.includes("blob object not found") ||
    message.includes("transaction effects")
  );
}

function getSealClient() {
  const objectIds = (process.env.NEXT_PUBLIC_SEAL_KEY_SERVER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (objectIds.length < 1) {
    return null;
  }

  const serverConfigs = objectIds.map((objectId) => ({
    objectId,
    weight: 1,
    aggregatorUrl: process.env.NEXT_PUBLIC_SEAL_AGGREGATOR_URL,
  }));

  return new SealClient({
    suiClient: getSuiClient(),
    serverConfigs,
    verifyKeyServers: true,
  });
}

export { calculateDynamicFeeSui, calculateShareFeeSui, toPremiumFeeLabel } from "./fees";

export function estimateAutoConvertedStorageSui(fileSizeBytes: number) {
  const requiredWal = estimateWalRequired(fileSizeBytes);
  // Quote-free estimation for UI. Execution still relies on live Cetus routing.
  return estimateAutoSwapSui(requiredWal) * 1.15;
}

export function estimateTotalSuiForUpload(fileSizeBytes: number) {
  return calculateDynamicFeeSui(fileSizeBytes) + estimateAutoConvertedStorageSui(fileSizeBytes);
}

async function localEncrypt(plainText: Uint8Array) {
  const plainBytes = Uint8Array.from(plainText);
  const key = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
  const cipherBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    cryptoKey,
    plainBytes,
  );

  const cipherText = new Uint8Array(cipherBuffer);
  const payload = new Uint8Array(iv.length + cipherText.length);
  payload.set(iv, 0);
  payload.set(cipherText, iv.length);
  const keyHashBuffer = await crypto.subtle.digest("SHA-256", key);
  const keyHashHex = toHex(new Uint8Array(keyHashBuffer));

  return {
    encryptedBlob: payload,
    keyHashHex,
    mode: "local-fallback" as const,
  };
}

async function localEncryptWithWalletSigner(
  plainText: Uint8Array,
  ownerAddress: string,
  signer: WalletEncryptionSigner,
) {
  const plainBytes = Uint8Array.from(plainText);
  const { keyBytes, keyHashHex } = await deriveWalletEncryptionKey(ownerAddress, signer);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const cipherBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    cryptoKey,
    plainBytes,
  );

  const cipherText = new Uint8Array(cipherBuffer);
  const payload = new Uint8Array(iv.length + cipherText.length);
  payload.set(iv, 0);
  payload.set(cipherText, iv.length);

  return {
    encryptedBlob: payload,
    keyHashHex,
    mode: "local-fallback" as const,
  };
}

export async function encryptFileWithSeal(
  file: File,
  ownerAddress: string,
  options?: EncryptOptions,
): Promise<SealEncryptionResult> {
  if (!isValidSuiAddress(ownerAddress)) {
    throw new Error("Owner address must be a valid Sui address.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sealClient = getSealClient();

  // Seal keeps encryption keys recoverable only via authorized key servers, which is critical for
  // user-controlled privacy in a decentralized storage system.
  if (sealClient) {
    const sealResult = await sealClient.encrypt({
      threshold: 1,
      packageId: process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID ?? DEFAULT_SEAL_PACKAGE_ID,
      id: `${ownerAddress}:${file.name}:${file.lastModified}`,
      data: bytes,
    });
    const keyBytes = Uint8Array.from(sealResult.key);
    const keyHashBuffer = await crypto.subtle.digest("SHA-256", keyBytes);
    const keyHashHex = toHex(new Uint8Array(keyHashBuffer));

    return {
      encryptedBlob: sealResult.encryptedObject,
      keyHashHex,
      mode: "seal",
    };
  }

  if (options?.signer) {
    return localEncryptWithWalletSigner(bytes, ownerAddress, options.signer);
  }

  return localEncrypt(bytes);
}

export async function uploadToWalrus(encryptedBlob: Uint8Array): Promise<PreparedWalrusUpload> {
  const walrusClient = getWalrusClient();
  const flow = walrusClient.writeBlobFlow({ blob: encryptedBlob });
  let encoded: Awaited<ReturnType<typeof flow.encode>> | null = null;

  for (let attempt = 0; attempt < WALRUS_UPLOAD_RETRY_ATTEMPTS; attempt += 1) {
    try {
      encoded = await flow.encode();
      break;
    } catch (error) {
      if (attempt < WALRUS_UPLOAD_RETRY_ATTEMPTS - 1 && isRetryableWalrusError(error)) {
        await delay(WALRUS_RETRY_BASE_DELAY_MS * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  if (!encoded) {
    throw new Error("Could not prepare upload payload for decentralized storage.");
  }

  return {
    blobId: encoded.blobId,
    proof: encoded.rootHash,
    unencodedSize: encoded.unencodedSize,
    _flow: flow,
  };
}

export async function checkWalBalanceForUpload(address: string, fileSizeBytes: number) {
  const requiredWal = estimateWalRequired(fileSizeBytes);
  const balance = await getWALBalance(address);
  return {
    requiredWal,
    balanceWal: balance.totalWal,
    hasEnoughWal: balance.totalWal >= requiredWal,
  };
}

export async function ensureStorageCreditsForUpload(
  wallet: WalletExecutor,
  fileSizeBytes: number,
): Promise<StoragePreparationResult> {
  const requiredWal = estimateWalRequired(fileSizeBytes);
  const walBalance = await getWALBalance(wallet.address);
  const missingWal = Math.max(0, requiredWal - walBalance.totalWal);

  if (missingWal <= 0) {
    return {
      swapPerformed: false,
    };
  }

  const requiredWalMist = BigInt(Math.ceil(missingWal * 1_000_000_000));
  const swap = await buildSuiToWalSwapTransaction({
    requiredWalMist,
  });

  const suiBalance = await getSuiBalance(wallet.address);
  if (BigInt(suiBalance.totalMist) < swap.estimatedSuiInMist) {
    throw new Error("Add more SUI to continue.");
  }

  const swapResult = await wallet.executeTransaction(swap.txb);
  const postSwapWal = await getWALBalance(wallet.address);
  if (postSwapWal.totalWal + 0.000001 < requiredWal) {
    throw new Error("Storage funding is still pending. Please retry in a moment.");
  }

  return {
    swapPerformed: true,
    swapDigest: swapResult.digest,
  };
}

export async function registerFileOnSui(wallet: WalletExecutor, blobId: string, metadata: RegisterMetadata) {
  if (!isValidSuiAddress(wallet.address)) {
    throw new Error("Wallet address is required for on-chain registration.");
  }

  const treasuryFeeSui = calculateDynamicFeeSui(metadata.size);

  const owner = metadata.owner || wallet.address;
  const registerTx = metadata.upload._flow.register({
    owner,
    // Deletable blobs can be permanently removed on-chain later (owner-signed delete).
    deletable: true,
    epochs: WALRUS_INITIAL_EPOCHS,
    attributes: {
      filename: metadata.name,
      mimeType: metadata.mimeType,
      size: String(metadata.size),
      owner,
      blobId,
      expirationEpoch: metadata.expiresAtEpoch ? String(metadata.expiresAtEpoch) : "none",
      uploadedAt: String(Date.now()),
      encryptionKeyHash: metadata.encryptionKeyHash,
      walrusProof: metadata.upload.proof,
    },
  });

  // Dynamic intelligent fee adapts to file size; proceeds go to treasury.
  await appendTreasuryFee(registerTx, treasuryFeeSui);

  // Register immutable file metadata in the DecenDrive Move contract when the package is configured.
  const uploadedAt = Date.now();
  appendRegisterFileCall(registerTx, {
    blobId,
    size: metadata.size,
    uploadedAt,
    encryptionKeyHash: metadata.encryptionKeyHash,
  });

  const registerResult = await wallet.executeTransaction(registerTx);
  let uploaded: Awaited<ReturnType<typeof metadata.upload._flow.upload>> | null = null;
  let lastUploadError: unknown = null;

  for (let attempt = 0; attempt < WALRUS_UPLOAD_RETRY_ATTEMPTS; attempt += 1) {
    try {
      uploaded = await metadata.upload._flow.upload({
        digest: registerResult.digest,
        signal: AbortSignal.timeout(WALRUS_REQUEST_TIMEOUT_MS),
      });
      break;
    } catch (error) {
      lastUploadError = error;
      if (attempt < WALRUS_UPLOAD_RETRY_ATTEMPTS - 1 && isRetryableWalrusError(error)) {
        await delay(WALRUS_RETRY_BASE_DELAY_MS * (attempt + 1));
        continue;
      }
      break;
    }
  }

  if (!uploaded) {
    const detail = lastUploadError instanceof Error ? lastUploadError.message : "Unknown upload error.";
    throw new Error(`Decentralized upload timed out after retries. ${detail}`);
  }

  // Certify the blob on-chain. This is REQUIRED: without it the blob is only
  // registered + partially stored and may be unretrievable later (the cause of
  // "ghost" files that show up but can't be previewed/downloaded). Certify only
  // succeeds once enough storage nodes confirmed the slivers, so it also acts as
  // a durability guarantee for large files.
  let certified = false;
  let lastCertifyError: unknown = null;
  for (let attempt = 0; attempt < WALRUS_UPLOAD_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const certifyTx = metadata.upload._flow.certify();
      await wallet.executeTransaction(certifyTx);
      certified = true;
      break;
    } catch (error) {
      lastCertifyError = error;
      if (attempt < WALRUS_UPLOAD_RETRY_ATTEMPTS - 1 && isRetryableWalrusError(error)) {
        await delay(WALRUS_RETRY_BASE_DELAY_MS * (attempt + 1));
        continue;
      }
      break;
    }
  }

  if (!certified) {
    const detail = lastCertifyError instanceof Error ? lastCertifyError.message : "Unknown certification error.";
    throw new Error(
      `Upload could not be certified on Walrus, so the file would not be retrievable. ${detail}`,
    );
  }

  return {
    digest: registerResult.digest,
    blobId: uploaded.blobId,
    proof: uploaded.certificate,
    walrusLink: `${WALRUS_AGGREGATOR_URL}/v1/blobs/${uploaded.blobId}`,
    uploadedFile: {
      name: metadata.name,
      size: metadata.size,
      date: new Date().toISOString(),
      blobId: uploaded.blobId,
      walrusUrl: `${WALRUS_AGGREGATOR_URL}/v1/blobs/${uploaded.blobId}`,
      digest: registerResult.digest,
    } satisfies UploadedFileRecord,
  };
}

/** Store small encrypted payloads (e.g. drive layout manifest) on Walrus without a DecenDrive File row. */
export async function persistEncryptedBytesToWalrus(
  wallet: WalletExecutor,
  encryptedBlob: Uint8Array,
  meta: { label: string; size: number },
) {
  const walrusUpload = await uploadToWalrus(encryptedBlob);
  await ensureStorageCreditsForUpload(wallet, meta.size);

  const registerTx = walrusUpload._flow.register({
    owner: wallet.address,
    deletable: true,
    epochs: WALRUS_INITIAL_EPOCHS,
    attributes: {
      filename: `decendrive-${meta.label}.json`,
      mimeType: "application/octet-stream",
      size: String(meta.size),
      owner: wallet.address,
      blobId: walrusUpload.blobId,
      uploadedAt: String(Date.now()),
      purpose: meta.label,
      walrusProof: walrusUpload.proof,
    },
  });

  const registerResult = await wallet.executeTransaction(registerTx);
  let uploaded: Awaited<ReturnType<typeof walrusUpload._flow.upload>> | null = null;
  let lastUploadError: unknown = null;

  for (let attempt = 0; attempt < WALRUS_UPLOAD_RETRY_ATTEMPTS; attempt += 1) {
    try {
      uploaded = await walrusUpload._flow.upload({
        digest: registerResult.digest,
        signal: AbortSignal.timeout(WALRUS_REQUEST_TIMEOUT_MS),
      });
      break;
    } catch (error) {
      lastUploadError = error;
      if (attempt < WALRUS_UPLOAD_RETRY_ATTEMPTS - 1 && isRetryableWalrusError(error)) {
        await delay(WALRUS_RETRY_BASE_DELAY_MS * (attempt + 1));
        continue;
      }
      break;
    }
  }

  if (!uploaded) {
    const detail = lastUploadError instanceof Error ? lastUploadError.message : "Unknown upload error.";
    throw new Error(`Blob object not found in transaction effects for transaction (${registerResult.digest}). ${detail}`);
  }

  let certified = false;
  let lastCertifyError: unknown = null;
  for (let attempt = 0; attempt < WALRUS_UPLOAD_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const certifyTx = walrusUpload._flow.certify();
      await wallet.executeTransaction(certifyTx);
      certified = true;
      break;
    } catch (error) {
      lastCertifyError = error;
      if (attempt < WALRUS_UPLOAD_RETRY_ATTEMPTS - 1 && isRetryableWalrusError(error)) {
        await delay(WALRUS_RETRY_BASE_DELAY_MS * (attempt + 1));
        continue;
      }
      break;
    }
  }

  if (!certified) {
    const detail = lastCertifyError instanceof Error ? lastCertifyError.message : "Unknown certification error.";
    throw new Error(`Drive layout blob could not be certified on Walrus. ${detail}`);
  }

  return {
    digest: registerResult.digest,
    blobId: uploaded.blobId,
    walrusLink: `${WALRUS_AGGREGATOR_URL}/v1/blobs/${uploaded.blobId}`,
  };
}

// Build an owner-signed transaction that permanently deletes a deletable blob
// from Walrus, reclaiming its storage. Only works for blobs registered as
// deletable (every upload after this change is).
export function buildDeleteBlobTransaction(blobObjectId: string, owner: string): Transaction {
  const walrusClient = getWalrusClient();
  return walrusClient.deleteBlobTransaction({ blobObjectId, owner });
}

type DecryptBlobInput = {
  blobId: string;
  owner: string;
  encryptionKeyHash: string;
  signer: WalletEncryptionSigner;
};

type DecryptSharedBlobInput = {
  blobId: string;
  /** Wallet address of the file owner who shared the blob. */
  owner: string;
  recipient: string;
  keyWrapper: string;
  encryptionKeyHash?: string;
};

export async function decryptSharedBlobToBytes(input: DecryptSharedBlobInput): Promise<Uint8Array> {
  const { unwrapOwnerKeyAsRecipient, keyBytesToHashHex } = await import("./share-crypto");
  const response = await fetch(`/api/blob?blobId=${encodeURIComponent(input.blobId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        "This file's data is no longer available on Walrus. Ask the sender to re-share after re-uploading.",
      );
    }
    throw new Error("Walrus storage is busy right now. Please try again in a moment.");
  }

  const encryptedBlob = new Uint8Array(await response.arrayBuffer());
  if (encryptedBlob.length <= 12) {
    throw new Error("Encrypted blob payload is invalid.");
  }

  const keyBytes = await unwrapOwnerKeyAsRecipient({
    owner: input.owner,
    recipient: input.recipient,
    blobId: input.blobId,
    keyWrapper: input.keyWrapper,
  });

  if (input.encryptionKeyHash) {
    const hash = keyBytesToHashHex(keyBytes);
    if (hash.toLowerCase() !== input.encryptionKeyHash.toLowerCase()) {
      throw new Error("Share key does not match this file's encryption record.");
    }
  }

  const iv = encryptedBlob.slice(0, 12);
  const ciphertext = encryptedBlob.slice(12);
  const keyMaterial = Uint8Array.from(keyBytes);
  const cryptoKey = await crypto.subtle.importKey("raw", keyMaterial, "AES-GCM", false, ["decrypt"]);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ciphertext,
  );

  return new Uint8Array(plainBuffer);
}

export async function decryptBlobToBytes(input: DecryptBlobInput): Promise<Uint8Array> {
  const response = await fetch(`/api/blob?blobId=${encodeURIComponent(input.blobId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        "This file's data is no longer available on Walrus. The original upload likely didn't finish storing. Please re-upload it.",
      );
    }
    throw new Error("Walrus storage is busy right now. Please try again in a moment.");
  }

  const encryptedBlob = new Uint8Array(await response.arrayBuffer());
  if (encryptedBlob.length <= 12) {
    throw new Error("Encrypted blob payload is invalid.");
  }

  const { keyBytes, keyHashHex } = await deriveWalletEncryptionKey(input.owner, input.signer);
  if (input.encryptionKeyHash && keyHashHex.toLowerCase() !== input.encryptionKeyHash.toLowerCase()) {
    throw new Error("Wallet key does not match this file's encryption hash.");
  }

  const iv = encryptedBlob.slice(0, 12);
  const ciphertext = encryptedBlob.slice(12);
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const plainBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    cryptoKey,
    ciphertext,
  );

  return new Uint8Array(plainBuffer);
}

export async function downloadAndDecryptFile(input: DownloadAndDecryptInput) {
  const plainBytes = await decryptBlobToBytes(input);
  const arrayBuffer = plainBytes.buffer.slice(
    plainBytes.byteOffset,
    plainBytes.byteOffset + plainBytes.byteLength,
  ) as ArrayBuffer;

  const blob = new Blob([arrayBuffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = input.filename;
  link.click();
  URL.revokeObjectURL(url);
}
