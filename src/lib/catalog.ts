import { nextMonths } from "./utils";
import {
  hydrateRaw,
  loadJsonCatalogFromDisk,
  loadRawCentresFromDisk,
  type CatalogDaycare,
  type RawCentre,
} from "./catalog-hydrate.ts";
import { isAdminOnlyListing, isPublicListing } from "./listing-visibility";
import { listingSlugLookupKeys, rememberSlugAliases } from "./listing-slug";
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
  return rememberCatalog(await loadJsonCatalog(), "json");
}

/** Catalogue minus admin-only / QA fixtures. */
export async function getPublicCatalog(): Promise<CatalogDaycare[]> {
  return (await getCatalog()).filter((d) => !isAdminOnlyListing(d));
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
        if (isAdminOnlyListing(listed)) continue;
        out.push(listed);
      }
    }
  }
  return out;
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

export async function catalogBySlugGet(slug: string) {
  const keys = listingSlugLookupKeys(slug);
  if (typeof window === "undefined") {
    try {
      const { neonCatalogBySlug } = await import("./server/catalog-neon");
      const neon = await neonCatalogBySlug(slug);
      if (neon) return neon;
    } catch {
      /* cold fallback */
    }
  }
  for (const key of keys) {
    if (catalogBySlugMap.has(key)) return catalogBySlugMap.get(key);
  }
  for (const key of keys) {
    const hit = await jsonBySlug(key);
    if (hit) return hit;
  }
}

export async function catalogByIdGet(id: string) {
  if (typeof window === "undefined") {
    try {
      const { neonCatalogById } = await import("./server/catalog-neon");
      const neon = await neonCatalogById(id);
      if (neon) return neon;
    } catch {
      /* cold fallback */
    }
  }
  if (catalogByIdMap.has(id)) return catalogByIdMap.get(id);
  return jsonById(id);
}

export async function catalogByIdsGet(ids: string[]) {
  if (typeof window === "undefined") {
    try {
      const { neonCatalogByIds } = await import("./server/catalog-neon");
      const neon = await neonCatalogByIds(ids);
      if (neon) return neon;
    } catch {
      /* cold fallback */
    }
  }
  const wanted = ids.filter(Boolean);
  const catalog = await loadJsonCatalog();
  const byId = new Map(catalog.map((d) => [d.id, d]));
  return wanted.map((id) => byId.get(id)).filter((d): d is CatalogDaycare => Boolean(d));
}

export function catalogMonths() {
  return nextMonths(6);
}

export { amenityLabel } from "./amenities";
