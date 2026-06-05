"use client";

import { format } from "date-fns";
import { FileIcon, HardDrive, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { OwnedFileView } from "@/components/drive/types";
import { SelectionCheckbox } from "@/components/drive/SelectionCheckbox";
import { Button } from "@/components/ui/button";
import { selectExpiredRentFiles } from "@/lib/drive/storage-display";
import { Pagination } from "@/components/drive/Pagination";
import type { PreviewTarget } from "@/components/drive/PreviewModal";
import { useFileActions } from "@/components/drive/use-file-actions";
import { paginateSlice, type PageSizeOption } from "@/lib/drive/pagination";

type StorageRentPanelProps = {
  files: OwnedFileView[];
  isLoading: boolean;
  isConnected: boolean;
  isRenewing: boolean;
  onRenew: (files: OwnedFileView[]) => void | Promise<void>;
  onPreview: (preview: PreviewTarget) => void;
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

export function StorageRentPanel({
  files,
  isLoading,
  isConnected,
  isRenewing,
  onRenew,
  onPreview,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: StorageRentPanelProps) {
  const { openPreview } = useFileActions(onPreview);
  const expiredFiles = useMemo(() => selectExpiredRentFiles(files), [files]);
  const pagedExpired = useMemo(
    () => paginateSlice(expiredFiles, page, pageSize),
    [expiredFiles, page, pageSize],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelectedIds(new Set(expiredFiles.map((file) => file.objectId)));
  }, [expiredFiles]);

  useEffect(() => {
    onPageChange(1);
  }, [pageSize, onPageChange]);

  const selectedFiles = useMemo(
    () => expiredFiles.filter((file) => selectedIds.has(file.objectId)),
    [expiredFiles, selectedIds],
  );

  const allSelected = expiredFiles.length > 0 && selectedFiles.length === expiredFiles.length;

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(expiredFiles.map((file) => file.objectId)) : new Set());
  };

  const toggleOne = (objectId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(objectId);
      } else {
        next.delete(objectId);
      }
      return next;
    });
  };

  return (
    <section className="rounded-xl border border-border/70 bg-card/50">
      <div className="flex flex-col gap-4 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/35 bg-amber-500/10">
            <HardDrive className="h-5 w-5 text-amber-200" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Storage rent</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Renew Walrus rent for files that expired while you were offline. One wallet transaction can
              restore multiple files back to your drive.
            </p>
            <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
              Expired rent on files: {isLoading ? "…" : expiredFiles.length}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!isConnected || isRenewing || expiredFiles.length === 0}
            onClick={() => void onRenew(expiredFiles)}
          >
            {isRenewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Renew all
          </Button>
          <Button
            type="button"
            disabled={!isConnected || isRenewing || selectedFiles.length === 0}
            onClick={() => void onRenew(selectedFiles)}
          >
            {isRenewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Renew selected ({selectedFiles.length})
          </Button>
        </div>
      </div>

      {!isConnected ? (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          Connect your wallet to review and renew expired storage rent.
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking storage rent…
        </div>
      ) : expiredFiles.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-medium">No expired storage rent</p>
          <p className="mt-1 text-sm text-muted-foreground">
            All files in your drive have active Walrus storage. Nothing to renew right now.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/70 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-3 py-2">
                  <SelectionCheckbox
                    checked={allSelected}
                    label="Select all expired files"
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Uploaded</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Size</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {expiredFiles.map((file) => (
                <tr
                  key={file.objectId}
                  className="cursor-pointer border-b border-border/40 hover:bg-secondary/30"
                  onClick={() => void openPreview(file)}
                >
                  <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                    <SelectionCheckbox
                      checked={selectedIds.has(file.objectId)}
                      label={`Select ${file.name}`}
                      onChange={(checked) => toggleOne(file.objectId, checked)}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{file.name}</span>
                      {file.inTrash ? (
                        <span className="rounded-full border border-slate-500/40 px-1.5 py-0.5 text-[10px] text-slate-300">
                          Trash
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground sm:table-cell">
                    {format(new Date(file.date), "MMM d, yyyy")}
                  </td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">
                    {formatBytes(file.size)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-200">
                      Rent expired
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 pb-3">
            <Pagination
              pagination={pagedExpired.pagination}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </div>
        </div>
      )}
    </section>
  );
}
