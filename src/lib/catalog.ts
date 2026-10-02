import { nextMonths } from "./utils";
import {
  hydrateRaw,
  loadJsonCatalogFromDisk,
  loadRawCentresFromDisk,
  type CatalogDaycare,
  type RawCentre,
} from "./catalog-hydrate.ts";
import { chooseCatalogListing, filterSuppressedCatalogRows } from "./catalog-fallback";
import { isPublicListing } from "./listing-visibility";
import { listingSlugLookupKeys, rememberSlugAliases } from "./listing-slug";
import { collectPublicMapPins } from "./map-cluster";
import { normalizeCityKey } from "./city-hubs.ts";
import { bboxFromRadius, clampRadiusKm, distanceKm, inBbox } from "./proximity";

export type { CatalogDaycare, RawCentre };

let rawCentres: RawCentre[] | null = null;
let rawBySlug = new Map<string, RawCentre>();
let rawById = new Map<string, RawCentre>();
let rawGrid: Map<string, RawCentre[]> | null = null;
let cachedJsonCatalog: CatalogDaycare[] | null = null;
let jsonBySlugMap = new Map<string, CatalogDaycare>();
let jsonByIdMap = new Map<string, CatalogDaycare>();
let cachedCatalog: CatalogDaycare[] | null = null;
let catalogBySlugMap = new Map<string, CatalogDaycare>();
let catalogByIdMap = new Map<string, CatalogDaycare>();
let cachedFrom: "neon" | "json" | null = null;

/** ~28 km cells. Search only walks cells that intersect the 50 km cap. */
const GRID_DEG = 0.25;

function gridKey(lat: number, lng: number) {
  return `${Math.floor(lat / GRID_DEG)}_${Math.floor(lng / GRID_DEG)}`;
}

function buildRawGrid(rows: RawCentre[]) {
  const grid = new Map<string, RawCentre[]>();
  for (const d of rows) {
    if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) continue;
    const key = gridKey(d.lat, d.lng);
    const bucket = grid.get(key);
    if (bucket) bucket.push(d);
    else grid.set(key, [d]);
  }
  rawGrid = grid;
}

async function ensureRaw() {
  if (rawCentres) return rawCentres;
  rawCentres = await loadRawCentresFromDisk();
  rawBySlug = rememberSlugAliases(rawCentres);
  rawById = new Map(rawCentres.map((d) => [d.id, d]));
  buildRawGrid(rawCentres);
  return rawCentres;
}

function rememberCatalog(rows: CatalogDaycare[], source: "neon" | "json") {
  cachedCatalog = rows;
  cachedFrom = source;
  catalogBySlugMap = rememberSlugAliases(rows);
  catalogByIdMap = new Map(rows.map((d) => [d.id, d]));
  return rows;
}

/** Always centres.json + extras. Used by the Neon seed so it never reads Neon. */
export async function loadJsonCatalog(): Promise<CatalogDaycare[]> {
  if (cachedJsonCatalog) return cachedJsonCatalog;
  await ensureRaw();
  cachedJsonCatalog = await loadJsonCatalogFromDisk();
  jsonBySlugMap = rememberSlugAliases(cachedJsonCatalog);
  jsonByIdMap = new Map(cachedJsonCatalog.map((d) => [d.id, d]));
  return cachedJsonCatalog;
}

async function tryNeonCatalogAll(): Promise<CatalogDaycare[] | null> {
  if (typeof window !== "undefined") return null;
  try {
    const { loadNeonCatalogIfPreferred } = await import("./server/catalog-neon");
    return await loadNeonCatalogIfPreferred();
  } catch {
    return null;
  }
}

export async function getCatalog(): Promise<CatalogDaycare[]> {
  if (cachedCatalog && cachedFrom === "neon") return cachedCatalog;
  const neon = await tryNeonCatalogAll();
  if (neon && neon.length > 0) return rememberCatalog(neon, "neon");
  if (cachedCatalog && cachedFrom === "json") return cachedCatalog;
  return rememberCatalog(await omitSuppressedBundleCopies(await loadJsonCatalog()), "json");
}

/** Drop bundled rows whose id or slug the database has hidden or retired. */
export async function omitSuppressedBundleCopies<T extends { id?: string | null; slug?: string | null }>(
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0 || typeof window !== "undefined") return rows;
  try {
    const { loadSuppressedCatalogKeys } = await import("./server/catalog-neon");
    const keys = await loadSuppressedCatalogKeys();
    return filterSuppressedCatalogRows(rows, keys);
  } catch {
    return rows;
  }
}

/** Catalogue minus merged rows, import faults, and admin-only / QA fixtures. */
export async function getPublicCatalog(): Promise<CatalogDaycare[]> {
  return (await getCatalog()).filter((d) => isPublicListing(d));
}

/** JSON-grid nearby. Nearby PostGIS uses this only when Neon is not the SoT. */
export async function catalogNearFromJson(origin: { lat: number; lng: number }, radiusKm: number) {
  await ensureRaw();
  if (!rawGrid) return [];
  const radius = clampRadiusKm(radiusKm);
  const box = bboxFromRadius(origin, radius);
  const minI = Math.floor(box.minLat / GRID_DEG);
  const maxI = Math.floor(box.maxLat / GRID_DEG);
  const minJ = Math.floor(box.minLng / GRID_DEG);
  const maxJ = Math.floor(box.maxLng / GRID_DEG);
  const out: CatalogDaycare[] = [];
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      const bucket = rawGrid.get(`${i}_${j}`);
      if (!bucket) continue;
      for (const d of bucket) {
        const point = { lat: d.lat, lng: d.lng };
        if (!inBbox(point, box)) continue;
        if (distanceKm(origin, point) > radius) continue;
        const listed = await hydrateRaw(d);
        if (!isPublicListing(listed)) continue;
        out.push(listed);
      }
    }
  }
  return omitSuppressedBundleCopies(out);
}

/**
 * Licensed rows whose city and province match exactly.
 * Used when a centre is in that city but its pin sits outside the search radius.
 */
export async function catalogNamedCityFromJson(city: string, province: string): Promise<CatalogDaycare[]> {
  await ensureRaw();
  if (!rawCentres) return [];
  const cityKey = normalizeCityKey(city);
  const provinceKey = province.trim().toUpperCase();
  if (!cityKey || provinceKey.length !== 2) return [];
  const out: CatalogDaycare[] = [];
  for (const row of rawCentres) {
    if (normalizeCityKey(row.city) !== cityKey) continue;
    if ((row.province || "").trim().toUpperCase() !== provinceKey) continue;
    const listed = await hydrateRaw(row);
    if (!isPublicListing(listed)) continue;
    out.push(listed);
  }
  return omitSuppressedBundleCopies(out);
}

export type RawMapPin = {
  id: string;
  slug: string;
  name: string;
  nameFr: string;
  lat: number;
  lng: number;
  address: string;
  city: string;
  province: string;
  postalCode: string;
};

/**
 * Public catalogue pins inside a map viewport. Every matching row is returned —
 * the search list cap does not apply. Fields stay limited to what a pin needs.
 */
export async function listRawMapPinsInBbox(box: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}): Promise<RawMapPin[]> {
  await ensureRaw();
  if (!rawCentres) return [];
  return collectPublicMapPins(rawCentres, box);
}

/** One public catalogue pin, for the map popup. Bulk map loads do not carry address or slug. */
export async function findRawMapPinById(id: string): Promise<RawMapPin | null> {
  await ensureRaw();
  const row = rawById.get(String(id || "").trim());
  if (!row || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return null;
  const [pin] = collectPublicMapPins([row], {
    minLat: row.lat - 0.01,
    maxLat: row.lat + 0.01,
    minLng: row.lng - 0.01,
    maxLng: row.lng + 0.01,
  });
  return pin ?? null;
}

/** Nearby: Neon PostGIS when the national table is ready, else JSON grid. */
export async function catalogNear(origin: { lat: number; lng: number }, radiusKm: number) {
  if (typeof window === "undefined") {
    try {
      const { nearbyFromNeonIfPreferred } = await import("./server/catalog-neon");
      const neon = await nearbyFromNeonIfPreferred(origin, radiusKm);
      if (neon) return neon.filter(isPublicListing);
    } catch {
      /* cold fallback */
    }
  }
  return catalogNearFromJson(origin, radiusKm);
}

async function jsonBySlug(slug: string) {
  if (jsonBySlugMap.has(slug)) return jsonBySlugMap.get(slug);
  if (catalogBySlugMap.has(slug) && cachedFrom === "json") return catalogBySlugMap.get(slug);
  await ensureRaw();
  const raw = rawBySlug.get(slug);
  return raw ? hydrateRaw(raw) : undefined;
}

async function jsonById(id: string) {
  if (jsonByIdMap.has(id)) return jsonByIdMap.get(id);
  if (catalogByIdMap.has(id) && cachedFrom === "json") return catalogByIdMap.get(id);
  await ensureRaw();
  const raw = rawById.get(id);
  return raw ? hydrateRaw(raw) : undefined;
}

async function bundledSlug(keys: string[]): Promise<CatalogDaycare | undefined> {
  if (cachedFrom === "neon") {
    for (const key of keys) {
      const hit = catalogBySlugMap.get(key);
      if (hit) return hit;
    }
  }
  let hit: CatalogDaycare | undefined;
  for (const key of keys) {
    if (cachedFrom === "json") hit = catalogBySlugMap.get(key);
    if (!hit) hit = await jsonBySlug(key);
    if (hit) break;
  }
  if (!hit) return undefined;
  const [safe] = await omitSuppressedBundleCopies([hit]);
  return safe;
}

export async function catalogBySlugGet(slug: string) {
  const keys = listingSlugLookupKeys(slug);
  if (typeof window === "undefined") {
    try {
      const { neonCatalogBySlug } = await import("./server/catalog-neon");
      const neon = await neonCatalogBySlug(slug);
      if (neon) {
        return chooseCatalogListing({ dbState: "found", db: neon, bundle: undefined }) ?? undefined;
      }
    } catch {
      const bundle = await bundledSlug(keys);
      return chooseCatalogListing({ dbState: "unreachable", db: null, bundle }) ?? undefined;
    }
  }
  const bundle = await bundledSlug(keys);
  return chooseCatalogListing({ dbState: "missing", db: null, bundle }) ?? undefined;
}

export async function catalogByIdGet(id: string) {
  if (typeof window === "undefined") {
    try {
      const { neonCatalogById } = await import("./server/catalog-neon");
      const neon = await neonCatalogById(id);
      if (neon) return chooseCatalogListing({ dbState: "found", db: neon, bundle: undefined }) ?? undefined;
    } catch {
      /* cold fallback */
    }
  }
  if (cachedFrom === "neon" && catalogByIdMap.has(id)) return catalogByIdMap.get(id);
  const bundled = (cachedFrom === "json" ? catalogByIdMap.get(id) : undefined) ?? (await jsonById(id));
  if (!bundled) return undefined;
  const [safe] = await omitSuppressedBundleCopies([bundled]);
  return safe;
}

export async function catalogByIdsGet(ids: string[]) {
  const wanted = ids.filter(Boolean);
  if (typeof window === "undefined") {
    try {
      const { neonCatalogByIds } = await import("./server/catalog-neon");
      const neon = await neonCatalogByIds(wanted);
      if (neon) {
        const byId = new Map(neon.map((row) => [row.id, row]));
        const out: CatalogDaycare[] = [];
        const needBundle: string[] = [];
        for (const id of wanted) {
          const row = byId.get(id);
          if (!row) {
            needBundle.push(id);
            continue;
          }
          if (isPublicListing(row)) out.push(row);
        }
        if (needBundle.length === 0) return out;
        const catalog = await loadJsonCatalog();
        const jsonById = new Map(catalog.map((row) => [row.id, row]));
        const bundled = needBundle
          .map((id) => jsonById.get(id))
          .filter((row): row is CatalogDaycare => Boolean(row));
        const safe = await omitSuppressedBundleCopies(bundled);
        return [...out, ...safe.filter((row) => isPublicListing(row))];
      }
    } catch {
      /* cold fallback */
    }
  }
  const catalog = await loadJsonCatalog();
  const byId = new Map(catalog.map((row) => [row.id, row]));
  const bundled = wanted.map((id) => byId.get(id)).filter((row): row is CatalogDaycare => Boolean(row));
  return (await omitSuppressedBundleCopies(bundled)).filter((row) => isPublicListing(row));
}

export function catalogMonths() {
  return nextMonths(6);
}

export { amenityLabel } from "./amenities";
