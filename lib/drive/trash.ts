"use client";

import {
  collectDescendantFolderIds,
  collectFolderFileBlobIds,
  deleteFolder,
  FILE_INDEX_EVENT,
  getFileFolderMap,
  getFolders,
  removeFileMeta,
  type DriveFolder,
} from "@/lib/drive/file-metadata";
import { hideBlobFromDrive, isHiddenFromDrive, unhideBlobFromDrive } from "@/lib/drive/hidden-blobs";
import { readWalletJson, writeWalletJson } from "@/lib/drive/wallet-storage";

const FOLDERS_KEY = "decendrive:folders";
const FILE_FOLDER_KEY = "decendrive:file-folders";
const LEGACY_DELETED_KEY = "decendrive:deleted";

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const TRASH_RETENTION_DAYS = 30;

const TRASH_KEY = "decendrive:trash";

/** Trash-only updates — must not trigger Walrus drive-layout sync. */
export const TRASH_CHANGED_EVENT = "decendrive:trash-changed";

export type TrashFileEntry = {
  blobId: string;
  deletedAt: number;
  folderIds: string[];
};

export type TrashFolderEntry = {
  folderId: string;
  deletedAt: number;
  parentId: string | null;
  name: string;
};

export type TrashStore = {
  files: Record<string, TrashFileEntry>;
  folders: Record<string, TrashFolderEntry>;
};

function emptyStore(): TrashStore {
  return { files: {}, folders: {} };
}

function writeTrash(store: TrashStore) {
  writeWalletJson(TRASH_KEY, store);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(TRASH_CHANGED_EVENT));
  }
}

export function getTrashStore(): TrashStore {
  const stored = readWalletJson<TrashStore | null>(TRASH_KEY, null);
  if (stored && typeof stored === "object" && stored.files && stored.folders) {
    return stored;
  }

  const legacy = readWalletJson<string[]>(LEGACY_DELETED_KEY, []);
  if (Array.isArray(legacy) && legacy.length > 0) {
    const now = Date.now();
    const files: Record<string, TrashFileEntry> = {};
    for (const blobId of legacy) {
      if (blobId && !isHiddenFromDrive(blobId)) {
        files[blobId] = { blobId, deletedAt: now, folderIds: [] };
      }
    }
    const migrated = { files, folders: {} };
    writeTrash(migrated);
    return migrated;
  }

  return emptyStore();
}

export function getTrashedBlobIds(): string[] {
  return Object.keys(getTrashStore().files);
}

export function getTrashedFolderIds(): string[] {
  return Object.keys(getTrashStore().folders);
}

export function isTrashed(blobId: string) {
  return Boolean(getTrashStore().files[blobId]);
}

export function getTrashFileEntry(blobId: string) {
  return getTrashStore().files[blobId];
}

export function getTrashedFolders(): TrashFolderEntry[] {
  return Object.values(getTrashStore().folders);
}

function trashEntriesAsDriveFolders(): DriveFolder[] {
  return getTrashedFolders().map((entry) => ({
    id: entry.folderId,
    name: entry.name,
    parentId: entry.parentId,
    createdAt: entry.deletedAt,
  }));
}

export function getTrashedDriveFolders(): DriveFolder[] {
  return trashEntriesAsDriveFolders();
}

export function collectTrashBlobIdsForFolder(folderId: string): string[] {
  const folders = trashEntriesAsDriveFolders();
  const descendantIds = new Set(collectDescendantFolderIds(folderId, folders));
  descendantIds.add(folderId);
  return Object.values(getTrashStore().files)
    .filter((entry) => entry.folderIds.some((id) => descendantIds.has(id)))
    .map((entry) => entry.blobId);
}

export function daysUntilPurge(deletedAt: number) {
  const remaining = deletedAt + TRASH_RETENTION_MS - Date.now();
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

/** Saves folder mapping for restore; used with on-chain in_trash (not local trash source of truth). */
export function captureTrashFolderSnapshot(blobId: string) {
  if (!blobId) {
    return;
  }
  const store = getTrashStore();
  const fileFolders = getFileFolderMap();
  const folderIds = [...(fileFolders[blobId] ?? [])];
  store.files[blobId] = {
    blobId,
    deletedAt: Date.now(),
    folderIds,
  };
  delete fileFolders[blobId];
  writeWalletJson(FILE_FOLDER_KEY, fileFolders);
  writeTrash(store);
}

export function clearTrashFolderSnapshot(blobId: string) {
  const store = getTrashStore();
  if (store.files[blobId]) {
    delete store.files[blobId];
    writeTrash(store);
  }
}

export function moveFileToTrash(blobId: string) {
  captureTrashFolderSnapshot(blobId);
}

function notifyIndexChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FILE_INDEX_EVENT));
  }
}

export function restoreFileFromTrash(blobId: string): boolean {
  const store = getTrashStore();
  const entry = store.files[blobId];
  if (!entry) {
    return false;
  }

  delete store.files[blobId];
  writeTrash(store);

  const liveFolderIds = new Set(getFolders().map((folder) => folder.id));
  const fileFolders = getFileFolderMap();
  const restoredFolderIds = entry.folderIds.filter((id) => liveFolderIds.has(id));
  if (restoredFolderIds.length > 0) {
    fileFolders[blobId] = restoredFolderIds;
  } else {
    delete fileFolders[blobId];
  }
  writeWalletJson(FILE_FOLDER_KEY, fileFolders);
  unhideBlobFromDrive(blobId);
  notifyIndexChanged();
  return true;
}

export function restoreFolderFromTrash(folderId: string): boolean {
  const store = getTrashStore();
  if (!store.folders[folderId]) {
    return false;
  }

  const trashFolders = trashEntriesAsDriveFolders();
  const descendantIds = collectDescendantFolderIds(folderId, trashFolders);
  const folders = getFolders();
  const existingIds = new Set(folders.map((folder) => folder.id));

  for (const id of descendantIds) {
    const entry = store.folders[id];
    if (!entry || existingIds.has(id)) {
      continue;
    }
    folders.push({
      id: entry.folderId,
      name: entry.name,
      parentId: entry.parentId,
      createdAt: Date.now(),
    });
    delete store.folders[id];
  }
  writeWalletJson(FOLDERS_KEY, folders);

  const descendantSet = new Set(descendantIds);
  const fileFolders = getFileFolderMap();
  for (const [blobId, entry] of Object.entries(store.files)) {
    const restoredFolderIds = entry.folderIds.filter((id) => descendantSet.has(id));
    if (restoredFolderIds.length === 0) {
      continue;
    }
    delete store.files[blobId];
    unhideBlobFromDrive(blobId);
    fileFolders[blobId] = restoredFolderIds;
  }
  writeWalletJson(FILE_FOLDER_KEY, fileFolders);
  writeTrash(store);
  return true;
}

export function moveFolderToTrash(folderId: string) {
  const folders = getFolders();
  if (!folders.some((entry) => entry.id === folderId)) {
    return;
  }

  const descendantIds = collectDescendantFolderIds(folderId, folders);
  const fileFolders = getFileFolderMap();
  const store = getTrashStore();
  const now = Date.now();

  for (const id of descendantIds) {
    const entry = folders.find((folder) => folder.id === id);
    if (entry) {
      store.folders[id] = {
        folderId: id,
        deletedAt: now,
        parentId: entry.parentId,
        name: entry.name,
      };
    }
  }

  for (const blobId of collectFolderFileBlobIds(folderId, folders, fileFolders)) {
    const folderIds = [...(fileFolders[blobId] ?? [])];
    store.files[blobId] = { blobId, deletedAt: now, folderIds };
    delete fileFolders[blobId];
  }

  writeWalletJson(FILE_FOLDER_KEY, fileFolders);
  writeWalletJson(
    FOLDERS_KEY,
    folders.filter((entry) => !descendantIds.includes(entry.id)),
  );
  writeTrash(store);
}

export function permanentRemoveFromDrive(blobId: string) {
  const store = getTrashStore();
  delete store.files[blobId];
  writeTrash(store);
  removeFileMeta(blobId);
  const fileFolders = getFileFolderMap();
  delete fileFolders[blobId];
  writeWalletJson(FILE_FOLDER_KEY, fileFolders);
  hideBlobFromDrive(blobId);
}

export function permanentRemoveFolderFromDrive(folderId: string) {
  const store = getTrashStore();
  const folders = getFolders();
  const removeIds = new Set(collectDescendantFolderIds(folderId, folders));
  for (const id of removeIds) {
    delete store.folders[id];
  }
  writeTrash(store);
  deleteFolder(folderId);
}

export type PurgeTrashResult = {
  expiredBlobIds: string[];
  expiredFolderIds: string[];
};

export function purgeExpiredTrash(): PurgeTrashResult {
  const store = getTrashStore();
  const now = Date.now();
  const expiredBlobIds: string[] = [];
  const expiredFolderIds: string[] = [];

  for (const [blobId, entry] of Object.entries(store.files)) {
    if (now - entry.deletedAt >= TRASH_RETENTION_MS) {
      expiredBlobIds.push(blobId);
      delete store.files[blobId];
      removeFileMeta(blobId);
      hideBlobFromDrive(blobId);
    }
  }

  for (const [folderId, entry] of Object.entries(store.folders)) {
    if (now - entry.deletedAt >= TRASH_RETENTION_MS) {
      expiredFolderIds.push(folderId);
      delete store.folders[folderId];
    }
  }

  if (expiredBlobIds.length > 0 || expiredFolderIds.length > 0) {
    writeTrash(store);
    for (const folderId of expiredFolderIds) {
      try {
        deleteFolder(folderId);
      } catch {
        // folder tree may already be gone
      }
    }
  }

  return { expiredBlobIds, expiredFolderIds };
}

/** @deprecated Use moveFileToTrash — kept for gradual migration */
export function markDeleted(blobId: string) {
  moveFileToTrash(blobId);
}

/** @deprecated Use getTrashedBlobIds */
export function getDeletedBlobIds() {
  return getTrashedBlobIds();
}
