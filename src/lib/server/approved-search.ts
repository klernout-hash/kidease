/**
 * Approved centres whose stored geography is missing or outside their city
 * still belong in that city's Live search. Distance uses the verified city
 * point; the normal PostGIS path keeps street pins that are already nearby.
 */

import { getSql } from "@/lib/db";
import type { CatalogDaycare } from "@/lib/catalog";
import { hasLicenceEvidence, verifiedSearchPoint } from "@/lib/approve-live";
import { haversineKm, type LatLng } from "@/lib/geo";
import { listingMatchesLocationLock, type LocationLock } from "@/lib/location-lock";
import { isPublicListing, PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import { CATALOG_SELECT, catalogRowToListing, type CatalogDbRow } from "./catalog-neon";
import type { NearbyListing } from "./nearby";

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
      upper(btrim($1)) = 'AB'
      and upper(btrim(coalesce(province, ''))) in ('AB', 'ALBERTA')
    )
  )
limit 300
`;

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
  let rows: CatalogDbRow[] = [];
  try {
    const sql = await getSql();
    rows = await sql.query<CatalogDbRow>(APPROVED_CITY_SQL, [lock.province]);
  } catch {
    return listings;
  }
  const seen = new Set(listings.map((row) => row.id));
  const merged = [...listings];
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue;
    const listing = catalogRowToListing(row);
    if (!isPublicListing(listing)) continue;
    if (!hasLicenceEvidence(listing)) continue;
    if (!listingMatchesLocationLock(listing, lock)) continue;
    const point = verifiedSearchPoint(listing);
    if (!point.eligible) continue;
    const distanceKm = haversineKm(input.origin, point);
    if (distanceKm > input.radiusKm) continue;
    seen.add(listing.id);
    const located: CatalogDaycare & { distanceKm: number } = {
      ...listing,
      lat: point.lat,
      lng: point.lng,
      distanceKm,
    };
    merged.push(located);
  }
  return merged;
}
