/**
 * City and province directory membership.
 * Hub pages and /search?city= must count and list the same public rows.
 * Relative .ts imports so Node tests can load this file.
 */

import {
  CITY_HUB_DEFS,
  cityHubDefBySlug,
  cityHubDefForPlace,
  cityHubMapSearchQuery,
  cityHubPlaceKeys,
  cityHubSearchQuery,
  normalizeCityKey,
  type CityHubDef,
} from "./city-hubs.ts";
import { geocode } from "./geo.ts";
import { isPublicListing } from "./listing-visibility.ts";
import { normalizeListingSlug } from "./listing-slug.ts";
import { isSafeSitemapSlug } from "./sitemap.ts";

export type DirectoryRow = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  city?: string | null;
  province?: string | null;
  address?: string | null;
  licenseNumber?: string | null;
  visibility?: string | null;
  isTest?: boolean | number | null;
  mergedInto?: string | null;
  importFault?: string | null;
  listingActive?: boolean | number | string | null;
};

export type DirectoryCounts = {
  hubs: Record<string, number>;
  provinces: Record<string, number>;
};

export type SearchDirectory =
  | { kind: "hub"; slug: string }
  | { kind: "unknown" }
  | { kind: "nearby" };

function provinceCode(value: string | null | undefined): string {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(raw) ? raw : "";
}

function folded(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Public catalogue row that belongs on this city hub and in that city's search. */
export function listingBelongsToHub(row: DirectoryRow, def: CityHubDef): boolean {
  if (!isPublicListing(row)) return false;
  const slug = normalizeListingSlug((row.slug || "").trim());
  if (!isSafeSitemapSlug(slug)) return false;
  if (!String(row.name || "").trim()) return false;
  return cityHubDefForPlace(row.city, row.province)?.slug === def.slug;
}

/** Neon group-by rows already passed the public SQL filter. */
export function directoryCountsFromGroups(
  groups: readonly { city?: string | null; province?: string | null; n?: number | null }[],
): DirectoryCounts {
  const hubs: Record<string, number> = {};
  for (const def of CITY_HUB_DEFS) hubs[def.slug] = 0;
  const provinces: Record<string, number> = {};
  for (const group of groups) {
    const n = Math.max(0, Math.floor(Number(group.n) || 0));
    if (!n) continue;
    const province = provinceCode(group.province);
    if (province) provinces[province] = (provinces[province] || 0) + n;
    const def = cityHubDefForPlace(group.city, group.province);
    if (def) hubs[def.slug] = (hubs[def.slug] || 0) + n;
  }
  return { hubs, provinces };
}

export function directoryCountsFromRows(rows: readonly DirectoryRow[]): DirectoryCounts {
  const hubs: Record<string, number> = {};
  for (const def of CITY_HUB_DEFS) hubs[def.slug] = 0;
  const provinces: Record<string, number> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isPublicListing(row)) continue;
    const slug = normalizeListingSlug((row.slug || "").trim());
    if (!isSafeSitemapSlug(slug)) continue;
    if (!String(row.name || "").trim()) continue;
    const key = slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const province = provinceCode(row.province);
    if (province) provinces[province] = (provinces[province] || 0) + 1;
    const def = cityHubDefForPlace(row.city, row.province);
    if (def) hubs[def.slug] = (hubs[def.slug] || 0) + 1;
  }
  return { hubs, provinces };
}

export function hubForDirectoryQuery(raw: string | null | undefined): CityHubDef | null {
  const key = folded(raw || "");
  if (!key) return null;
  for (const def of CITY_HUB_DEFS) {
    const queries = [
      cityHubMapSearchQuery(def),
      cityHubSearchQuery(def),
      def.city,
      def.cityEn,
      def.cityFr,
      `${def.cityEn}, ${def.province}`,
      `${def.city}, ${def.province}`,
      ...(def.aliases ?? []),
    ];
    if (queries.some((item) => folded(item) === key)) return def;
  }
  return null;
}

/**
 * `?city=` is a directory, not a hint. An unknown city must not fall through
 * to the product home. A known hub city (or `?q=Winnipeg, MB`) is that hub.
 */
export function resolveSearchDirectory(input: {
  q?: string | null;
  city?: string | null;
}): SearchDirectory {
  const city = (input.city || "").trim();
  const q = (input.q || "").trim();
  if (city && !q) {
    const hit = geocode(city);
    if (!hit) return { kind: "unknown" };
    const parts = hit.label.split(",").map((part) => part.trim()).filter(Boolean);
    const name = parts[0] || city;
    const province = provinceCode(parts[parts.length - 1] || "");
    const hub = cityHubDefForPlace(name, province);
    if (hub) return { kind: "hub", slug: hub.slug };
    return { kind: "nearby" };
  }
  if (q) {
    const hub = hubForDirectoryQuery(q);
    if (hub) return { kind: "hub", slug: hub.slug };
  }
  return { kind: "nearby" };
}

export function cityHubNeedleKeys(def: CityHubDef): string[] {
  return cityHubPlaceKeys(def);
}

export function cityKeyFromLabel(label: string | null | undefined): string {
  return normalizeCityKey((label || "").split(",")[0] || "");
}

export function hubDef(slug: string | null | undefined): CityHubDef | null {
  return cityHubDefBySlug(slug);
}
