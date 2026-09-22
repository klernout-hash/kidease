/**
 * Live search inclusion for a centre Admin and the public page already treat as Live.
 * The wide radius query can time out or miss a stale geography pin. Callers union
 * the approved-city rescue so that centre is not replaced with an empty list.
 */

import type { ApprovalCentre } from "./approve-live.ts";
import { parentSearchLive, verifiedSearchPoint } from "./approve-live.ts";
import { matchesDaycareName } from "./explore-search.ts";
import { haversineKm, type LatLng } from "./geo.ts";
import { listingMatchesLocationLock, type LocationLock } from "./location-lock.ts";

export function placeApprovedCentre(
  centre: ApprovalCentre,
  input: { origin: LatLng; radiusKm: number; lock: LocationLock | null },
): { lat: number; lng: number; distanceKm: number } | null {
  if (!parentSearchLive(centre)) return null;
  if (!listingMatchesLocationLock({ city: centre.city, province: centre.province }, input.lock)) return null;
  const point = verifiedSearchPoint(centre);
  if (!point.eligible) return null;
  const distanceKm = haversineKm(input.origin, point);
  if (distanceKm > input.radiusKm) return null;
  return { lat: point.lat, lng: point.lng, distanceKm };
}

/**
 * `full === null` means the wide search timed out or threw.
 * A Live centre that the wide pass omitted is still returned.
 * When the wide card is present but not marked live, the rescue live bit wins.
 */
export function pickSearchResult<T extends { id: string; live?: boolean | null }>(
  full: T[] | null,
  rescue: T[],
): T[] {
  if (full === null) return rescue;
  if (!rescue.length) return full;
  const rescueById = new Map(rescue.map((row) => [row.id, row]));
  const merged = full.map((row) => {
    const extra = rescueById.get(row.id);
    if (extra?.live && !row.live) return { ...row, live: true as const };
    return row;
  });
  const seen = new Set(merged.map((row) => row.id));
  const missing = rescue.filter((row) => row.id && !seen.has(row.id));
  return missing.length ? [...missing, ...merged] : merged;
}

/** Same-city refetch that comes back empty must not wipe a list already painted. */
export function keepPaintedSearch<T>(previous: T[] | null, next: T[], sameQuery: boolean): T[] {
  if (next.length === 0 && sameQuery && previous && previous.length > 0) return previous;
  return next;
}

export function liveNameSearchHits<T extends { live?: boolean | null; name: string; nameFr?: string | null }>(
  rows: T[],
  input: { liveOnly?: boolean; name?: string | null },
): T[] {
  let out = rows;
  if (input.liveOnly) out = out.filter((row) => Boolean(row.live));
  const name = (input.name || "").trim();
  if (name) out = out.filter((row) => matchesDaycareName(row, name));
  return out;
}
