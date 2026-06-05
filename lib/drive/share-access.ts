"use client";

import { isBrowser, readWalletJson, writeWalletJson } from "@/lib/drive/wallet-storage";
import {
  permissionsToFlags,
  type SharePermissions,
} from "@/lib/sui/share-crypto";

/** Wallet-to-wallet invitation access (Share modal). Not used for public DecenDrive links. */
export type ShareAccessMode = "view-only" | "view-download";

export type ShareAccessSettings = SharePermissions & {
  mode: ShareAccessMode;
};

export const DEFAULT_SHARE_ACCESS: ShareAccessSettings = {
  mode: "view-download",
  canView: true,
  canDownload: true,
};

const ACCESS_KEY = "decendrive:wallet-share-access";

export const SHARE_ACCESS_EVENT = "decendrive:wallet-share-access-changed";

function readAccessMap(): Record<string, ShareAccessSettings> {
  const modern = readWalletJson<Record<string, ShareAccessSettings>>(ACCESS_KEY, {});
  if (Object.keys(modern).length > 0) {
    return modern;
  }
  return readWalletJson<Record<string, ShareAccessSettings>>("decendrive:share-access", {});
}

function writeAccessMap(map: Record<string, ShareAccessSettings>) {
  if (!isBrowser()) {
    return;
  }
  writeWalletJson(ACCESS_KEY, map);
  window.dispatchEvent(new CustomEvent(SHARE_ACCESS_EVENT));
}

export function modeToPermissions(mode: ShareAccessMode): SharePermissions {
  if (mode === "view-only") {
    return { canView: true, canDownload: false };
  }
  return { canView: true, canDownload: true };
}

export function permissionsToMode(perms: SharePermissions): ShareAccessMode {
  if (perms.canView && perms.canDownload) {
    return "view-download";
  }
  if (perms.canView) {
    return "view-only";
  }
  return "view-download";
}

export function normalizeShareAccess(input: Partial<ShareAccessSettings>): ShareAccessSettings {
  const mode = input.mode ?? "view-download";
  const perms = modeToPermissions(mode);
  return {
    mode,
    canView: perms.canView,
    canDownload: perms.canDownload,
  };
}

export function getShareAccess(blobId: string): ShareAccessSettings {
  if (!blobId) {
    return { ...DEFAULT_SHARE_ACCESS };
  }
  const stored = readAccessMap()[blobId];
  if (!stored) {
    return { ...DEFAULT_SHARE_ACCESS };
  }
  return normalizeShareAccess(stored);
}

export async function saveShareAccess(blobId: string, settings: ShareAccessSettings) {
  if (!blobId) {
    return;
  }
  const map = readAccessMap();
  map[blobId] = normalizeShareAccess(settings);
  writeAccessMap(map);
}

export function shareAccessToFlags(settings: ShareAccessSettings): number {
  return permissionsToFlags({
    canView: settings.canView,
    canDownload: settings.canDownload,
  });
}

export function shareAccessLabelFromSettings(settings: ShareAccessSettings): string {
  if (settings.canView && settings.canDownload) {
    return "View and download";
  }
  if (settings.canView) {
    return "View only";
  }
  return "No access";
}
