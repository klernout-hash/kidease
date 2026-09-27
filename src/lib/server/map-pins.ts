/**
 * Listings inside the map camera.
 *
 * Search lists stop at 400 rows (NEON_NEAR_SQL / NEON_DUAL_NEAR_SQL /
 * APPROVED_CITY_SQL). That is a list cap, not the number of public centres
 * in a city. This read has no row cap: a province view returns grid counts,
 * and a city or search-radius view returns a short pin (name, address,
 * coordinates) for every listing in the box, even when that box is wide
 * on a desktop map. Results are memoized by the snapped viewport so a
 * small pan does not hit Neon again. Zooming in from area counts does.
 */

import { createServerFn } from "@tanstack/react-start";
import { listRawMapPinsInBbox } from "@/lib/catalog";
import { dbSource, getSql, type Sql } from "@/lib/db";
import { correctCentreNameTypos } from "@/lib/listing-slug";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import {
  MAP_MERGE_FRAC,
  cacheMapBbox,
  clampMapZoom,
  clusterCellSize,
  clusterCountTotal,
  mapLoadMode,
  mapViewCacheKey,
  mergeMapClusters,
  projectMapRows,
  sanitizeMapBbox,
  type MapBbox,
  type MapCluster,
  type MapPin,
  type MapViewData,
} from "@/lib/map-cluster";

const TTL_MS = 60_000;
const MAX_ENTRIES = 48;

type CacheEntry = { at: number; value: MapViewData };

const cache = new Map<string, CacheEntry>();

export const MAP_BBOX_WHERE_SQL = `
  ${PUBLIC_LISTING_SQL}
  and lat between $1 and $2
  and lng between $3 and $4
  and not (lat = 0 and lng = 0)
`;

/** Lightweight pin. No fees, copy, or photo blobs. No LIMIT. */
export const MAP_PINS_SQL = `
select id, slug, name, coalesce(name_fr, '') as name_fr,
  lat, lng,
  coalesce(address, '') as address,
  coalesce(city, '') as city,
  coalesce(province, '') as province,
  coalesce(postal_code, '') as postal_code
from daycares
where ${MAP_BBOX_WHERE_SQL}
`;

/**
 * One row per grid cell. $5/$6 are the cell size in degrees (same math as
 * clusterCellSize). No LIMIT — the count is the number of public listings.
 */
export const MAP_CLUSTER_SQL = `
select
  floor(lat / $5::float8)::int as gy,
  floor(lng / $6::float8)::int as gx,
  count(*)::int as n,
  avg(lat)::float8 as lat,
  avg(lng)::float8 as lng,
  min(lat)::float8 as min_lat,
  max(lat)::float8 as max_lat,
  min(lng)::float8 as min_lng,
  max(lng)::float8 as max_lng,
  case when count(*) = 1 then min(id) else null end as id,
  case when count(*) = 1 then min(slug) else null end as slug,
  case when count(*) = 1 then min(name) else null end as name,
  case when count(*) = 1 then min(coalesce(name_fr, '')) else null end as name_fr,
  case when count(*) = 1 then min(coalesce(address, '')) else null end as address,
  case when count(*) = 1 then min(coalesce(city, '')) else null end as city,
  case when count(*) = 1 then min(coalesce(province, '')) else null end as province,
  case when count(*) = 1 then min(coalesce(postal_code, '')) else null end as postal_code
from daycares
where ${MAP_BBOX_WHERE_SQL}
group by 1, 2
`;

type PinRow = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  name_fr?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  n?: number | string | null;
  min_lat?: number | string | null;
  max_lat?: number | string | null;
  min_lng?: number | string | null;
  max_lng?: number | string | null;
};

function rejectAfter(ms: number, message: string) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

function num(value: number | string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function mapRowToPin(row: PinRow): MapPin | null {
  const id = String(row.id || "").trim();
  const slug = String(row.slug || "").trim();
  const name = correctCentreNameTypos(String(row.name || "").trim());
  const lat = num(row.lat);
  const lng = num(row.lng);
  if (!id || !slug || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return {
    id,
    slug,
    name,
    nameFr: correctCentreNameTypos(String(row.name_fr || "").trim()),
    lat,
    lng,
    address: String(row.address || ""),
    city: String(row.city || ""),
    province: String(row.province || ""),
    postalCode: String(row.postal_code || ""),
  };
}

function remember(key: string, value: MapViewData): MapViewData {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (typeof oldest === "string") cache.delete(oldest);
  }
  return value;
}

function cached(key: string): MapViewData | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

async function queryNeonMap(sql: Sql, box: MapBbox, zoom: number): Promise<MapViewData> {
  const mode = mapLoadMode(zoom, box);
  if (mode === "pins") {
    const rows = await Promise.race([
      sql.query<PinRow>(MAP_PINS_SQL, [box.minLat, box.maxLat, box.minLng, box.maxLng]),
      rejectAfter(5000, "map-pins-timeout"),
    ]);
    const pins = rows.map(mapRowToPin).filter((pin): pin is MapPin => Boolean(pin));
    return { mode: "pins", pins, total: pins.length, truncated: false, bbox: box, zoom };
  }
  const mid = (box.minLat + box.maxLat) / 2;
  const cell = clusterCellSize(zoom, mid);
  const rows = await Promise.race([
    sql.query<PinRow>(MAP_CLUSTER_SQL, [
      box.minLat,
      box.maxLat,
      box.minLng,
      box.maxLng,
      cell.latDeg,
      cell.lngDeg,
    ]),
    rejectAfter(5000, "map-cluster-timeout"),
  ]);
  const cells: MapCluster[] = [];
  for (const row of rows) {
    const count = Math.round(num(row.n));
    const lat = num(row.lat);
    const lng = num(row.lng);
    if (!Number.isFinite(count) || count < 1 || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const cluster: MapCluster = {
      lat,
      lng,
      count,
      minLat: num(row.min_lat),
      maxLat: num(row.max_lat),
      minLng: num(row.min_lng),
      maxLng: num(row.max_lng),
    };
    if (!Number.isFinite(cluster.minLat)) cluster.minLat = lat;
    if (!Number.isFinite(cluster.maxLat)) cluster.maxLat = lat;
    if (!Number.isFinite(cluster.minLng)) cluster.minLng = lng;
    if (!Number.isFinite(cluster.maxLng)) cluster.maxLng = lng;
    if (count === 1) {
      const pin = mapRowToPin(row);
      if (pin) cluster.pin = pin;
    }
    cells.push(cluster);
  }
  const clusters = mergeMapClusters(cells, cell.km * MAP_MERGE_FRAC);
  return {
    mode: "clusters",
    clusters,
    total: clusterCountTotal(clusters),
    truncated: false,
    bbox: box,
    zoom,
  };
}

async function queryMap(box: MapBbox, zoom: number): Promise<MapViewData> {
  if (dbSource === "neon") {
    try {
      const sql = await Promise.race([getSql(), rejectAfter(5000, "map-sql-timeout")]);
      return await queryNeonMap(sql, box, zoom);
    } catch {
      /* Bundled catalogue when Neon does not answer. */
    }
  }
  const pins = (await listRawMapPinsInBbox(box))
    .map((pin) =>
      mapRowToPin({
        id: pin.id,
        slug: pin.slug,
        name: pin.name,
        name_fr: pin.nameFr,
        lat: pin.lat,
        lng: pin.lng,
        address: pin.address,
        city: pin.city,
        province: pin.province,
        postal_code: pin.postalCode,
      }),
    )
    .filter((pin): pin is MapPin => Boolean(pin));
  return projectMapRows(pins, zoom, box);
}

export async function loadMapPinsInView(input: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  zoom: number;
}): Promise<MapViewData> {
  const zoom = clampMapZoom(input.zoom);
  const box = sanitizeMapBbox(input);
  if (!box) {
    return {
      mode: "clusters",
      clusters: [],
      total: 0,
      truncated: false,
      bbox: { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 },
      zoom,
    };
  }
  const snapped = cacheMapBbox(box, zoom);
  const key = mapViewCacheKey(snapped, zoom);
  const hit = cached(key);
  if (hit) return hit;
  return remember(key, await queryMap(snapped, zoom));
}

export const mapPinsInView = createServerFn({ method: "GET" })
  .validator((input: { minLat: number; maxLat: number; minLng: number; maxLng: number; zoom: number }) => ({
    minLat: Number(input.minLat),
    maxLat: Number(input.maxLat),
    minLng: Number(input.minLng),
    maxLng: Number(input.maxLng),
    zoom: Number(input.zoom),
  }))
  .handler(async ({ data }) => loadMapPinsInView(data));
