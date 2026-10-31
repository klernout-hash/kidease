/**
 * Search sort. Best match is the product default.
 * Parents can still pick Nearest. `?rank=nearest` forces nearest for preview.
 * An unknown sort falls back to nearest so a bad link does not hide distance.
 */

export const SEARCH_SORTS = [
  "distance",
  "price",
  "rating",
  "availability",
  "recommended",
  "match",
  "urgency",
  "best",
] as const;

export type SearchSort = (typeof SEARCH_SORTS)[number];

export const DEFAULT_SEARCH_SORT: SearchSort = "best";

export function parseSearchSort(raw: unknown): SearchSort {
  if (typeof raw === "string" && (SEARCH_SORTS as readonly string[]).includes(raw)) {
    return raw as SearchSort;
  }
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return DEFAULT_SEARCH_SORT;
  return "distance";
}
