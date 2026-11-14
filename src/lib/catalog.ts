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
import { mergeSearchEvidence, searchEvidence, withSearchRows, type SearchBatch, type SearchEvidence, type SearchReadOptions } from "./search-evidence";

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
let cachedEvidence: SearchEvidence | null = null;
let rawObservedAt = 0;
let jsonObservedAt = 0;

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
  rawObservedAt = Date.now();
  rawBySlug = rememberSlugAliases(rawCentres);
  rawById = new Map(rawCentres.map((d) => [d.id, d]));
  buildRawGrid(rawCentres);
  return rawCentres;
}

function rememberCatalog(rows: CatalogDaycare[], source: "neon" | "json", evidence: SearchEvidence) {
  cachedCatalog = rows;
  cachedFrom = source;
  cachedEvidence = evidence;
  catalogBySlugMap = rememberSlugAliases(rows);
  catalogByIdMap = new Map(rows.map((d) => [d.id, d]));
  return rows;
}

/** Always centres.json + extras. Used by the Neon seed so it never reads Neon. */
export async function loadJsonCatalog(): Promise<CatalogDaycare[]> {
  if (cachedJsonCatalog) return cachedJsonCatalog;
  await ensureRaw();
  cachedJsonCatalog = await loadJsonCatalogFromDisk();
  jsonObservedAt = Date.now();
  jsonBySlugMap = rememberSlugAliases(cachedJsonCatalog);
  jsonByIdMap = new Map(cachedJsonCatalog.map((d) => [d.id, d]));
  return cachedJsonCatalog;
}

async function tryNeonCatalogAll(opts?: SearchReadOptions): Promise<SearchBatch<CatalogDaycare> | null> {
  if (typeof window !== "undefined") return null;
  try {
    const { queryNeonCatalogAllResult } = await import("./server/catalog-neon");
    return await queryNeonCatalogAllResult(opts);
  } catch {
    return null;
  }
}

export async function getCatalog(): Promise<CatalogDaycare[]> {
  return (await getCatalogResult()).rows;
}

async function snapshotEvidence(observedAt: number): Promise<SearchEvidence> {
  let retryable = false;
  if (typeof window === "undefined") {
    const [{ dbSource }, { catalogSourceFromEnv }] = await Promise.all([import("./db"), import("./catalog-source")]);
    retryable = (dbSource === "neon" || dbSource === "none") && catalogSourceFromEnv() !== "json";
  }
  return searchEvidence({
    status: "unverified", source: "snapshot", retryable, observedAt,
    reasons: retryable ? ["source-fallback"] : [],
  });
}

async function getCatalogResult(opts?: SearchReadOptions): Promise<SearchBatch<CatalogDaycare>> {
  if (!opts?.refresh && cachedCatalog && cachedFrom === "neon" && cachedEvidence) return { rows: cachedCatalog, evidence: cachedEvidence };
  const neon = await tryNeonCatalogAll(opts);
  if (neon && neon.rows.length > 0) {
    rememberCatalog(neon.rows, "neon", neon.evidence);
    return neon;
  }
  if (!opts?.refresh && cachedCatalog && cachedFrom === "json" && cachedEvidence) return { rows: cachedCatalog, evidence: cachedEvidence };
  const rows = await loadJsonCatalog();
  const batch = await omitSuppressedBundleCopiesResult({ rows, evidence: await snapshotEvidence(jsonObservedAt) }, opts);
  rememberCatalog(batch.rows, "json", batch.evidence);
  return batch;
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

async function omitSuppressedBundleCopiesResult<T extends { id?: string | null; slug?: string | null }>(
  batch: SearchBatch<T>, opts?: SearchReadOptions,
): Promise<SearchBatch<T>> {
  if (!batch.rows.length || typeof window !== "undefined") return batch;
  try {
    const { loadSuppressedCatalogKeys } = await import("./server/catalog-neon");
    const keys = await loadSuppressedCatalogKeys(opts);
    if (keys) return withSearchRows(batch, filterSuppressedCatalogRows(batch.rows, keys));
  } catch { /* Preserve existing snapshot rows, with uncertain suppression coverage. */ }
  return {
    rows: batch.rows,
    evidence: mergeSearchEvidence(batch.evidence, searchEvidence({
      status: "unverified", source: "snapshot", reasons: ["supplement-unavailable"],
      retryable: batch.evidence.retryable, observedAt: batch.evidence.observedAt,
    })),
  };
}

/** Catalogue minus merged rows, import faults, and admin-only / QA fixtures. */
export async function getPublicCatalog(): Promise<CatalogDaycare[]> {
  return (await getPublicCatalogResult()).rows;
}

export async function getPublicCatalogResult(opts?: SearchReadOptions): Promise<SearchBatch<CatalogDaycare>> {
  const batch = await getCatalogResult(opts);
  return withSearchRows(batch, batch.rows.filter(isPublicListing));
}

/** JSON-grid nearby. Nearby PostGIS uses this only when Neon is not the SoT. */
export async function catalogNearFromJson(origin: { lat: number; lng: number }, radiusKm: number) {
  return (await catalogNearFromJsonResult(origin, radiusKm)).rows;
}

export async function catalogNearFromJsonResult(origin: { lat: number; lng: number }, radiusKm: number, opts?: SearchReadOptions): Promise<SearchBatch<CatalogDaycare>> {
  await ensureRaw();
  const evidence = await snapshotEvidence(rawObservedAt);
  if (!rawGrid) return { rows: [], evidence };
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
  return omitSuppressedBundleCopiesResult({ rows: out, evidence }, opts);
}

/**
 * Licensed rows whose city and province match exactly.
 * Used when a centre is in that city but its pin sits outside the search radius.
 */
export async function catalogNamedCityFromJson(city: string, province: string): Promise<CatalogDaycare[]> {
  return (await catalogNamedCityFromJsonResult(city, province)).rows;
}

export async function catalogNamedCityFromJsonResult(city: string, province: string, opts?: SearchReadOptions): Promise<SearchBatch<CatalogDaycare>> {
  await ensureRaw();
  const evidence = await snapshotEvidence(rawObservedAt);
  if (!rawCentres) return { rows: [], evidence };
  const cityKey = normalizeCityKey(city);
  const provinceKey = province.trim().toUpperCase();
  if (!cityKey || provinceKey.length !== 2) return { rows: [], evidence };
  const out: CatalogDaycare[] = [];
  for (const row of rawCentres) {
    if (normalizeCityKey(row.city) !== cityKey) continue;
    if ((row.province || "").trim().toUpperCase() !== provinceKey) continue;
    const listed = await hydrateRaw(row);
    if (!isPublicListing(listed)) continue;
    out.push(listed);
  }
  return omitSuppressedBundleCopiesResult({ rows: out, evidence }, opts);
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
  amenities?: string | null;
  facilityType?: string | null;
  showPublicAddress?: boolean;
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
  return (await catalogByIdsGetResult(ids)).rows;
}

export async function catalogByIdsGetResult(ids: string[], opts?: SearchReadOptions): Promise<SearchBatch<CatalogDaycare>> {
  const wanted = ids.filter(Boolean);
  if (typeof window === "undefined") {
    try {
      const { neonCatalogByIdsResult } = await import("./server/catalog-neon");
      const neon = await neonCatalogByIdsResult(wanted, opts);
      if (neon) {
        const byId = new Map(neon.rows.map((row) => [row.id, row]));
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
        if (needBundle.length === 0) return withSearchRows(neon, out);
        const catalog = await loadJsonCatalog();
        const jsonById = new Map(catalog.map((row) => [row.id, row]));
        const bundled = needBundle
          .map((id) => jsonById.get(id))
          .filter((row): row is CatalogDaycare => Boolean(row));
        const safe = await omitSuppressedBundleCopiesResult({ rows: bundled, evidence: await snapshotEvidence(jsonObservedAt) }, opts);
        return { rows: [...out, ...safe.rows.filter(isPublicListing)], evidence: mergeSearchEvidence(neon.evidence, safe.evidence) };
      }
    } catch {
      /* cold fallback */
    }
  }
  const catalog = await loadJsonCatalog();
  const byId = new Map(catalog.map((row) => [row.id, row]));
  const bundled = wanted.map((id) => byId.get(id)).filter((row): row is CatalogDaycare => Boolean(row));
  const safe = await omitSuppressedBundleCopiesResult({ rows: bundled, evidence: await snapshotEvidence(jsonObservedAt) }, opts);
  return withSearchRows(safe, safe.rows.filter(isPublicListing));
}

export function catalogMonths() {
  return nextMonths(6);
}

export { amenityLabel } from "./amenities";
