"use client";

import type { DriveActivity } from "@/lib/drive/activity";
import type { DriveFolder, StoredFileMeta } from "@/lib/drive/file-metadata";
import type { SavedReceivedFile } from "@/lib/drive/saved-received";
import type { TrashStore } from "@/lib/drive/trash";

/** Wallet-scoped drive UI state — encrypted and stored on Walrus, anchored on Sui. */
export type DriveStateSnapshot = {
  version: number;
  updatedAt: number;
  fileMeta: Record<string, StoredFileMeta>;
  folders: DriveFolder[];
  fileFolders: Record<string, string[]>;
  trash: TrashStore;
  hiddenBlobs: string[];
  savedReceived: SavedReceivedFile[];
  activity: DriveActivity[];
};

export const DRIVE_STATE_SCHEMA_VERSION = 1;

export function emptyDriveState(): DriveStateSnapshot {
  return {
    version: DRIVE_STATE_SCHEMA_VERSION,
    updatedAt: Date.now(),
    fileMeta: {},
    folders: [],
    fileFolders: {},
    trash: { files: {}, folders: {} },
    hiddenBlobs: [],
    savedReceived: [],
    activity: [],
  };
}
