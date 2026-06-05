"use client";

import { getActivities } from "@/lib/drive/activity";
import {
  getFileMetaMap,
  getFileFolderMap,
  getFolders,
} from "@/lib/drive/file-metadata";
import { getHiddenBlobIds } from "@/lib/drive/hidden-blobs";
import { getSavedReceivedFiles } from "@/lib/drive/saved-received";
import { getTrashStore } from "@/lib/drive/trash";
import {
  DRIVE_STATE_SCHEMA_VERSION,
  emptyDriveState,
  type DriveStateSnapshot,
} from "@/lib/drive/drive-state";
import { writeWalletJson, readWalletJson } from "@/lib/drive/wallet-storage";

const META_KEY = "decendrive:file-meta";
const FOLDERS_KEY = "decendrive:folders";
const FILE_FOLDER_KEY = "decendrive:file-folders";
const TRASH_KEY = "decendrive:trash";
const HIDDEN_KEY = "decendrive:hidden-blobs";
const SAVED_KEY = "decendrive:saved-received";
const ACTIVITY_KEY = "decendrive:activity";

export function collectDriveStateSnapshot(): DriveStateSnapshot {
  return {
    version: DRIVE_STATE_SCHEMA_VERSION,
    updatedAt: Date.now(),
    fileMeta: getFileMetaMap(),
    folders: getFolders(),
    fileFolders: getFileFolderMap(),
    trash: getTrashStore(),
    hiddenBlobs: getHiddenBlobIds(),
    savedReceived: getSavedReceivedFiles(),
    activity: getActivities(),
  };
}

/** Hydrate local cache from a remote Walrus manifest (still wallet-scoped keys). */
export function applyDriveStateSnapshot(
  snapshot: DriveStateSnapshot,
  options?: { silent?: boolean },
) {
  writeWalletJson(META_KEY, snapshot.fileMeta ?? {});
  writeWalletJson(FOLDERS_KEY, snapshot.folders ?? []);
  writeWalletJson(FILE_FOLDER_KEY, snapshot.fileFolders ?? {});
  writeWalletJson(TRASH_KEY, snapshot.trash ?? emptyDriveState().trash);
  writeWalletJson(HIDDEN_KEY, snapshot.hiddenBlobs ?? []);
  writeWalletJson(SAVED_KEY, snapshot.savedReceived ?? []);
  writeWalletJson(ACTIVITY_KEY, snapshot.activity ?? []);

  if (!options?.silent && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("decendrive:file-index-changed"));
    window.dispatchEvent(new CustomEvent("decendrive:activity-changed"));
  }
}

export type CachedDriveStateMeta = {
  updatedAt: number;
  stateVersion: number;
};

/** Read cached Walrus manifest revision (for merge decisions without re-signing). */
export function readCachedDriveStateMeta(): CachedDriveStateMeta {
  const raw = readWalletJson<Partial<CachedDriveStateMeta> | null>("decendrive:state-revision", null);
  return {
    updatedAt: raw?.updatedAt ?? 0,
    stateVersion: raw?.stateVersion ?? 0,
  };
}

export function writeCachedDriveStateMeta(patch: Partial<CachedDriveStateMeta>) {
  const current = readCachedDriveStateMeta();
  writeWalletJson("decendrive:state-revision", { ...current, ...patch });
}
