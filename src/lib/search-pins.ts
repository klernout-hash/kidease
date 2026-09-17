import { STOREFRONT_MIN_PX } from "@/lib/runtime";

/** Desktop search shows list + map together from the website / `lg` breakpoint. */
export const SEARCH_SPLIT_MIN_PX = STOREFRONT_MIN_PX;

export type NumberedSearchResult<T extends { slug: string }> = {
  item: T;
  index: number;
};

/**
 * 1-based result numbers in list order. First occurrence of a slug wins so the
 * card and its map pin share one number.
 */
export function numberSearchResults<T extends { slug: string }>(
  items: readonly T[],
): NumberedSearchResult<T>[] {
  const seen = new Set<string>();
  const out: NumberedSearchResult<T>[] = [];
  for (const item of items) {
    const slug = item.slug.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ item, index: out.length + 1 });
  }
  return out;
}

/** slug → 1-based pin/card number for the same ordered result set. */
export function searchPinNumbers(items: readonly { slug: string }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const { item, index } of numberSearchResults(items)) {
    out.set(item.slug, index);
  }
  return out;
}

export function searchPinNumberForSlug(
  items: readonly { slug: string }[],
  slug: string | null | undefined,
): number | null {
  if (!slug) return null;
  return searchPinNumbers(items).get(slug) ?? null;
}

/** Wide / website search: list and map share one screen. */
export function searchShowsSplitLayout(widthPx: number, native = false): boolean {
  if (native) return false;
  return widthPx >= SEARCH_SPLIT_MIN_PX;
}
