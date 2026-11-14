import type { DaycareCard } from "@/lib/types";
import { readSearchEvidence, searchEvidence, type SearchEvidence } from "./search-evidence.ts";
import { SEARCH_PAGE_MAX, type SearchPage } from "./search-page.ts";

const KEY = "kidease-search-cache";

export function searchCacheKey(input: {
  lat: number;
  lng: number;
  radiusKm: number;
  sort: string;
  ageGroup: string;
  label?: string;
  q?: string;
  city?: string;
  startDate?: string | null;
  lat2?: number;
  lng2?: number;
  mode?: string;
  facility?: string;
  page?: number;
  parentFit?: string;
  name?: string;
  /** Live on KidEase. Kept out of the unfiltered page cache. */
  claimLive?: boolean;
  diet?: string;
  /** Every active predicate, including program language and mobile quick filters. */
  filters?: string;
  ranking?: string;
}) {
  return JSON.stringify([
    "coverage1",
    input.lat,
    input.lng,
    input.radiusKm,
    input.sort,
    input.ageGroup,
    input.label || "",
    input.q || "",
    input.city || "",
    input.startDate || "",
    input.mode || "home",
    input.facility || "",
    input.lat2 ?? "",
    input.lng2 ?? "",
    input.page && input.page > 1 ? String(input.page) : "",
    input.parentFit || "",
    (input.name || "").trim().toLowerCase(),
    input.claimLive ? "claim" : "",
    input.diet || "",
    input.filters || "",
    input.ranking || "",
  ]);
}

export type SearchPageResponse = SearchPage<DaycareCard> & { evidence: SearchEvidence };

/** Preserve the server envelope. A legacy row array cannot establish coverage or paging. */
export function readSearchCache(key: string): SearchPageResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const env = JSON.parse(raw);
    if (!env || env.key !== key || !Number.isFinite(env.at) || env.at > Date.now() || Date.now() - env.at > 60_000) return null;
    if (!env.response && Array.isArray(env.rows)) {
      return { items: env.rows, total: env.rows.length, page: 1, pageSize: Math.max(1, env.rows.length),
        hasMore: false, nextPage: null, pageLimitReached: false, evidence: searchEvidence({ observedAt: 0 }) };
    }
    const response = env.response;
    if (!response || !Array.isArray(response.items) || !Number.isSafeInteger(response.total) || response.total < response.items.length ||
      !Number.isSafeInteger(response.page) || response.page < 1 || response.page > SEARCH_PAGE_MAX ||
      !Number.isSafeInteger(response.pageSize) || response.pageSize < 1 || typeof response.hasMore !== "boolean" ||
      typeof response.pageLimitReached !== "boolean") return null;
    const nextPage = response.hasMore && response.nextPage === response.page + 1 && response.nextPage <= SEARCH_PAGE_MAX
      ? response.nextPage : null;
    return { ...response, nextPage, hasMore: nextPage !== null, pageLimitReached: response.page === SEARCH_PAGE_MAX && response.pageLimitReached, evidence: readSearchEvidence(response.evidence) };
  } catch {
    return null;
  }
}

export function writeSearchCache(key: string, response: SearchPageResponse) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ key, at: Date.now(), response }));
  } catch {
    /* quota */
  }
}

export function clearSearchCache() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
