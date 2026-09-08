import { dbSource, getSql, type Sql } from "@/lib/db";
import { catalogNearFromJson, type CatalogDaycare } from "@/lib/catalog";
import { catalogSourceFromEnv } from "@/lib/catalog-source";
import { isPublicListing } from "@/lib/listing-visibility";
import { clampRadiusKm, distanceKm } from "@/lib/proximity";
import { isNeonCatalogPreferred, queryNeonNearby, queryNeonNearbyDual } from "./catalog-neon";
import { upsertDaycare } from "./seed";

export type NearbyListing = CatalogDaycare & { distanceKm?: number };

/** Re-exported for tests that read this file for ST_DWithin. */
export { NEON_NEAR_SQL as NEARBY_SQL, NEON_DUAL_NEAR_SQL as NEARBY_DUAL_SQL, POSTGIS_READY_SQL } from "./catalog-neon";

async function importCatalogSlice(sql: Sql, rows: CatalogDaycare[]) {
  const chunk = 24;
  for (let i = 0; i < rows.length; i += chunk) {
    await Promise.all(
      rows.slice(i, i + chunk).map((d) => upsertDaycare(sql, d, { availability: false }).catch(() => undefined)),
    );
  }
}

/**
 * Nearby licensed centres. Prefers Neon PostGIS ST_DWithin.
 * When Neon holds a national catalogue, empty geography is trusted — JSON is
 * not loaded. JSON is only the empty-table / unavailable fallback.
 */
export async function nearbyListings(
  origin: { lat: number; lng: number },
  radiusKm: number,
): Promise<NearbyListing[]> {
  if (dbSource === "neon" && catalogSourceFromEnv() !== "json") {
    try {
      const sql = await Promise.race([
        getSql(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("nearby-sql-timeout")), 6000);
        }),
      ]);
      const geo = await queryNeonNearby(origin, radiusKm, sql);
      if (geo) {
        if (geo.length > 0) return geo.filter(isPublicListing);
        if (await isNeonCatalogPreferred(sql)) return [];
        const fallback = await catalogNearFromJson(origin, radiusKm);
        if (fallback.length > 0) {
          void importCatalogSlice(sql, fallback).catch(() => undefined);
        }
        return fallback.filter(isPublicListing);
      }
    } catch {
      /* fall through to catalogue */
    }
  }
  return catalogNearFromJson(origin, radiusKm);
}

async function catalogIntersectFromJson(
  originA: { lat: number; lng: number },
  originB: { lat: number; lng: number },
  radiusKm: number,
): Promise<NearbyListing[]> {
  const radius = clampRadiusKm(radiusKm);
  const rows = await catalogNearFromJson(originA, radius);
  return rows.filter((d) => distanceKm(originB, { lat: d.lat, lng: d.lng }) <= radius);
}

/**
 * Centres inside both radii (intersection). Same Neon / JSON fallback as nearbyListings.
 * Single-anchor callers must keep using nearbyListings.
 */
export async function nearbyListingsDual(
  originA: { lat: number; lng: number },
  originB: { lat: number; lng: number },
  radiusKm: number,
): Promise<NearbyListing[]> {
  if (dbSource === "neon" && catalogSourceFromEnv() !== "json") {
    try {
      const sql = await Promise.race([
        getSql(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("nearby-sql-timeout")), 6000);
        }),
      ]);
      const geo = await queryNeonNearbyDual(originA, originB, radiusKm, sql);
      if (geo) {
        if (geo.length > 0) return geo.filter(isPublicListing);
        if (await isNeonCatalogPreferred(sql)) return [];
        const fallback = await catalogIntersectFromJson(originA, originB, radiusKm);
        if (fallback.length > 0) {
          void importCatalogSlice(sql, fallback).catch(() => undefined);
        }
        return fallback.filter(isPublicListing);
      }
    } catch {
      /* fall through to catalogue */
    }
  }
  return catalogIntersectFromJson(originA, originB, radiusKm);
}
