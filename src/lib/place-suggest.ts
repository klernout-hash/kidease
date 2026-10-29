/** Local + browser place fallbacks. Relative imports so Node tests can load this. */
import { CITIES, geocode } from "./geo.ts";

export type PlaceSuggestion = { placeId: string; label: string; secondary: string };
export type ResolvedPlace = { lat: number; lng: number; label: string };

export function localPlaceId(label: string) {
  return `local:${label}`;
}

export function isLocalPlaceId(placeId: string) {
  return placeId.startsWith("local:");
}

export function isCentrePlaceId(placeId: string) {
  return placeId.startsWith("centre:");
}

export function centreSlugFromPlaceId(placeId: string) {
  return isCentrePlaceId(placeId) ? placeId.slice("centre:".length) : "";
}

/** Accent-folded text so "Edmonton" and "edmonton" rank the same. */
export function foldPlaceQuery(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * 0 exact city, 1 prefix, 2 contains.
 * Exact and prefix beat a nearer city that only contains the letters.
 */
export function placeMatchRank(query: string, label: string, secondary = ""): number {
  const q = foldPlaceQuery(query);
  const main = foldPlaceQuery(label);
  const city = main.split(",")[0]?.trim() || main;
  if (!q) return 3;
  if (city === q || main === q) return 0;
  if (city.startsWith(q) || main.startsWith(q) || foldPlaceQuery(secondary).startsWith(q)) return 1;
  return 2;
}

/** Exact, then prefix, then the original order. Duplicate labels keep the first. */
export function rankPlaceSuggestions<T extends { label: string; secondary?: string }>(
  query: string,
  rows: readonly T[],
  limit = 6,
): T[] {
  const seen = new Set<string>();
  const ranked = rows
    .map((row, index) => ({
      row,
      index,
      rank: placeMatchRank(query, row.label, row.secondary || ""),
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  const out: T[] = [];
  for (const item of ranked) {
    const key = foldPlaceQuery(item.row.label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.row);
    if (out.length >= limit) break;
  }
  return out;
}

/** City / neighbourhood matches when Places autocomplete is empty or denied. */
export function suggestLocalPlaces(query: string, limit = 6): PlaceSuggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  for (const city of CITIES) {
    const label = city.label;
    const hay = `${label} ${city.aliases.join(" ")}`.toLowerCase();
    const aliasHit = city.aliases.some((alias) => alias.length >= 3 && (alias === q || alias.startsWith(q) || q.startsWith(alias)));
    if (!hay.includes(q) && !aliasHit) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({
      placeId: localPlaceId(label),
      label,
      secondary: city.province,
    });
  }
  return rankPlaceSuggestions(query, out, limit);
}

export function resolveLocalPlace(placeId: string): ResolvedPlace | null {
  if (!isLocalPlaceId(placeId)) return null;
  const label = placeId.slice("local:".length);
  return geocode(label);
}

/**
 * Browser fallbacks after the server lookup.
 * Address search uses stored city coordinates, then Photon on the server.
 * These do not call Google.
 */
export async function suggestPlacesBrowser(
  _query: string,
  _origin?: { lat: number; lng: number },
): Promise<PlaceSuggestion[]> {
  return [];
}

export async function geocodeWithBrowser(query: string): Promise<ResolvedPlace | null> {
  const q = query.trim();
  if (!q) return null;
  return geocode(q);
}

export async function resolvePlaceIdBrowser(placeId: string): Promise<ResolvedPlace | null> {
  if (!placeId || isLocalPlaceId(placeId)) return resolveLocalPlace(placeId);
  const { decodePhotonPlaceId } = await import("./photon.ts");
  return decodePhotonPlaceId(placeId);
}
