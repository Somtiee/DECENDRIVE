"use client";

import { FileIcon, FolderKanban, Inbox, Search, Share2, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useDriveSearch } from "@/components/drive/DriveSearchProvider";
import type { DriveSearchResult } from "@/lib/drive/search";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function iconFor(kind: DriveSearchResult["kind"]) {
  switch (kind) {
    case "owned":
      return FolderKanban;
    case "trash":
      return Trash2;
    case "shared":
      return Share2;
    case "received":
    case "received-pending":
      return Inbox;
    default:
      return FileIcon;
  }
}

export function DriveSearchBox() {
  const { query, setQuery, results, requestNavigate, clearQuery } = useDriveSearch();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={rootRef} className="relative w-full min-w-0 md:max-w-xl">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground sm:left-3 sm:h-4 sm:w-4" />
      <Input
        type="search"
        placeholder="Search files…"
        className="h-8 min-w-0 pr-8 pl-8 text-xs sm:h-10 sm:pr-9 sm:pl-9 sm:text-sm"
        aria-label="Search in Drive"
        aria-expanded={showDropdown}
        aria-controls="drive-search-results"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            clearQuery();
            setOpen(false);
          }
          if (event.key === "Enter" && results[0]) {
            requestNavigate(results[0].view, results[0].blobId);
            setOpen(false);
          }
        }}
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={() => {
            clearQuery();
            setOpen(false);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {showDropdown && (
        <div
          id="drive-search-results"
          role="listbox"
          className="absolute top-full z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border/80 bg-card py-1 shadow-xl"
        >
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">No matches in this wallet.</p>
          ) : (
            results.slice(0, 12).map((item) => {
              const Icon = iconFor(item.kind);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-secondary/60",
                  )}
                  onClick={() => {
                    requestNavigate(item.view, item.blobId);
                    setOpen(false);
                  }}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.name}</span>
                    {item.subtitle ? (
                      <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
