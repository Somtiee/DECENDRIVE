"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { DriveView } from "@/components/drive/sidebar";
import {
  filterSearchResults,
  type DriveSearchResult,
} from "@/lib/drive/search";

type DriveSearchContextValue = {
  query: string;
  setQuery: (value: string) => void;
  clearQuery: () => void;
  results: DriveSearchResult[];
  setIndex: (items: DriveSearchResult[]) => void;
  highlightBlobId: string | null;
  setHighlightBlobId: (blobId: string | null) => void;
  consumeNavigation: () => { view: DriveView; blobId: string } | null;
  pendingNavigation: { view: DriveView; blobId: string } | null;
  requestNavigate: (view: DriveView, blobId: string) => void;
};

const DriveSearchContext = createContext<DriveSearchContextValue | null>(null);

export function DriveSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<DriveSearchResult[]>([]);
  const [highlightBlobId, setHighlightBlobId] = useState<string | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<{
    view: DriveView;
    blobId: string;
  } | null>(null);

  const results = useMemo(() => filterSearchResults(index, query), [index, query]);

  const clearQuery = useCallback(() => {
    setQuery("");
    setHighlightBlobId(null);
  }, []);

  const requestNavigate = useCallback((view: DriveView, blobId: string) => {
    setPendingNavigation({ view, blobId });
    setHighlightBlobId(blobId);
    setQuery("");
  }, []);

  const consumeNavigation = useCallback(() => {
    const next = pendingNavigation;
    if (next) {
      setPendingNavigation(null);
    }
    return next;
  }, [pendingNavigation]);

  const value = useMemo(
    () => ({
      query,
      setQuery,
      clearQuery,
      results,
      setIndex,
      highlightBlobId,
      setHighlightBlobId,
      consumeNavigation,
      pendingNavigation,
      requestNavigate,
    }),
    [
      query,
      clearQuery,
      results,
      highlightBlobId,
      consumeNavigation,
      pendingNavigation,
      requestNavigate,
    ],
  );

  return <DriveSearchContext.Provider value={value}>{children}</DriveSearchContext.Provider>;
}

export function useDriveSearch() {
  const context = useContext(DriveSearchContext);
  if (!context) {
    throw new Error("useDriveSearch must be used within DriveSearchProvider");
  }
  return context;
}

export function useDriveSearchOptional() {
  return useContext(DriveSearchContext);
}
