"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  buildVisiblePages,
  PAGE_SIZE_OPTIONS,
  type PaginationMeta,
  type PageSizeOption,
} from "@/lib/drive/pagination";
import { cn } from "@/lib/utils";

type PaginationProps = {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: PageSizeOption) => void;
  className?: string;
};

export function Pagination({ pagination, onPageChange, onPageSizeChange, className }: PaginationProps) {
  const { page, totalPages, total, pageSize } = pagination;
  const visiblePages = buildVisiblePages(page, totalPages);
  const showPager = total > 0;

  if (!showPager && !onPageSizeChange) {
    return null;
  }

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(page * pageSize, total);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-border/50 pt-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {total === 0 ? "0 items" : `${start}–${end} of ${total}`}
        </span>
        {onPageSizeChange ? (
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Rows</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value) as PageSizeOption)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              aria-label="Rows per page"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {visiblePages.map((entry, index) =>
            entry === "ellipsis" ? (
              <span key={`ellipsis-${index}`} className="px-1 text-xs text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={entry}
                type="button"
                size="sm"
                variant={entry === page ? "default" : "outline"}
                className="min-w-9 px-2"
                onClick={() => onPageChange(entry)}
                aria-label={`Page ${entry}`}
                aria-current={entry === page ? "page" : undefined}
              >
                {entry}
              </Button>
            ),
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
