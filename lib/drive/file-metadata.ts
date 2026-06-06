"use client";

import { isBrowser, readWalletJson, writeWalletJson } from "@/lib/drive/wallet-storage";

export type StoredFileMeta = {
  name: string;
  mimeType?: string;
  size?: number;
  uploadedAt: number;
};

export type DriveFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
};

const META_KEY = "decendrive:file-meta";
const DELETED_KEY = "decendrive:deleted";
const FOLDERS_KEY = "decendrive:folders";
const FILE_FOLDER_KEY = "decendrive:file-folders";

export const FILE_INDEX_EVENT = "decendrive:file-index-changed";

function readJson<T>(baseKey: string, fallback: T): T {
  return readWalletJson(baseKey, fallback);
}

function writeJson(baseKey: string, value: unknown) {
  if (!isBrowser()) {
    return;
  }
  writeWalletJson(baseKey, value);
  window.dispatchEvent(new CustomEvent(FILE_INDEX_EVENT));
}

export function getFileMetaMap(): Record<string, StoredFileMeta> {
  return readJson<Record<string, StoredFileMeta>>(META_KEY, {});
}

export function saveFileMeta(blobId: string, meta: StoredFileMeta) {
  if (!blobId) {
    return;
  }
  const map = getFileMetaMap();
  map[blobId] = meta;
  writeJson(META_KEY, map);
}

/** Batch-write file metadata with a single index-changed event. */
export function mergeFileMeta(entries: Record<string, StoredFileMeta>) {
  const map = getFileMetaMap();
  let changed = false;
  for (const [blobId, meta] of Object.entries(entries)) {
    if (!blobId) {
      continue;
    }
    map[blobId] = meta;
    changed = true;
  }
  if (changed) {
    writeJson(META_KEY, map);
  }
}

export function removeFileMeta(blobId: string) {
  const map = getFileMetaMap();
  if (map[blobId]) {
    delete map[blobId];
    writeJson(META_KEY, map);
  }
}

export function renameFile(blobId: string, name: string) {
  const trimmed = name.trim();
  if (!blobId || !trimmed) {
    return;
  }
  const map = getFileMetaMap();
  const existing = map[blobId];
  map[blobId] = {
    name: trimmed,
    mimeType: existing?.mimeType,
    size: existing?.size,
    uploadedAt: existing?.uploadedAt ?? Date.now(),
  };
  writeJson(META_KEY, map);
}

// ---- Folders -------------------------------------------------------------

export function getFolders(): DriveFolder[] {
  return readJson<DriveFolder[]>(FOLDERS_KEY, []);
}

export function createFolder(name: string, parentId: string | null): DriveFolder {
  const folder: DriveFolder = {
    id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "Untitled folder",
    parentId,
    createdAt: Date.now(),
  };
  const folders = getFolders();
  folders.push(folder);
  writeJson(FOLDERS_KEY, folders);
  return folder;
}

export function renameFolder(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return;
  }
  const folders = getFolders().map((folder) =>
    folder.id === id ? { ...folder, name: trimmed } : folder,
  );
  writeJson(FOLDERS_KEY, folders);
}

/** All folder IDs in a tree rooted at `rootId` (includes `rootId`). */
export function collectDescendantFolderIds(rootId: string, folders = getFolders()): string[] {
  const ids: string[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    ids.push(current);
    for (const child of folders.filter((folder) => folder.parentId === current)) {
      stack.push(child.id);
    }
  }
  return ids;
}

/** Removes the folder tree and folder mappings. Returns blob IDs of files that lived in the tree. */
export function deleteFolder(id: string): string[] {
  const folders = getFolders();
  const removeIds = new Set(collectDescendantFolderIds(id, folders));
  const blobIds = collectFolderFileBlobIds(id, folders, getFileFolderMap());

  const nextFolders = folders.filter((folder) => !removeIds.has(folder.id));
  writeJson(FOLDERS_KEY, nextFolders);

  const fileFolders = getFileFolderMap();
  let changed = false;
  for (const blobId of blobIds) {
    if (fileFolders[blobId]) {
      delete fileFolders[blobId];
      changed = true;
    }
  }
  if (changed) {
    writeJson(FILE_FOLDER_KEY, fileFolders);
  }

  return blobIds;
}

export function getFolderById(id: string): DriveFolder | undefined {
  return getFolders().find((folder) => folder.id === id);
}

export function moveFolderToParent(folderId: string, parentId: string | null) {
  const folders = getFolders().map((folder) =>
    folder.id === folderId ? { ...folder, parentId } : folder,
  );
  writeJson(FOLDERS_KEY, folders);
}

export function duplicateFolder(folderId: string, parentId: string | null): DriveFolder | null {
  const source = getFolderById(folderId);
  if (!source) {
    return null;
  }
  const clone = createFolder(`${source.name} (copy)`, parentId);
  const fileFolders = getFileFolderMap();
  for (const [blobId, folderIds] of Object.entries(fileFolders)) {
    if (folderIds.includes(folderId)) {
      addFileToFolder(blobId, clone.id);
    }
  }
  const childFolders = getFolders().filter((folder) => folder.parentId === folderId);
  for (const child of childFolders) {
    duplicateFolder(child.id, clone.id);
  }
  return clone;
}

export function getFileFolderMap(): Record<string, string[]> {
  const raw = readJson<Record<string, string | string[]>>(FILE_FOLDER_KEY, {});
  const migrated: Record<string, string[]> = {};
  for (const [blobId, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      migrated[blobId] = value;
    } else if (typeof value === "string" && value) {
      migrated[blobId] = [value];
    }
  }
  return migrated;
}

export function fileInFolder(blobId: string, folderId: string | null, map = getFileFolderMap()): boolean {
  const folders = map[blobId] ?? [];
  if (folderId === null) {
    return folders.length === 0;
  }
  return folders.includes(folderId);
}

export function addFileToFolder(blobId: string, folderId: string) {
  const map = getFileFolderMap();
  const current = new Set(map[blobId] ?? []);
  current.add(folderId);
  map[blobId] = Array.from(current);
  writeJson(FILE_FOLDER_KEY, map);
}

export function removeFileFromFolder(blobId: string, folderId: string | null) {
  const map = getFileFolderMap();
  if (folderId === null) {
    delete map[blobId];
    writeJson(FILE_FOLDER_KEY, map);
    return;
  }
  const next = (map[blobId] ?? []).filter((entry) => entry !== folderId);
  if (next.length > 0) {
    map[blobId] = next;
  } else {
    delete map[blobId];
  }
  writeJson(FILE_FOLDER_KEY, map);
}

export function moveFileToFolder(blobId: string, folderId: string | null) {
  const map = getFileFolderMap();
  if (folderId) {
    map[blobId] = [folderId];
  } else {
    delete map[blobId];
  }
  writeJson(FILE_FOLDER_KEY, map);
}

export function copyFileToFolder(blobId: string, folderId: string | null) {
  if (folderId) {
    addFileToFolder(blobId, folderId);
    return;
  }
  removeFileFromFolder(blobId, null);
}

export function collectFolderFileBlobIds(
  folderId: string,
  folders = getFolders(),
  map = getFileFolderMap(),
): string[] {
  const blobIds = new Set<string>();
  for (const [blobId, folderIds] of Object.entries(map)) {
    if (folderIds.includes(folderId)) {
      blobIds.add(blobId);
    }
  }
  for (const child of folders.filter((folder) => folder.parentId === folderId)) {
    for (const nested of collectFolderFileBlobIds(child.id, folders, map)) {
      blobIds.add(nested);
    }
  }
  return Array.from(blobIds);
}

const FOLDER_SHARE_KEY = "decendrive:folder-shares";

export type FolderShareManifest = {
  folderId: string;
  folderName: string;
  blobIds: string[];
  createdAt: number;
};

export function saveFolderShareManifest(manifest: FolderShareManifest) {
  const all = readJson<Record<string, FolderShareManifest>>(FOLDER_SHARE_KEY, {});
  all[manifest.folderId] = manifest;
  if (isBrowser()) {
    writeWalletJson(FOLDER_SHARE_KEY, all);
  }
}

export function getFolderShareManifest(folderId: string): FolderShareManifest | undefined {
  const all = readJson<Record<string, FolderShareManifest>>(FOLDER_SHARE_KEY, {});
  return all[folderId];
}

export { getHiddenBlobIds, hideBlobFromDrive, isHiddenFromDrive, unhideBlobFromDrive } from "@/lib/drive/hidden-blobs";
export {
  getDeletedBlobIds,
  getTrashedBlobIds,
  markDeleted,
  moveFileToTrash,
  moveFolderToTrash,
  restoreFileFromTrash,
  restoreFolderFromTrash,
} from "@/lib/drive/trash";

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  html: "text/html",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  zip: "application/zip",
};

export function guessMimeFromName(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  const ext = match?.[1]?.toLowerCase();
  if (ext && MIME_BY_EXTENSION[ext]) {
    return MIME_BY_EXTENSION[ext];
  }
  return "application/octet-stream";
}

export type PreviewKind = "image" | "pdf" | "video" | "audio" | "text" | "unsupported";

export function previewKindForMime(mimeType: string): PreviewKind {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  ) {
    return "text";
  }
  return "unsupported";
}
