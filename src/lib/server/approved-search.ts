/**
 * Approved centres whose stored geography is missing or outside their city
 * still belong in that city's Live search. Distance uses the verified city
 * point; the normal PostGIS path keeps street pins that are already nearby.
 * Province names and codes match (AB / Alberta, BC / British Columbia, …).
 */

import { getSql } from "@/lib/db";
import type { CatalogDaycare } from "@/lib/catalog";
import { centresInLiveSearch, verifiedSearchPoint } from "@/lib/approve-live";
import { haversineKm, type LatLng } from "@/lib/geo";
import { provinceSearchTokens, type LocationLock } from "@/lib/location-lock";
import { isPublicListing, PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import { CATALOG_SELECT, catalogRowToListing, type CatalogDbRow } from "./catalog-neon";
import type { NearbyListing } from "./nearby";

const APPROVED_CITY_SQL = `
select ${CATALOG_SELECT}
from daycares
where ${PUBLIC_LISTING_SQL}
  and listing_active = 1
  and lower(coalesce(claim_status, '')) in ('approved', 'live', 'active', 'published')
  and upper(btrim(coalesce(province, ''))) = any($1::text[])
  and (
    regexp_replace(lower(btrim(coalesce(city, ''))), '[^a-z0-9]+', ' ', 'g') = any($2::text[])
    or (
      lat between $3 and $4
      and lng between $5 and $6
    )
  )
order by
  case when lower(coalesce(claim_status, '')) in ('approved', 'live', 'active', 'published') then 0 else 1 end,
  claimed_at desc nulls last
limit 400
`;

function radiusBounds(origin: LatLng, radiusKm: number) {
  const km = Math.max(1, radiusKm);
  const dLat = km / 111;
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  const dLng = km / (111 * (Math.abs(cos) < 0.2 ? 0.2 : cos));
  return {
    minLat: origin.lat - dLat,
    maxLat: origin.lat + dLat,
    minLng: origin.lng - dLng,
    maxLng: origin.lng + dLng,
  };
}

export async function mergeApprovedCityListings(
  listings: NearbyListing[],
  input: {
    origin: LatLng;
    radiusKm: number;
    lock: LocationLock | null;
    label?: string | null;
  },
): Promise<NearbyListing[]> {
  const lock = input.lock;
  if (!lock?.city || !lock.province) return listings;
  const tokens = provinceSearchTokens(lock.province);
  const cities = [...new Set(lock.metroKeys.map((key) => key.trim()).filter(Boolean))];
  if (tokens.length === 0 || cities.length === 0) return listings;
  const box = radiusBounds(input.origin, input.radiusKm);
  let rows: CatalogDbRow[] = [];
  try {
    const sql = await getSql();
    rows = await sql.query<CatalogDbRow>(APPROVED_CITY_SQL, [
      tokens,
      cities,
      box.minLat,
      box.maxLat,
      box.minLng,
      box.maxLng,
    ]);
  } catch {
    return listings;
  }
  const seen = new Set(listings.map((row) => row.id));
  const merged = [...listings];
  const label = input.label || [lock.city, lock.province].filter(Boolean).join(", ");
  const candidates = rows
    .filter((row) => row?.id && !seen.has(row.id))
    .map((row) => catalogRowToListing(row))
    .filter((listing) => isPublicListing(listing));
  for (const listing of centresInLiveSearch(candidates, {
    origin: input.origin,
    radiusKm: input.radiusKm,
    label,
  })) {
    if (seen.has(listing.id)) continue;
    const point = verifiedSearchPoint(listing);
    if (!point.eligible) continue;
    seen.add(listing.id);
    const located: CatalogDaycare & { distanceKm: number } = {
      ...listing,
      lat: point.lat,
      lng: point.lng,
      distanceKm: haversineKm(input.origin, point),
    };
    merged.push(located);
  }
  return merged;
}
