import type { DriveView } from "@/components/drive/sidebar";

export type SearchResultKind = "owned" | "trash" | "received-pending" | "received" | "shared";

export type DriveSearchResult = {
  id: string;
  kind: SearchResultKind;
  view: DriveView;
  name: string;
  blobId: string;
  subtitle?: string;
};

export function normalizeSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

export function matchesDriveSearch(text: string, query: string) {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) {
    return true;
  }
  return text.toLowerCase().includes(normalized);
}

export function filterSearchResults(results: DriveSearchResult[], query: string) {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) {
    return [];
  }
  return results.filter((item) => {
    const haystack = [item.name, item.blobId, item.subtitle ?? ""].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}
