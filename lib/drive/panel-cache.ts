"use client";

import { isBrowser, readWalletJson, storageKey, writeWalletJson } from "@/lib/drive/wallet-storage";

/** Wallet-scoped snapshot so tabs can render last-known data while Sui RPC syncs. */
export function readPanelCache<T>(panelKey: string, fallback: T): T {
  return readWalletJson<T>(`decendrive:panel:${panelKey}`, fallback);
}

export function writePanelCache<T>(panelKey: string, value: T) {
  writeWalletJson(`decendrive:panel:${panelKey}`, value);
}

export function readNonEmptyPanelCache<T extends { items?: unknown[] }>(
  panelKey: string,
): T | undefined {
  const cached = readWalletJson<T | null>(`decendrive:panel:${panelKey}`, null);
  if (!cached) {
    return undefined;
  }
  if (Array.isArray(cached.items) && cached.items.length > 0) {
    return cached;
  }
  return undefined;
}

export function readReceivedPanelCache(
  panelKey: string,
): {
  pending: { items: unknown[]; pagination: { total: number } };
  received: { items: unknown[]; pagination: { total: number } };
} | undefined {
  const cached = readWalletJson<{
    pending: { items: unknown[]; pagination: { total: number } };
    received: { items: unknown[]; pagination: { total: number } };
  } | null>(`decendrive:panel:${panelKey}`, null);
  if (!cached) {
    return undefined;
  }
  const total =
    (cached.pending?.pagination?.total ?? 0) + (cached.received?.pagination?.total ?? 0);
  if (total > 0) {
    return cached;
  }
  return undefined;
}

export function writePanelCacheIfNonEmpty<T extends { items?: unknown[] }>(
  panelKey: string,
  value: T,
) {
  if (Array.isArray(value.items) && value.items.length > 0) {
    writePanelCache(panelKey, value);
  }
}

/** Drop wallet-scoped panel snapshots (e.g. after a new share or manual refresh). */
export function clearPanelCache(panelKey: string) {
  const key = storageKey(`decendrive:panel:${panelKey}`);
  if (!key || !isBrowser()) {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // best-effort
  }
}

export function writeReceivedPanelCache(
  panelKey: string,
  value: {
    pending: { items: unknown[]; pagination: { total: number } };
    received: { items: unknown[]; pagination: { total: number } };
  },
) {
  const total =
    (value.pending?.pagination?.total ?? 0) + (value.received?.pagination?.total ?? 0);
  if (total > 0) {
    writePanelCache(panelKey, value);
  }
}
