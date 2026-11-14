/** Public search pages return this many listings. The rest stay on the next page. */
import type { SearchEvidence } from "./search-evidence.ts";
export const SEARCH_PAGE_SIZE = 96;

/** Stop a huge page query from walking the whole catalogue. */
export const SEARCH_PAGE_MAX = 40;

export type SearchPage<T> = {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  /** Full result count, not the length of this page. */
  total: number;
  /** Navigable next page; the safety boundary never links back to itself. */
  nextPage: number | null;
  pageLimitReached: boolean;
  evidence?: SearchEvidence;
};

export function parseSearchPage(raw: unknown): number {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(SEARCH_PAGE_MAX, Math.floor(value));
}

export function pageFromSearch(search: unknown): number {
  if (typeof search === "string") {
    const raw = search.startsWith("?") ? search.slice(1) : search;
    return parseSearchPage(new URLSearchParams(raw).get("page"));
  }
  if (search && typeof search === "object" && "page" in search) {
    return parseSearchPage((search as { page?: unknown }).page);
  }
  return 1;
}

/** Slice a fully sorted search. Page 1 is the first screen of that same order. */
export function sliceSearchPage<T>(rows: readonly T[], page: number, pageSize = SEARCH_PAGE_SIZE): SearchPage<T> {
  const size = pageSize > 0 ? Math.floor(pageSize) : SEARCH_PAGE_SIZE;
  const current = parseSearchPage(page);
  const start = (current - 1) * size;
  const items = rows.slice(start, start + size);
  const remaining = start + size < rows.length;
  const nextPage = remaining && current < SEARCH_PAGE_MAX ? current + 1 : null;
  return {
    items,
    page: current,
    pageSize: size,
    hasMore: nextPage !== null,
    total: rows.length,
    nextPage,
    pageLimitReached: remaining && current === SEARCH_PAGE_MAX,
  };
}
