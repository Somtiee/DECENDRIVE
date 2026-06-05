export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export const DEFAULT_PAGE_SIZE = 10;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function normalizePageSize(value: number): PageSizeOption {
  if (PAGE_SIZE_OPTIONS.includes(value as PageSizeOption)) {
    return value as PageSizeOption;
  }
  return DEFAULT_PAGE_SIZE;
}

export function buildVisiblePages(page: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 1) {
    return totalPages === 1 ? [1] : [];
  }
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const candidates = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...candidates].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = sorted[index - 1];
    if (index > 0 && current - previous > 1) {
      result.push("ellipsis");
    }
    result.push(current);
  }

  return result;
}

export type PaginatedResult<T> = {
  items: T[];
  pagination: PaginationMeta;
};

export function parsePageParams(searchParams: URLSearchParams, defaultPageSize = DEFAULT_PAGE_SIZE) {
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = normalizePageSize(Number(searchParams.get("pageSize") ?? String(defaultPageSize)) || defaultPageSize);
  return { page, pageSize };
}

export function paginateSlice<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
  };
}
