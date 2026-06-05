"use client";

export const WALLET_CHANGED_EVENT = "decendrive:wallet-changed";

let activeWallet: string | null = null;

function normalizeAddress(address: string | null | undefined) {
  return address?.trim().toLowerCase() || null;
}

/** Bind local drive index + activity to the connected wallet (not the browser). */
export function setActiveWallet(address: string | null | undefined) {
  const next = normalizeAddress(address);
  if (next === activeWallet) {
    return;
  }
  activeWallet = next;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WALLET_CHANGED_EVENT));
  }
}

export function getActiveWallet() {
  return activeWallet;
}

export function storageKey(baseKey: string) {
  if (!activeWallet) {
    return null;
  }
  return `${baseKey}:${activeWallet}`;
}

export function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readWalletJson<T>(baseKey: string, fallback: T): T {
  const key = storageKey(baseKey);
  if (!key || !isBrowser()) {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeWalletJson(baseKey: string, value: unknown) {
  const key = storageKey(baseKey);
  if (!key || !isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort
  }
}
