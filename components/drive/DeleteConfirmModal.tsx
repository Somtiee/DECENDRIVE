"use client";

import { AlertTriangle, Folder, Loader2, Trash2, X } from "lucide-react";
import { useEffect } from "react";

import type { OwnedFileView } from "@/components/drive/types";
import type { DriveFolder } from "@/lib/drive/file-metadata";
import { TRASH_RETENTION_DAYS } from "@/lib/drive/trash";

export type DeleteTarget =
  | { type: "file"; file: OwnedFileView }
  | { type: "folder"; folder: DriveFolder; fileCount: number }
  | { type: "batch"; files: OwnedFileView[]; folders: DriveFolder[] };

export type DeleteConfirmMode = "move-to-trash" | "delete-forever";

type DeleteConfirmModalProps = {
  open: boolean;
  target: DeleteTarget | null;
  mode?: DeleteConfirmMode;
  isDeleting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

function describeTarget(target: DeleteTarget, mode: DeleteConfirmMode) {
  const toTrash = mode === "move-to-trash";

  if (target.type === "file") {
    return {
      title: toTrash ? "Delete?" : "Delete permanently?",
      name: target.file.name,
      permanentOnChain: !toTrash && Boolean(target.file.isWalrusBlob && target.file.deletable),
      isFolder: false,
      toTrash,
    };
  }
  if (target.type === "folder") {
    return {
      title: toTrash ? "Delete folder?" : "Delete folder permanently?",
      name: target.folder.name,
      permanentOnChain: false,
      isFolder: true,
      fileCount: target.fileCount,
      toTrash,
    };
  }
  const total = target.files.length + target.folders.length;
  const names = [
    ...target.folders.map((folder) => folder.name),
    ...target.files.map((file) => file.name),
  ];
  return {
    title: toTrash
      ? `Delete ${total} item${total === 1 ? "" : "s"}?`
      : `Delete ${total} item${total === 1 ? "" : "s"} permanently?`,
    name: names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3} more` : ""),
    permanentOnChain: !toTrash && target.files.some((file) => file.isWalrusBlob && file.deletable),
    isFolder: target.folders.length > 0,
    fileCount: target.files.length,
    folderCount: target.folders.length,
    toTrash,
  };
}

export function DeleteConfirmModal({
  open,
  target,
  mode = "move-to-trash",
  isDeleting = false,
  onOpenChange,
  onConfirm,
}: DeleteConfirmModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDeleting) {
        onOpenChange(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, isDeleting, onOpenChange]);

  if (!open || !target) {
    return null;
  }

  const info = describeTarget(target, mode);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#020408] p-3 sm:items-center sm:p-4"
      role="presentation"
      onClick={() => {
        if (!isDeleting) {
          onOpenChange(false);
        }
      }}
    >
      <div
        role="alertdialog"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        aria-modal="true"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-rose-500/35 bg-[#0b1018] p-5 shadow-[0_0_0_1px_rgba(244,63,94,0.12),0_0_40px_rgba(244,63,94,0.18),0_24px_48px_rgba(0,0,0,0.65)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-400/90 to-transparent"
          aria-hidden
        />
        <button
          type="button"
          disabled={isDeleting}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground hover:shadow-[0_0_12px_rgba(148,163,184,0.35)] disabled:opacity-40"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative mb-5 flex items-start gap-4 pr-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.35)]">
            {info.isFolder ? <Folder className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="delete-dialog-title"
              className="bg-gradient-to-r from-rose-200 via-rose-100 to-orange-100 bg-clip-text text-lg font-semibold tracking-tight text-transparent"
            >
              {info.title}
            </h2>
            <p id="delete-dialog-description" className="mt-1.5 text-sm leading-relaxed text-slate-300">
              {info.toTrash ? (
                <>
                  <span className="font-semibold text-white">{info.name}</span> will be deleted and moved to
                  Trash. You can delete it permanently from Trash anytime.
                </>
              ) : (
                <>
                  <span className="font-semibold text-white">{info.name}</span> will be deleted permanently.
                  This cannot be undone.
                </>
              )}
            </p>
            {target.type === "folder" && target.fileCount > 0 ? (
              <p className="mt-1 text-xs text-slate-400">
                {target.fileCount} file{target.fileCount === 1 ? "" : "s"} inside (including subfolders) are
                included.
              </p>
            ) : null}
          </div>
        </div>

        {info.toTrash ? (
          <p className="relative mb-5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-100">
            Items stay in Trash for{" "}
            <strong className="font-bold text-amber-50">{TRASH_RETENTION_DAYS} days</strong>, then they are
            deleted permanently.
          </p>
        ) : info.permanentOnChain ? (
          <p className="relative mb-5 rounded-xl border border-rose-500/30 bg-rose-950/80 px-3.5 py-3 text-xs leading-relaxed text-rose-200/90 shadow-[inset_0_0_20px_rgba(244,63,94,0.08)]">
            One or more Walrus blobs will be permanently deleted on Sui mainnet (gas required per deletable
            blob).
          </p>
        ) : (
          <p className="relative mb-5 rounded-xl border border-slate-700/80 bg-[#111827] px-3.5 py-3 text-xs leading-relaxed text-slate-400">
            {info.isFolder
              ? "The folder and its files are removed from your drive permanently."
              : "This item is removed from Trash and your drive permanently."}
          </p>
        )}

        <div className="relative flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={isDeleting}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-600 bg-[#141c28] px-4 text-sm font-medium text-slate-200 transition duration-200 hover:border-sky-400/60 hover:bg-[#1a2433] hover:text-white hover:shadow-[0_0_18px_rgba(56,189,248,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-rose-500/50 bg-gradient-to-r from-rose-600 to-rose-500 px-4 text-sm font-semibold text-white shadow-[0_0_20px_rgba(244,63,94,0.4)] transition duration-200 hover:scale-[1.02] hover:border-rose-400 hover:from-rose-500 hover:to-orange-500 hover:shadow-[0_0_28px_rgba(244,63,94,0.55)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 disabled:pointer-events-none disabled:opacity-60"
            onClick={onConfirm}
          >
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            {isDeleting
              ? "Deleting…"
              : info.toTrash
                ? "Delete"
                : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
