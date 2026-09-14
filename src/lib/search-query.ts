import { geocode } from "./geo.ts";

/** Parse `q` from TanStack `location.search` (object or query string). */
export function searchQueryFromUnknown(search: unknown): string {
  if (typeof search === "string") {
    const raw = search.startsWith("?") ? search.slice(1) : search;
    return new URLSearchParams(raw).get("q")?.trim() || "";
  }
  if (search && typeof search === "object" && "q" in search) {
    const q = (search as { q?: unknown }).q;
    return typeof q === "string" ? q.trim() : "";
  }
  return "";
}

/** Local city / FSA / postal geocode for an explicit search query. */
export function originFromSearchQuery(q?: string | null) {
  const raw = typeof q === "string" ? q.trim() : "";
  if (!raw) return null;
  return geocode(raw);
}

export function originsMatchSearchQuery(
  origin: { lat: number; lng: number } | null | undefined,
  q?: string | null,
  epsilon = 0.05,
) {
  const wanted = originFromSearchQuery(q);
  if (!wanted) return true;
  if (!origin) return false;
  return Math.abs(origin.lat - wanted.lat) < epsilon && Math.abs(origin.lng - wanted.lng) < epsilon;
}

/** Typed `?q=Winnipeg` (etc.) owns origin — do not let saved GPS overwrite it. */
export function urlHasGeocodableSearchQuery(
  search = typeof window === "undefined" ? "" : window.location.search,
) {
  return Boolean(originFromSearchQuery(searchQueryFromUnknown(search)));
}
