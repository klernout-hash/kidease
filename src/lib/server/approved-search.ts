/**
 * Approved centres whose stored geography is missing or outside their city
 * still belong in that city's Live search. Distance uses the verified city
 * point; the normal PostGIS path keeps street pins that are already nearby.
 */

import { getSql } from "@/lib/db";
import type { CatalogDaycare } from "@/lib/catalog";
import type { LatLng } from "@/lib/geo";
import type { LocationLock } from "@/lib/location-lock";
import { placeApprovedCentre } from "@/lib/live-search";
import { isPublicListing, PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import { CATALOG_SELECT, catalogRowToListing, type CatalogDbRow } from "./catalog-neon";
import type { NearbyListing } from "./nearby";

/**
 * City-scoped, not an unordered province slice. A Live Edmonton centre must
 * not fall off a 300-row Alberta cap. Lat/lng in the search box still match
 * when the stored city string is "Edmonton" or the geography pin is stale.
 */
const APPROVED_CITY_SQL = `
select ${CATALOG_SELECT}
from daycares
where ${PUBLIC_LISTING_SQL}
  and coalesce(listing_active, 1) <> 0
  and lower(coalesce(claim_status, '')) not in ('superseded', 'declined', 'rejected', 'denied')
  and (
    lower(coalesce(claim_status, '')) in ('approved', 'live', 'active', 'published')
    or (
      claimed_at is not null
      and lower(coalesce(claim_status, '')) not in ('waiting', 'pending', 'unclaimed')
    )
  )
  and (
    upper(btrim(coalesce(province, ''))) = upper(btrim($1))
    or (
      upper(btrim($1)) in ('AB', 'ALBERTA')
      and upper(btrim(coalesce(province, ''))) in ('AB', 'ALBERTA')
    )
  )
  and (
    (
      $2 <> ''
      and (
        lower(btrim(coalesce(city, ''))) = lower(btrim($2))
        or lower(btrim(coalesce(city, ''))) like lower(btrim($2)) || '%'
      )
    )
    or (
      lat is not null
      and lng is not null
      and lat between $3 and $4
      and lng between $5 and $6
    )
  )
limit 300
`;

function radiusBox(origin: LatLng, radiusKm: number) {
  const km = Math.max(radiusKm, 1);
  const latDelta = km / 110;
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  const lngDelta = km / (111 * Math.max(0.2, Math.abs(cos)));
  return {
    latMin: origin.lat - latDelta,
    latMax: origin.lat + latDelta,
    lngMin: origin.lng - lngDelta,
    lngMax: origin.lng + lngDelta,
  };
}

export async function mergeApprovedCityListings(
  listings: NearbyListing[],
  input: {
    origin: LatLng;
    radiusKm: number;
    lock: LocationLock | null;
  },
): Promise<NearbyListing[]> {
  const lock = input.lock;
  if (!lock?.city || !lock.province) return listings;
  const box = radiusBox(input.origin, input.radiusKm);
  const city = lock.city.replace(/[%_\\]/g, "").trim();
  let rows: CatalogDbRow[] = [];
  try {
    const sql = await getSql();
    rows = await sql.query<CatalogDbRow>(APPROVED_CITY_SQL, [
      lock.province,
      city,
      box.latMin,
      box.latMax,
      box.lngMin,
      box.lngMax,
    ]);
  } catch {
    return listings;
  }
  const seen = new Set(listings.map((row) => row.id));
  const merged = [...listings];
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue;
    const listing = catalogRowToListing(row);
    if (!isPublicListing(listing)) continue;
    const placed = placeApprovedCentre(listing, {
      origin: input.origin,
      radiusKm: input.radiusKm,
      lock,
    });
    if (!placed) continue;
    seen.add(listing.id);
    const located: CatalogDaycare & { distanceKm: number } = {
      ...listing,
      lat: placed.lat,
      lng: placed.lng,
      distanceKm: placed.distanceKm,
    };
    merged.push(located);
  }
  return merged;
}
