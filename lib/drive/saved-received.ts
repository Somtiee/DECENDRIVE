"use client";

import { isBrowser, readWalletJson, writeWalletJson } from "@/lib/drive/wallet-storage";
import { FILE_INDEX_EVENT } from "@/lib/drive/file-metadata";
import type { ShareInvitationView } from "@/components/drive/types";

export type SavedReceivedFile = {
  blobId: string;
  name: string;
  mimeType: string;
  size: number;
  encryptionKeyHash: string;
  walrusUrl: string;
  owner: string;
  shareKeyWrapper: string;
  shareInvitationId: string;
  sharePermissions: { canView: boolean; canDownload: boolean };
  walrusObjectId?: string;
  savedAt: number;
};

const SAVED_KEY = "decendrive:saved-received";

function readAll(): SavedReceivedFile[] {
  return readWalletJson<SavedReceivedFile[]>(SAVED_KEY, []);
}

function writeAll(entries: SavedReceivedFile[]) {
  if (!isBrowser()) {
    return;
  }
  writeWalletJson(SAVED_KEY, entries);
  window.dispatchEvent(new CustomEvent(FILE_INDEX_EVENT));
}

export function getSavedReceivedFiles(): SavedReceivedFile[] {
  return readAll().sort((a, b) => b.savedAt - a.savedAt);
}

export function isSavedReceived(blobId: string): boolean {
  return readAll().some((entry) => entry.blobId === blobId);
}

export function addReceivedToMyDrive(invite: ShareInvitationView): boolean {
  if (!invite.blobId || !invite.keyWrapper) {
    return false;
  }
  const entries = readAll();
  if (entries.some((entry) => entry.blobId === invite.blobId)) {
    return false;
  }
  entries.push({
    blobId: invite.blobId,
    name: invite.name,
    mimeType: invite.mimeType,
    size: invite.size,
    encryptionKeyHash: invite.encryptionKeyHash,
    walrusUrl: invite.walrusUrl,
    owner: invite.sender,
    shareKeyWrapper: invite.keyWrapper,
    shareInvitationId: invite.objectId,
    sharePermissions: { canView: invite.canView, canDownload: invite.canDownload },
    walrusObjectId: invite.walrusObjectId,
    savedAt: Date.now(),
  });
  writeAll(entries);
  return true;
}

export function removeSavedReceived(blobId: string) {
  writeAll(readAll().filter((entry) => entry.blobId !== blobId));
}
