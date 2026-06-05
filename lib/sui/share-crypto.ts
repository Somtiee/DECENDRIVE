import { toHex } from "@mysten/bcs";

import type { WalletEncryptionSigner } from "./wallet";
import { deriveWalletEncryptionKey } from "./wallet";

/** Permission flags aligned with on-chain ShareInvitation.permissions */
export const SHARE_PERM_VIEW = 1;
export const SHARE_PERM_DOWNLOAD = 2;

export type SharePermissions = {
  canView: boolean;
  canDownload: boolean;
};

/** Full access when both view and download are enabled (on-chain flags = 3). */
export const FULL_SHARE_PERMISSIONS: SharePermissions = {
  canView: true,
  canDownload: true,
};

export const FULL_SHARE_PERMISSION_FLAGS = permissionsToFlags(FULL_SHARE_PERMISSIONS);

export function permissionsToFlags(perms: SharePermissions): number {
  let flags = 0;
  if (perms.canView) {
    flags |= SHARE_PERM_VIEW;
  }
  if (perms.canDownload) {
    flags |= SHARE_PERM_DOWNLOAD;
  }
  return flags;
}

export function flagsToPermissions(flags: number): SharePermissions {
  return {
    canView: (flags & SHARE_PERM_VIEW) !== 0,
    canDownload: (flags & SHARE_PERM_DOWNLOAD) !== 0,
  };
}

export function shareAccessLabel(flags: number) {
  const perms = flagsToPermissions(flags);
  if (perms.canView && perms.canDownload) {
    return "View and download";
  }
  if (perms.canView) {
    return "View only";
  }
  if (perms.canDownload) {
    return "Download only";
  }
  return "No access";
}

/** Deterministic key both sender and recipient derive for a given share (no extra wallet sig). */
export async function deriveShareAccessKey(owner: string, recipient: string, blobId: string) {
  const message = `DecenDrive::ShareAccess::${owner.toLowerCase()}::${recipient.toLowerCase()}::${blobId}`;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return new Uint8Array(hashBuffer);
}

async function importAesKey(raw: Uint8Array) {
  const material = Uint8Array.from(raw);
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Owner wraps their file encryption key so only this recipient can unwrap for this blob. */
export async function wrapOwnerKeyForRecipient(input: {
  owner: string;
  recipient: string;
  blobId: string;
  ownerSigner: WalletEncryptionSigner;
}): Promise<string> {
  const { keyBytes } = await deriveWalletEncryptionKey(input.owner, input.ownerSigner);
  const shareKey = await deriveShareAccessKey(input.owner, input.recipient, input.blobId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await importAesKey(shareKey);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    Uint8Array.from(keyBytes),
  );
  const cipherText = new Uint8Array(cipherBuffer);
  const payload = new Uint8Array(iv.length + cipherText.length);
  payload.set(iv, 0);
  payload.set(cipherText, iv.length);
  return bytesToBase64(payload);
}

/** Recipient unwraps the owner's encryption key material from the on-chain invitation. */
export async function unwrapOwnerKeyAsRecipient(input: {
  owner: string;
  recipient: string;
  blobId: string;
  keyWrapper: string;
}): Promise<Uint8Array> {
  const payload = base64ToBytes(input.keyWrapper);
  if (payload.length <= 12) {
    throw new Error("Invalid key wrapper on share invitation.");
  }
  const shareKey = await deriveShareAccessKey(input.owner, input.recipient, input.blobId);
  const iv = payload.slice(0, 12);
  const ciphertext = payload.slice(12);
  const cryptoKey = await importAesKey(shareKey);
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ciphertext);
  return new Uint8Array(plainBuffer);
}

export function keyBytesToHashHex(keyBytes: Uint8Array) {
  return toHex(keyBytes);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
