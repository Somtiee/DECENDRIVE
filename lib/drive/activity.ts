"use client";

import { getActiveWallet, isBrowser, readWalletJson, writeWalletJson } from "@/lib/drive/wallet-storage";

export type DriveActivityType = "upload" | "shared" | "received";

export type DriveActivity = {
  id: string;
  type: DriveActivityType;
  blobId: string;
  name: string;
  counterparty?: string;
  timestamp: number;
  detail?: string;
  txDigest?: string;
  wallet: string;
};

const ACTIVITY_KEY = "decendrive:activity";

export const ACTIVITY_EVENT = "decendrive:activity-changed";

function readAll(): DriveActivity[] {
  const wallet = getActiveWallet();
  if (!wallet || !isBrowser()) {
    return [];
  }
  const items = readWalletJson<DriveActivity[]>(ACTIVITY_KEY, []);
  return Array.isArray(items) ? items.filter((item) => item.wallet === wallet) : [];
}

function writeAll(items: DriveActivity[], options?: { silent?: boolean }) {
  const wallet = getActiveWallet();
  if (!wallet || !isBrowser()) {
    return;
  }
  writeWalletJson(ACTIVITY_KEY, items.slice(0, 200));
  if (!options?.silent) {
    window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT));
  }
}

export function getActivities(): DriveActivity[] {
  return readAll().sort((a, b) => b.timestamp - a.timestamp);
}

export function appendActivity(
  entry: Omit<DriveActivity, "id" | "wallet">,
  options?: { silent?: boolean },
) {
  const wallet = getActiveWallet();
  if (!wallet) {
    return;
  }
  const items = readAll();
  items.unshift({
    ...entry,
    wallet,
    id: `${entry.type}-${entry.blobId}-${entry.timestamp}`,
  });
  writeAll(items, options);
}

export function recordUpload(blobId: string, name: string, txDigest?: string) {
  appendActivity({
    type: "upload",
    blobId,
    name,
    timestamp: Date.now(),
    detail: "Uploaded to Walrus on Sui mainnet",
    txDigest,
  });
}

export function recordShared(
  blobId: string,
  name: string,
  recipient: string,
  txDigest?: string,
) {
  appendActivity(
    {
      type: "shared",
      blobId,
      name,
      counterparty: recipient,
      timestamp: Date.now(),
      detail: "Shared wallet-to-wallet",
      txDigest,
    },
    { silent: true },
  );
}

export function recordReceived(blobId: string, name: string, sender: string, txDigest?: string) {
  appendActivity({
    type: "received",
    blobId,
    name,
    counterparty: sender,
    timestamp: Date.now(),
    detail: "Accepted incoming share",
    txDigest,
  });
}
