import { dbSource, getSql, type Sql } from "@/lib/db";
import { catalogNearFromJsonResult, type CatalogDaycare } from "@/lib/catalog";
import { catalogSourceFromEnv } from "@/lib/catalog-source";
import { commuteMidpoint, commuteQueryRadiusKm, isAlongCommute } from "@/lib/commute-route";
import { isPublicListing } from "@/lib/listing-visibility";
import { clampRadiusKm, distanceKm } from "@/lib/proximity";
import { isNeonCatalogPreferred, queryNeonNearbyResult, queryNeonNearbyDualResult } from "./catalog-neon";
import { upsertDaycare } from "./seed";
import { searchEvidence, withSearchRows, type SearchBatch, type SearchReadOptions } from "@/lib/search-evidence";

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
  limit = 400,
): Promise<NearbyListing[]> {
  return (await nearbyListingsResult(origin, radiusKm, limit)).rows;
}

/** Same nearby rows, with retrieval coverage preserved before downstream filters. */
export async function nearbyListingsResult(
  origin: { lat: number; lng: number },
  radiusKm: number,
  limit = 400,
  opts?: SearchReadOptions,
): Promise<SearchBatch<NearbyListing>> {
  let primaryUnavailable = false;
  if (dbSource === "neon" && catalogSourceFromEnv() !== "json") {
    try {
      const sql = await Promise.race([
        getSql(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("nearby-sql-timeout")), 6000);
        }),
      ]);
      const geo = await queryNeonNearbyResult(origin, radiusKm, sql, limit, opts);
      if (geo) {
        if (geo.rows.length > 0) return withSearchRows(geo, geo.rows.filter(isPublicListing));
        if (await isNeonCatalogPreferred(sql, opts)) return geo;
        const fallback = await catalogNearFromJsonResult(origin, radiusKm, opts);
        if (fallback.rows.length > 0) {
          void importCatalogSlice(sql, fallback.rows).catch(() => undefined);
        }
        return snapshotFallback(withSearchRows(fallback, fallback.rows.filter(isPublicListing)), false);
      }
      primaryUnavailable = true;
    } catch {
      primaryUnavailable = true;
      /* fall through to catalogue */
    }
  }
  const fallback = await catalogNearFromJsonResult(origin, radiusKm, opts);
  return primaryUnavailable ? snapshotFallback(fallback, true) : fallback;
}

function snapshotFallback<T>(batch: SearchBatch<T>, unavailable: boolean): SearchBatch<T> {
  return {
    rows: batch.rows,
    evidence: searchEvidence({
      ...batch.evidence,
      status: "unverified",
      reasons: [...batch.evidence.reasons, "source-fallback", ...(unavailable ? ["source-unavailable" as const] : [])],
      retryable: unavailable || batch.evidence.retryable,
    }),
  };
}

async function catalogIntersectFromJsonResult(
  originA: { lat: number; lng: number },
  originB: { lat: number; lng: number },
  radiusKm: number,
  opts?: SearchReadOptions,
): Promise<SearchBatch<NearbyListing>> {
  const radius = clampRadiusKm(radiusKm);
  const batch = await catalogNearFromJsonResult(originA, radius, opts);
  return withSearchRows(batch, batch.rows.filter((d) => distanceKm(originB, { lat: d.lat, lng: d.lng }) <= radius));
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
  return (await nearbyListingsDualResult(originA, originB, radiusKm)).rows;
}

export async function nearbyListingsDualResult(
  originA: { lat: number; lng: number },
  originB: { lat: number; lng: number },
  radiusKm: number,
  opts?: SearchReadOptions,
): Promise<SearchBatch<NearbyListing>> {
  let primaryUnavailable = false;
  if (dbSource === "neon" && catalogSourceFromEnv() !== "json") {
    try {
      const sql = await Promise.race([
        getSql(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("nearby-sql-timeout")), 6000);
        }),
      ]);
      const geo = await queryNeonNearbyDualResult(originA, originB, radiusKm, sql, opts);
      if (geo) {
        if (geo.rows.length > 0) return withSearchRows(geo, geo.rows.filter(isPublicListing));
        if (await isNeonCatalogPreferred(sql, opts)) return geo;
        const fallback = await catalogIntersectFromJsonResult(originA, originB, radiusKm, opts);
        if (fallback.rows.length > 0) {
          void importCatalogSlice(sql, fallback.rows).catch(() => undefined);
        }
        return snapshotFallback(withSearchRows(fallback, fallback.rows.filter(isPublicListing)), false);
      }
      primaryUnavailable = true;
    } catch {
      primaryUnavailable = true;
      /* fall through to catalogue */
    }
  }
  const fallback = await catalogIntersectFromJsonResult(originA, originB, radiusKm, opts);
  return primaryUnavailable ? snapshotFallback(fallback, true) : fallback;
}

/**
 * Public listings within 8 km of the straight line between home and work.
 * Union these with nearbyListingsDual. Do not replace the two-circle search.
 */
export async function nearbyListingsAlong(
  originA: { lat: number; lng: number },
  originB: { lat: number; lng: number },
  radiusKm: number,
): Promise<NearbyListing[]> {
  return (await nearbyListingsAlongResult(originA, originB, radiusKm)).rows;
}

export async function nearbyListingsAlongResult(
  originA: { lat: number; lng: number },
  originB: { lat: number; lng: number },
  radiusKm: number,
  opts?: SearchReadOptions,
): Promise<SearchBatch<NearbyListing>> {
  const mid = commuteMidpoint(originA, originB);
  const reach = commuteQueryRadiusKm(originA, originB, radiusKm);
  const batch = await nearbyListingsResult(mid, reach, 800, opts);
  return withSearchRows(batch, batch.rows.filter((row) => isAlongCommute(originA, originB, { lat: row.lat, lng: row.lng })));
}
