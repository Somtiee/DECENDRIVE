"use client";

import { format } from "date-fns";
import { useCurrentAccount } from "@mysten/dapp-kit";
import {
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  File as FileIcon,
  Folder,
  FolderMinus,
  FolderPlus,
  Home,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  Pencil,
  RotateCcw,
  Scissors,
  Share2,
  Trash2,
  Wallet2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { DriveClipboard, DriveClipboardItem } from "@/lib/drive/clipboard";
import {
  DeleteConfirmModal,
  type DeleteConfirmMode,
  type DeleteTarget,
} from "@/components/drive/DeleteConfirmModal";
import { TrustBadgeRow } from "@/components/drive/trust";
import {
  TRASH_RETENTION_DAYS,
  collectTrashBlobIdsForFolder,
  daysUntilPurge,
  getTrashFileEntry,
} from "@/lib/drive/trash";
import { AccessRevokedDialog } from "@/components/drive/AccessRevokedDialog";
import { ItemMenu, type MenuItem } from "@/components/drive/ItemMenu";
import { SelectionCheckbox } from "@/components/drive/SelectionCheckbox";
import type { PreviewTarget } from "@/components/drive/PreviewModal";
import type { DriveView } from "@/components/drive/sidebar";
import type { OwnedFileView } from "@/components/drive/types";
import { Pagination } from "@/components/drive/Pagination";
import { useFileActions } from "@/components/drive/use-file-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { paginateSlice, type PageSizeOption, type PaginationMeta } from "@/lib/drive/pagination";
import { removeSavedReceived } from "@/lib/drive/saved-received";
import { WALLET_CHANGED_EVENT } from "@/lib/drive/wallet-storage";
import {
  addFileToFolder,
  collectFolderFileBlobIds,
  copyFileToFolder,
  createFolder,
  duplicateFolder,
  FILE_INDEX_EVENT,
  fileInFolder,
  getFileFolderMap,
  getFolders,
  moveFileToFolder,
  moveFolderToParent,
  previewKindForMime,
  removeFileFromFolder,
  renameFile,
  renameFolder,
  type DriveFolder,
} from "@/lib/drive/file-metadata";

type DriveExplorerProps = {
  view: DriveView;
  files: OwnedFileView[];
  trashFolders?: DriveFolder[];
  isLoading: boolean;
  isConnected: boolean;
  viewMode: "list" | "grid";
  onViewModeChange: (mode: "list" | "grid") => void;
  onPreview: (preview: PreviewTarget) => void;
  onShare?: (file: OwnedFileView) => void;
  onShareFolder?: (folder: DriveFolder, folderFiles: OwnedFileView[]) => void;
  onRenameFile?: (file: OwnedFileView, name: string) => void | Promise<void>;
  onDelete: (payload: { files: OwnedFileView[]; folders: DriveFolder[] }) => void | Promise<void>;
  onRestore?: (payload: { files: OwnedFileView[]; folders: DriveFolder[] }) => void | Promise<void>;
  highlightBlobId?: string | null;
  onIndexChange: () => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSizeOption) => void;
};

function formatBytes(bytes: number) {
  if (!bytes) {
    return "—";
  }
  const sizes = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** index).toFixed(2)} ${sizes[index]}`;
}

function fileIconFor(file: OwnedFileView) {
  const kind = previewKindForMime(file.mimeType ?? "");
  switch (kind) {
    case "image":
      return FileImage;
    case "video":
      return FileVideo;
    case "audio":
      return FileAudio;
    case "pdf":
    case "text":
      return FileText;
    default:
      return file.mimeType?.includes("zip") ? FileArchive : FileIcon;
  }
}

export function DriveExplorer({
  view,
  files,
  trashFolders = [],
  isLoading,
  isConnected,
  viewMode,
  onViewModeChange,
  onPreview,
  onShare,
  onShareFolder,
  onRenameFile,
  onDelete,
  onRestore,
  highlightBlobId = null,
  onIndexChange,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: DriveExplorerProps) {
  const account = useCurrentAccount();
  const [revokedDialogFile, setRevokedDialogFile] = useState<string | null>(null);
  const { busyBlobId, openPreview, download } = useFileActions(onPreview, {
    recipientAddress: account?.address,
    onAccessRevoked: (fileName) => setRevokedDialogFile(fileName),
  });

  const isTrashView = view === "trash";
  const supportsFolders = view === "my-drive";
  const deleteMode: DeleteConfirmMode = isTrashView ? "delete-forever" : "move-to-trash";
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [fileFolderMap, setFileFolderMap] = useState<Record<string, string[]>>({});
  const [clipboard, setClipboard] = useState<DriveClipboard>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(() => new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(() => new Set());
  // Folder navigation only applies inside My Drive.
  const folderId = supportsFolders ? currentFolderId : null;

  const reload = useCallback(() => {
    setFolders(getFolders());
    setFileFolderMap(getFileFolderMap());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const handler = () => reload();
    window.addEventListener(FILE_INDEX_EVENT, handler);
    return () => window.removeEventListener(FILE_INDEX_EVENT, handler);
  }, [reload]);

  useEffect(() => {
    const resetForWallet = () => {
      setCurrentFolderId(null);
      setClipboard(null);
      setSelectedFileIds(new Set());
      setSelectedFolderIds(new Set());
      onPageChange(1);
      reload();
    };
    window.addEventListener(WALLET_CHANGED_EVENT, resetForWallet);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, resetForWallet);
  }, [reload, onPageChange]);

  const childFolders = useMemo(() => {
    if (isTrashView) {
      return trashFolders;
    }
    if (supportsFolders) {
      return folders.filter((folder) => folder.parentId === folderId);
    }
    return [];
  }, [isTrashView, trashFolders, supportsFolders, folders, folderId]);

  const visibleFiles = useMemo(() => {
    if (isTrashView || !supportsFolders) {
      return files;
    }
    return files.filter((file) => fileInFolder(file.blobId, folderId, fileFolderMap));
  }, [isTrashView, supportsFolders, files, fileFolderMap, folderId]);

  useEffect(() => {
      onPageChange(1);
      setSelectedFileIds(new Set());
    setSelectedFolderIds(new Set());
  }, [folderId, onPageChange]);

  useEffect(() => {
    onPageChange(1);
  }, [pageSize, onPageChange]);

  const filesByBlob = useMemo(() => new Map(files.map((file) => [file.blobId, file])), [files]);

  const explorerRows = useMemo(
    () => [
      ...childFolders.map((folder) => ({ kind: "folder" as const, folder })),
      ...visibleFiles.map((file) => ({ kind: "file" as const, file })),
    ],
    [childFolders, visibleFiles],
  );

  const pagedExplorer = useMemo(
    () => paginateSlice(explorerRows, page, pageSize),
    [explorerRows, page, pageSize],
  );

  const pagedFolders = useMemo(
    () =>
      pagedExplorer.items
        .filter((row) => row.kind === "folder")
        .map((row) => row.folder),
    [pagedExplorer.items],
  );

  const pagedFiles = useMemo(
    () =>
      pagedExplorer.items
        .filter((row) => row.kind === "file")
        .map((row) => row.file),
    [pagedExplorer.items],
  );

  const explorerPagination = pagedExplorer.pagination;

  const toggleFileSelection = useCallback((blobId: string, checked: boolean) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(blobId);
      } else {
        next.delete(blobId);
      }
      return next;
    });
  }, []);

  const toggleFolderSelection = useCallback((id: string, checked: boolean) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const getSelectedItems = useCallback(() => {
    const selectedFiles = files.filter((file) => selectedFileIds.has(file.blobId));
    const selectedFolders = folders.filter((folder) => selectedFolderIds.has(folder.id));
    return { selectedFiles, selectedFolders };
  }, [files, folders, selectedFileIds, selectedFolderIds]);

  const breadcrumbs = useMemo(() => {
    const trail: DriveFolder[] = [];
    let cursor = folderId;
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    while (cursor) {
      const folder = byId.get(cursor);
      if (!folder) {
        break;
      }
      trail.unshift(folder);
      cursor = folder.parentId;
    }
    return trail;
  }, [folderId, folders]);

  const commit = useCallback(() => {
    reload();
    onIndexChange();
  }, [reload, onIndexChange]);

  const handleNewFolder = () => {
    const folder = createFolder("Untitled folder", folderId);
    commit();
    setRenamingId(folder.id);
    setRenameValue(folder.name);
  };

  const startRename = (id: string, current: string) => {
    setRenamingId(id);
    setRenameValue(current);
  };

  const submitRename = (id: string, isFolder: boolean) => {
    const value = renameValue.trim();
    if (value) {
      if (isFolder) {
        renameFolder(id, value);
        commit();
      } else {
        const file = files.find((entry) => entry.blobId === id);
        if (file && onRenameFile) {
          void onRenameFile(file, value);
        } else {
          renameFile(id, value);
          commit();
        }
      }
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const applyClipboard = useCallback(
    (items: DriveClipboardItem[]) => {
      for (const item of items) {
        if (item.kind === "file") {
          if (item.mode === "cut") {
            removeFileFromFolder(item.blobId, item.sourceFolderId);
            if (folderId) {
              addFileToFolder(item.blobId, folderId);
            } else {
              moveFileToFolder(item.blobId, null);
            }
          } else {
            copyFileToFolder(item.blobId, folderId);
          }
        } else if (item.kind === "folder") {
          if (item.mode === "cut") {
            moveFolderToParent(item.folderId, folderId);
          } else {
            duplicateFolder(item.folderId, folderId);
          }
        }
      }
      commit();
      setSelectedFileIds(new Set());
      setSelectedFolderIds(new Set());
    },
    [folderId, commit],
  );

  const handlePaste = useCallback(() => {
    if (!clipboard?.items.length) {
      return;
    }
    applyClipboard(clipboard.items);
    const count = clipboard.items.length;
    toast.success(
      clipboard.items[0]?.mode === "copy"
        ? `Pasted ${count} item${count === 1 ? "" : "s"} here.`
        : `Moved ${count} item${count === 1 ? "" : "s"} here.`,
    );
    setClipboard(null);
  }, [applyClipboard, clipboard]);

  const cutSelection = useCallback(() => {
    const { selectedFiles, selectedFolders } = getSelectedItems();
    if (selectedFiles.length === 0 && selectedFolders.length === 0) {
      return;
    }
    const items: DriveClipboardItem[] = [
      ...selectedFiles.map((file) => ({
        kind: "file" as const,
        blobId: file.blobId,
        name: file.name,
        sourceFolderId: folderId,
        mode: "cut" as const,
      })),
      ...selectedFolders.map((folder) => ({
        kind: "folder" as const,
        folderId: folder.id,
        name: folder.name,
        sourceParentId: folderId,
        mode: "cut" as const,
      })),
    ];
    setClipboard({ items });
    toast.message(`${items.length} item${items.length === 1 ? "" : "s"} ready to move (Ctrl+V to paste).`);
  }, [folderId, getSelectedItems]);

  const copySelection = useCallback(() => {
    const { selectedFiles, selectedFolders } = getSelectedItems();
    if (selectedFiles.length === 0 && selectedFolders.length === 0) {
      return;
    }
    const items: DriveClipboardItem[] = [
      ...selectedFiles.map((file) => ({
        kind: "file" as const,
        blobId: file.blobId,
        name: file.name,
        sourceFolderId: folderId,
        mode: "copy" as const,
      })),
      ...selectedFolders.map((folder) => ({
        kind: "folder" as const,
        folderId: folder.id,
        name: folder.name,
        sourceParentId: folderId,
        mode: "copy" as const,
      })),
    ];
    setClipboard({ items });
    toast.message(`${items.length} item${items.length === 1 ? "" : "s"} copied (Ctrl+V to paste).`);
  }, [folderId, getSelectedItems]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (key === "delete" && !mod) {
        const { selectedFiles, selectedFolders } = getSelectedItems();
        if (selectedFiles.length > 0 || selectedFolders.length > 0) {
          event.preventDefault();
          setDeleteTarget({
            type: "batch",
            files: selectedFiles,
            folders: selectedFolders,
          });
        }
        return;
      }
      if (!mod) {
        return;
      }
      if (key === "x") {
        event.preventDefault();
        cutSelection();
      } else if (key === "c") {
        event.preventDefault();
        copySelection();
      } else if (key === "v") {
        event.preventDefault();
        handlePaste();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cutSelection, copySelection, handlePaste, getSelectedItems]);

  const moveToFolder = (file: OwnedFileView, folderId: string | null) => {
    moveFileToFolder(file.blobId, folderId);
    commit();
    toast.success(folderId ? `Moved "${file.name}".` : `Moved "${file.name}" to My Drive.`);
  };

  const removeReceivedFromDrive = (file: OwnedFileView) => {
    removeSavedReceived(file.blobId);
    removeFileFromFolder(file.blobId, null);
    commit();
    toast.success(`"${file.name}" removed from My Drive.`);
  };

  const fileMenu = (file: OwnedFileView): MenuItem[] => {
    const items: MenuItem[] = [
      { label: "Open", icon: FileIcon, onClick: () => void openPreview(file) },
      { label: "Download", icon: Download, onClick: () => void download(file) },
    ];

    if (file.isOwner && !isTrashView) {
      items.push({ label: "Rename", icon: Pencil, onClick: () => startRename(file.blobId, file.name) });
      if (onShare && view === "my-drive") {
        items.push({ label: "Share", icon: Share2, onClick: () => onShare(file) });
      }
      if (supportsFolders) {
        items.push({
          label: "Cut",
          icon: Scissors,
          onClick: () => {
            setClipboard({
              items: [
                {
                  kind: "file",
                  blobId: file.blobId,
                  name: file.name,
                  sourceFolderId: folderId,
                  mode: "cut",
                },
              ],
            });
            toast.message(`"${file.name}" ready to move (Ctrl+V to paste).`);
          },
        });
        items.push({
          label: "Copy",
          icon: Copy,
          onClick: () => {
            setClipboard({
              items: [
                {
                  kind: "file",
                  blobId: file.blobId,
                  name: file.name,
                  sourceFolderId: folderId,
                  mode: "copy",
                },
              ],
            });
            toast.message(`"${file.name}" copied (Ctrl+V to paste).`);
          },
        });
        if (folderId) {
          items.push({
            label: "Move to My Drive",
            icon: Home,
            onClick: () => moveToFolder(file, null),
          });
        }
      }
    }

    if (file.savedFromReceived && !isTrashView) {
      items.push({
        label: "Remove from My Drive",
        icon: FolderMinus,
        destructive: true,
        onClick: () => removeReceivedFromDrive(file),
      });
    }

    if (file.isOwner && isTrashView && onRestore) {
      items.push({
        label: "Restore",
        icon: RotateCcw,
        onClick: () => void onRestore({ files: [file], folders: [] }),
      });
    }

    if (file.isOwner) {
      items.push({
        label: isTrashView ? "Delete permanently" : "Delete",
        icon: Trash2,
        destructive: true,
        onClick: () => setDeleteTarget({ type: "file", file }),
      });
    }

    return items;
  };

  const folderFilesFor = useCallback(
    (folder: DriveFolder) => {
      const blobIds = isTrashView
        ? collectTrashBlobIdsForFolder(folder.id)
        : collectFolderFileBlobIds(folder.id);
      return blobIds
        .map((blobId) => filesByBlob.get(blobId))
        .filter((entry): entry is OwnedFileView => Boolean(entry));
    },
    [filesByBlob, isTrashView],
  );

  const folderMenu = (folder: DriveFolder): MenuItem[] => {
    if (isTrashView) {
      const items: MenuItem[] = [];
      if (onRestore) {
        items.push({
          label: "Restore",
          icon: RotateCcw,
          onClick: () => void onRestore({ files: [], folders: [folder] }),
        });
      }
      items.push({
        label: "Delete folder permanently",
        icon: Trash2,
        destructive: true,
        onClick: () =>
          setDeleteTarget({
            type: "folder",
            folder,
            fileCount: folderFilesFor(folder).length,
          }),
      });
      return items;
    }

    const items: MenuItem[] = [
      { label: "Open", icon: Folder, onClick: () => setCurrentFolderId(folder.id) },
      { label: "Rename", icon: Pencil, onClick: () => startRename(folder.id, folder.name) },
    ];
    if (onShareFolder && view === "my-drive") {
      items.push({
        label: "Share",
        icon: Share2,
        onClick: () => onShareFolder(folder, folderFilesFor(folder)),
      });
    }
    if (supportsFolders) {
      items.push({
        label: "Cut",
        icon: Scissors,
        onClick: () => {
          setClipboard({
            items: [
              {
                kind: "folder",
                folderId: folder.id,
                name: folder.name,
                sourceParentId: folderId,
                mode: "cut",
              },
            ],
          });
          toast.message(`"${folder.name}" ready to move (Ctrl+V to paste).`);
        },
      });
      items.push({
        label: "Copy",
        icon: Copy,
        onClick: () => {
          setClipboard({
            items: [
              {
                kind: "folder",
                folderId: folder.id,
                name: folder.name,
                sourceParentId: folderId,
                mode: "copy",
              },
            ],
          });
          toast.message(`"${folder.name}" copied (Ctrl+V to paste).`);
        },
      });
    }
    items.push({
      label: isTrashView ? "Delete folder permanently" : "Delete folder",
      icon: Trash2,
      destructive: true,
      onClick: () =>
        setDeleteTarget({
          type: "folder",
          folder,
          fileCount: isTrashView
            ? folderFilesFor(folder).length
            : collectFolderFileBlobIds(folder.id).length,
        }),
    });
    return items;
  };

  const isEmpty = explorerRows.length === 0;

  return (
    <section className="rounded-xl border border-border/70 bg-card/70">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-border/70 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          {supportsFolders ? (
            <>
              <button
                type="button"
                onClick={() => setCurrentFolderId(null)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-secondary/60"
              >
                <Home className="h-4 w-4" />
                My Drive
              </button>
              {breadcrumbs.map((folder) => (
                <span key={folder.id} className="inline-flex items-center">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => setCurrentFolderId(folder.id)}
                    className="max-w-[12rem] truncate rounded-md px-2 py-1 hover:bg-secondary/60"
                  >
                    {folder.name}
                  </button>
                </span>
              ))}
            </>
          ) : isTrashView ? (
            <span className="px-1 text-sm text-muted-foreground">Deleted items</span>
          ) : (
            <span className="px-1 font-semibold capitalize">{view.replace("-", " ")}</span>
          )}
        </div>

        {view === "my-drive" && (
          <TrustBadgeRow
            kinds={["encrypted", "walrus", "onchain"]}
            className="w-full sm:w-auto"
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {clipboard && supportsFolders && (
            <Button type="button" size="sm" variant="outline" onClick={handlePaste}>
              <ClipboardPaste className="mr-1.5 h-4 w-4 sm:mr-2" />
              Paste
            </Button>
          )}
          {supportsFolders && (
            <Button type="button" size="sm" variant="outline" onClick={handleNewFolder}>
              <FolderPlus className="mr-1.5 h-4 w-4 sm:mr-2" />
              <span className="max-w-[8rem] truncate sm:max-w-none">New folder</span>
            </Button>
          )}
          <div className="flex overflow-hidden rounded-md border border-border">
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              className={`flex h-8 w-8 items-center justify-center ${
                viewMode === "list" ? "bg-secondary text-foreground" : "text-muted-foreground"
              }`}
              aria-label="List view"
            >
              <ListIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("grid")}
              className={`flex h-8 w-8 items-center justify-center ${
                viewMode === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground"
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {(selectedFileIds.size > 0 || selectedFolderIds.size > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-sky-500/5 px-4 py-2 text-xs text-muted-foreground">
          <span>
            {selectedFileIds.size + selectedFolderIds.size} selected
            {isTrashView
              ? ""
              : " — Ctrl+X cut · Ctrl+C copy · Ctrl+V paste"}
          </span>
          {isTrashView && onRestore ? (
            <button
              type="button"
              className="rounded-md border border-emerald-500/40 px-2 py-0.5 text-emerald-200 hover:bg-emerald-500/10"
              onClick={() => {
                const { selectedFiles, selectedFolders } = getSelectedItems();
                void onRestore({ files: selectedFiles, folders: selectedFolders });
                setSelectedFileIds(new Set());
                setSelectedFolderIds(new Set());
              }}
            >
              Restore
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-border px-2 py-0.5 hover:bg-secondary/60"
            onClick={() => {
              setSelectedFileIds(new Set());
              setSelectedFolderIds(new Set());
            }}
          >
            Clear
          </button>
        </div>
      )}

      {clipboard && (
        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Scissors className="h-3.5 w-3.5" />
            {clipboard.items.length} item{clipboard.items.length === 1 ? "" : "s"} on clipboard — Ctrl+V to
            paste here
          </span>
          <button type="button" onClick={() => setClipboard(null)} className="hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* States */}
      {!isConnected && (
        <EmptyBlock
          icon={<Wallet2 className="h-6 w-6 text-muted-foreground" />}
          title="Connect your wallet"
          subtitle="Connect a Sui wallet to load your encrypted files."
        />
      )}

      {isConnected && isLoading && (
        <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your files…
        </div>
      )}

      {isConnected && !isLoading && isEmpty && (
        <EmptyBlock
          icon={
            isTrashView ? (
              <Trash2 className="h-6 w-6 text-muted-foreground" />
            ) : (
              <Folder className="h-6 w-6 text-muted-foreground" />
            )
          }
          title={isTrashView ? "Trash is empty" : "Nothing here yet"}
          subtitle={
            isTrashView
              ? `Deleted files appear here for ${TRASH_RETENTION_DAYS} days before permanent removal.`
              : supportsFolders
                ? "Upload a file or create a folder to get started."
                : "Files will appear here as they become available."
          }
        />
      )}

      {/* Content */}
      {isConnected && !isLoading && !isEmpty && viewMode === "list" && (
        <ListView
          trashHint={isTrashView}
          childFolders={pagedFolders}
          files={pagedFiles}
          highlightBlobId={highlightBlobId}
          selectedFileIds={selectedFileIds}
          selectedFolderIds={selectedFolderIds}
          onToggleFile={toggleFileSelection}
          onToggleFolder={toggleFolderSelection}
          busyBlobId={busyBlobId}
          renamingId={renamingId}
          renameValue={renameValue}
          onRenameValue={setRenameValue}
          onSubmitRename={submitRename}
          onOpenFolder={setCurrentFolderId}
          onOpenFile={(file) => void openPreview(file)}
          fileMenu={fileMenu}
          folderMenu={folderMenu}
        />
      )}

      {isConnected && !isLoading && !isEmpty && viewMode === "grid" && (
        <GridView
          trashHint={isTrashView}
          childFolders={pagedFolders}
          files={pagedFiles}
          highlightBlobId={highlightBlobId}
          selectedFileIds={selectedFileIds}
          selectedFolderIds={selectedFolderIds}
          onToggleFile={toggleFileSelection}
          onToggleFolder={toggleFolderSelection}
          busyBlobId={busyBlobId}
          renamingId={renamingId}
          renameValue={renameValue}
          onRenameValue={setRenameValue}
          onSubmitRename={submitRename}
          onOpenFolder={setCurrentFolderId}
          onOpenFile={(file) => void openPreview(file)}
          fileMenu={fileMenu}
          folderMenu={folderMenu}
        />
      )}

      {isConnected && !isLoading && !isEmpty && (
        <div className="border-t border-border/70 px-4 py-3">
          <Pagination
            pagination={explorerPagination}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </div>
      )}

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        target={deleteTarget}
        mode={deleteMode}
        isDeleting={isDeleting}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={() => {
          if (!deleteTarget || isDeleting) {
            return;
          }
          void (async () => {
            setIsDeleting(true);
            try {
              if (deleteTarget.type === "file") {
                await onDelete({ files: [deleteTarget.file], folders: [] });
              } else if (deleteTarget.type === "folder") {
                await onDelete({ files: [], folders: [deleteTarget.folder] });
              } else {
                await onDelete({
                  files: deleteTarget.files,
                  folders: deleteTarget.folders,
                });
              }
              setDeleteTarget(null);
              setSelectedFileIds(new Set());
              setSelectedFolderIds(new Set());
            } catch {
              // Parent shows error toast; keep dialog open for retry.
            } finally {
              setIsDeleting(false);
            }
          })();
        }}
      />

      <AccessRevokedDialog
        open={Boolean(revokedDialogFile)}
        fileName={revokedDialogFile ?? undefined}
        onClose={() => setRevokedDialogFile(null)}
      />
    </section>
  );
}

function EmptyBlock({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/60">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

type RenameProps = {
  renamingId: string | null;
  renameValue: string;
  onRenameValue: (value: string) => void;
  onSubmitRename: (id: string, isFolder: boolean) => void;
};

type ViewProps = RenameProps & {
  trashHint?: boolean;
  highlightBlobId?: string | null;
  childFolders: DriveFolder[];
  files: OwnedFileView[];
  busyBlobId: string | null;
  selectedFileIds: Set<string>;
  selectedFolderIds: Set<string>;
  onToggleFile: (blobId: string, checked: boolean) => void;
  onToggleFolder: (folderId: string, checked: boolean) => void;
  onOpenFolder: (id: string) => void;
  onOpenFile: (file: OwnedFileView) => void;
  fileMenu: (file: OwnedFileView) => MenuItem[];
  folderMenu: (folder: DriveFolder) => MenuItem[];
};

function RenameInput({
  id,
  isFolder,
  renameValue,
  onRenameValue,
  onSubmitRename,
}: {
  id: string;
  isFolder: boolean;
} & RenameProps) {
  return (
    <input
      autoFocus
      value={renameValue}
      onChange={(event) => onRenameValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={() => onSubmitRename(id, isFolder)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onSubmitRename(id, isFolder);
        }
        if (event.key === "Escape") {
          onSubmitRename(id, isFolder);
        }
      }}
      className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-sm outline-none"
    />
  );
}

function ListView(props: ViewProps) {
  const {
    trashHint = false,
    highlightBlobId = null,
    childFolders,
    files,
    busyBlobId,
    selectedFileIds,
    selectedFolderIds,
    onToggleFile,
    onToggleFolder,
    onOpenFolder,
    onOpenFile,
    fileMenu,
    folderMenu,
    renamingId,
    renameValue,
    onRenameValue,
    onSubmitRename,
  } = props;

  return (
    <div className="overflow-x-auto px-1 pb-2 sm:px-2">
      <table className="w-full min-w-[320px] text-left text-sm sm:min-w-[520px]">
        <thead>
          <tr className="border-b border-border/70 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="w-10 px-1 py-2 sm:px-2" aria-label="Select" />
            <th className="px-1 py-2 font-medium sm:px-2">Name</th>
            <th className="hidden px-2 py-2 font-medium md:table-cell">Last modified</th>
            <th className="hidden px-2 py-2 font-medium sm:table-cell">Size</th>
            <th className="w-12 px-1 py-2 text-right font-medium sm:px-2 sm:w-auto">Actions</th>
          </tr>
        </thead>
        <tbody>
          {childFolders.map((folder) => (
            <tr
              key={folder.id}
              className="group cursor-pointer border-b border-border/40 hover:bg-secondary/30"
              onClick={() => renamingId !== folder.id && onOpenFolder(folder.id)}
            >
              <td className="px-2 py-2.5">
                <SelectionCheckbox
                  checked={selectedFolderIds.has(folder.id)}
                  label={`Select folder ${folder.name}`}
                  onChange={(checked) => onToggleFolder(folder.id, checked)}
                />
              </td>
              <td className="px-2 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Folder className="h-4 w-4 shrink-0 text-primary" />
                  {renamingId === folder.id ? (
                    <RenameInput
                      id={folder.id}
                      isFolder
                      renamingId={renamingId}
                      renameValue={renameValue}
                      onRenameValue={onRenameValue}
                      onSubmitRename={onSubmitRename}
                    />
                  ) : (
                    <span className="truncate font-medium">{folder.name}</span>
                  )}
                </div>
              </td>
              <td className="hidden px-2 py-2.5 text-muted-foreground md:table-cell">
                {trashHint ? (
                  <span className="font-semibold text-amber-200/90">
                    {daysUntilPurge(folder.createdAt)}d left
                  </span>
                ) : (
                  format(new Date(folder.createdAt), "MMM d, yyyy")
                )}
              </td>
              <td className="hidden px-2 py-2.5 text-muted-foreground sm:table-cell">—</td>
              <td className="px-1 py-2.5 text-right sm:px-2">
                <div className="flex justify-end opacity-70 transition group-hover:opacity-100">
                  <ItemMenu items={folderMenu(folder)} />
                </div>
              </td>
            </tr>
          ))}

          {files.map((file) => {
            const Icon = fileIconFor(file);
            const busy = busyBlobId === file.blobId;
            return (
              <tr
                key={file.objectId}
                className={cn(
                  "group cursor-pointer border-b border-border/40 hover:bg-secondary/30",
                  highlightBlobId === file.blobId && "bg-sky-500/10 ring-1 ring-sky-400/40",
                )}
                onClick={() => renamingId !== file.blobId && onOpenFile(file)}
              >
                <td className="px-2 py-2.5">
                  <SelectionCheckbox
                    checked={selectedFileIds.has(file.blobId)}
                    label={`Select file ${file.name}`}
                    onChange={(checked) => onToggleFile(file.blobId, checked)}
                  />
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {busy ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    {renamingId === file.blobId ? (
                      <RenameInput
                        id={file.blobId}
                        isFolder={false}
                        renamingId={renamingId}
                        renameValue={renameValue}
                        onRenameValue={onRenameValue}
                        onSubmitRename={onSubmitRename}
                      />
                    ) : (
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate">{file.name}</span>
                        {file.savedFromReceived ? (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200">
                            Received
                          </span>
                        ) : null}
                        {trashHint && getTrashFileEntry(file.blobId) ? (
                          <p className="text-xs font-semibold text-amber-200/90">
                            {daysUntilPurge(getTrashFileEntry(file.blobId)!.deletedAt)} days until
                            permanent delete
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </td>
                <td className="hidden px-2 py-2.5 text-muted-foreground md:table-cell">
                  {trashHint && getTrashFileEntry(file.blobId) ? (
                    <span className="font-semibold text-amber-200/90">
                      {daysUntilPurge(getTrashFileEntry(file.blobId)!.deletedAt)}d left
                    </span>
                  ) : (
                    format(new Date(file.date), "MMM d, yyyy")
                  )}
                </td>
                <td className="hidden px-2 py-2.5 text-muted-foreground sm:table-cell">
                  {formatBytes(file.size)}
                </td>
                <td className="px-1 py-2.5 text-right sm:px-2">
                  <div className="flex items-center justify-end gap-1 opacity-70 transition group-hover:opacity-100">
                    <ItemMenu items={fileMenu(file)} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GridView(props: ViewProps) {
  const {
    trashHint = false,
    highlightBlobId = null,
    childFolders,
    files,
    busyBlobId,
    selectedFileIds,
    selectedFolderIds,
    onToggleFile,
    onToggleFolder,
    onOpenFolder,
    onOpenFile,
    fileMenu,
    folderMenu,
    renamingId,
    renameValue,
    onRenameValue,
    onSubmitRename,
  } = props;

  return (
    <div className="space-y-4 p-4">
      {childFolders.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Folders</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {childFolders.map((folder) => (
              <div
                key={folder.id}
                className="group flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2.5 transition hover:bg-secondary/40"
                onClick={() => renamingId !== folder.id && onOpenFolder(folder.id)}
              >
                <SelectionCheckbox
                  checked={selectedFolderIds.has(folder.id)}
                  label={`Select folder ${folder.name}`}
                  onChange={(checked) => onToggleFolder(folder.id, checked)}
                />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Folder className="h-4 w-4 shrink-0 text-primary" />
                  {renamingId === folder.id ? (
                    <RenameInput
                      id={folder.id}
                      isFolder
                      renamingId={renamingId}
                      renameValue={renameValue}
                      onRenameValue={onRenameValue}
                      onSubmitRename={onSubmitRename}
                    />
                  ) : (
                    <div className="min-w-0">
                      <span className="truncate text-sm font-medium">{folder.name}</span>
                      {trashHint ? (
                        <p className="text-xs font-semibold text-amber-200/90">
                          {daysUntilPurge(folder.createdAt)} days left
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="opacity-70 transition group-hover:opacity-100">
                  <ItemMenu items={folderMenu(folder)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Files</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {files.map((file) => {
              const Icon = fileIconFor(file);
              const busy = busyBlobId === file.blobId;
              const trashEntry = trashHint ? getTrashFileEntry(file.blobId) : undefined;
              return (
                <div
                  key={file.objectId}
                  className={cn(
                    "group relative cursor-pointer overflow-hidden rounded-lg border border-border/70 bg-background/40 transition hover:bg-secondary/30",
                    highlightBlobId === file.blobId && "ring-2 ring-sky-400/60",
                  )}
                  onClick={() => renamingId !== file.blobId && onOpenFile(file)}
                >
                  <div className="absolute left-2 top-2 z-10">
                    <SelectionCheckbox
                      checked={selectedFileIds.has(file.blobId)}
                      label={`Select file ${file.name}`}
                      onChange={(checked) => onToggleFile(file.blobId, checked)}
                    />
                  </div>
                  <div className="flex h-28 items-center justify-center bg-secondary/30">
                    {busy ? (
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    ) : (
                      <Icon className="h-9 w-9 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 px-2.5 py-2">
                    {renamingId === file.blobId ? (
                      <RenameInput
                        id={file.blobId}
                        isFolder={false}
                        renamingId={renamingId}
                        renameValue={renameValue}
                        onRenameValue={onRenameValue}
                        onSubmitRename={onSubmitRename}
                      />
                    ) : (
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-sm">{file.name}</span>
                        {trashEntry ? (
                          <p className="text-xs font-semibold text-amber-200/90">
                            {daysUntilPurge(trashEntry.deletedAt)} days left
                          </p>
                        ) : null}
                      </div>
                    )}
                    <div className="opacity-70 transition group-hover:opacity-100">
                      <ItemMenu items={fileMenu(file)} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
