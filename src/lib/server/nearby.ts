import { dbSource, getSql, type Sql } from "@/lib/db";
import { catalogByIdGet, catalogNear, type CatalogDaycare } from "@/lib/catalog";
import { clampRadiusKm } from "@/lib/proximity";
import { upsertDaycare } from "./seed";

export type NearbyListing = CatalogDaycare & { distanceKm?: number };

/** lng, lat, radius_meters — ST_MakePoint is (lng, lat). */
export const NEARBY_SQL = `
select id,
  st_distance(location, st_setsrid(st_makepoint($1, $2), 4326)::geography) / 1000.0 as distance_km
from daycares
where location is not null
  and st_dwithin(
    location,
    st_setsrid(st_makepoint($1, $2), 4326)::geography,
    $3
  )
order by location <-> st_setsrid(st_makepoint($1, $2), 4326)::geography
limit 800
`;

export const POSTGIS_READY_SQL = `
select exists (
  select 1 from pg_extension where extname = 'postgis'
) and exists (
  select 1 from information_schema.columns
  where table_name = 'daycares' and column_name = 'location'
) as ok
`;

type GeoRow = { id: string; distance_km: number };

async function postgisReady(sql: Sql): Promise<boolean> {
  try {
    const rows = await sql.query<{ ok: boolean }>(POSTGIS_READY_SQL);
    return Boolean(rows[0]?.ok);
  } catch {
    return false;
  }
}

async function queryDWithin(sql: Sql, origin: { lat: number; lng: number }, radiusKm: number) {
  const meters = clampRadiusKm(radiusKm) * 1000;
  return sql.query<GeoRow>(NEARBY_SQL, [origin.lng, origin.lat, meters]);
}

async function importCatalogSlice(sql: Sql, rows: CatalogDaycare[]) {
  const chunk = 24;
  for (let i = 0; i < rows.length; i += chunk) {
    await Promise.all(
      rows.slice(i, i + chunk).map((d) => upsertDaycare(sql, d).catch(() => undefined)),
    );
  }
}

async function hydrateGeo(rows: GeoRow[]): Promise<NearbyListing[]> {
  const out: NearbyListing[] = [];
  for (const row of rows) {
    const listed = await catalogByIdGet(row.id);
    if (!listed) continue;
    out.push({ ...listed, distanceKm: Math.round(Number(row.distance_km) * 10) / 10 });
  }
  return out;
}

/**
 * Nearby licensed centres. Prefers Neon PostGIS ST_DWithin when DATABASE_URL
 * is wired and geography is ready. Otherwise (or if the table is still empty)
 * uses the centres.json catalogue with a server-side radius.
 */
export async function nearbyListings(
  origin: { lat: number; lng: number },
  radiusKm: number,
): Promise<NearbyListing[]> {
  const fallback = await catalogNear(origin, radiusKm);
  if (dbSource !== "neon") return fallback;

  const sql = await getSql();
  if (!(await postgisReady(sql))) return fallback;

  try {
    let geo = await queryDWithin(sql, origin, radiusKm);
    if (geo.length === 0 && fallback.length > 0) {
      await importCatalogSlice(sql, fallback);
      geo = await queryDWithin(sql, origin, radiusKm);
    } else if (geo.length < fallback.length) {
      void importCatalogSlice(sql, fallback).catch(() => undefined);
    }
    if (geo.length === 0) return fallback;
    const hydrated = await hydrateGeo(geo);
    return hydrated.length > 0 ? hydrated : fallback;
  } catch {
    return fallback;
  }
}
