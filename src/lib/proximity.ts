import { CITIES, PROVINCES, geocode, haversineKm, reverseGeocode, type LatLng } from "@/lib/geo";
import type { DaycareCard } from "@/lib/types";

export const MAX_SEARCH_RADIUS_KM = 100;
export const MIN_SEARCH_RADIUS_KM = 1;

/** Hard cap: never query or render beyond 100 km of the active origin. */
export function clampRadiusKm(radiusKm: number) {
  const n = Number(radiusKm);
  if (!Number.isFinite(n)) return 25;
  return Math.min(MAX_SEARCH_RADIUS_KM, Math.max(MIN_SEARCH_RADIUS_KM, Math.round(n)));
}

/** Fast lat/lng window so we don't haversine every centre in Canada. */
export function bboxFromRadius(origin: LatLng, radiusKm: number) {
  const radius = clampRadiusKm(radiusKm);
  const latDelta = radius / 110.574;
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  const lngDelta = radius / (111.32 * Math.max(0.2, Math.abs(cos)));
  return {
    minLat: origin.lat - latDelta,
    maxLat: origin.lat + latDelta,
    minLng: origin.lng - lngDelta,
    maxLng: origin.lng + lngDelta,
  };
}

export function inBbox(
  point: LatLng,
  box: ReturnType<typeof bboxFromRadius>,
) {
  return point.lat >= box.minLat && point.lat <= box.maxLat && point.lng >= box.minLng && point.lng <= box.maxLng;
}

export function distanceKm(origin: LatLng, point: LatLng) {
  return Math.round(haversineKm(origin, point) * 10) / 10;
}

export type ProximityBand = "walk" | "nearby" | "commute" | "drive";

export function proximityBand(km: number): ProximityBand {
  if (km <= 1.2) return "walk";
  if (km <= 5) return "nearby";
  if (km <= 15) return "commute";
  return "drive";
}

export function resolvePlace(query: string): (LatLng & { label: string }) | null {
  return geocode(query);
}

export function locateHere(lat: number, lng: number) {
  const label = reverseGeocode(lat, lng);
  const here = { lat, lng };
  let city = CITIES[0]!;
  let cityKm = Infinity;
  for (const c of CITIES) {
    const d = haversineKm(here, c);
    if (d < cityKm) {
      cityKm = d;
      city = c;
    }
  }
  let province = PROVINCES[0]!;
  let provKm = Infinity;
  for (const p of PROVINCES) {
    const d = haversineKm(here, p);
    if (d < provKm) {
      provKm = d;
      province = p;
    }
  }
  return {
    lat,
    lng,
    label,
    city: city.label,
    province: city.province || province.code,
    cityKm: Math.round(cityKm * 10) / 10,
  };
}

/**
 * Score falls by half every `halfLifeKm` (default = that centre's catchment).
 * 0 km → 1, catchment edge → 0.5, 2× catchment → 0.25.
 */
export function distanceDecay(km: number, halfLifeKm = 8) {
  const half = Math.max(2, halfLifeKm);
  return Math.exp((-Math.LN2 * Math.max(0, km)) / half);
}

export function proximityScore(card: DaycareCard) {
  let score = distanceDecay(card.distanceKm, card.catchmentKm ?? 8);
  if (card.inCatchment) score += 0.16;
  if (card.live) score += 0.12;
  if (card.spotsTotal > 0) score += Math.min(0.1, card.spotsTotal * 0.02);
  if (card.priority) score += 0.22;
  if (card.ratingX10 > 0) score += (card.ratingX10 / 50) * 0.08;
  return score;
}

export function compareProximity(a: DaycareCard, b: DaycareCard) {
  const delta = proximityScore(b) - proximityScore(a);
  if (Math.abs(delta) > 0.008) return delta;
  return a.distanceKm - b.distanceKm;
}

export function fsaOf(postal?: string | null) {
  if (!postal) return "";
  const compact = postal.replace(/\s+/g, "").toUpperCase();
  if (compact.length < 3) return "";
  return compact.slice(0, 3);
}

const METRO_KM = 40;
const URBAN_CATCHMENT_KM = 8;
const RURAL_CATCHMENT_KM = 20;

/** Typical parent-draw for a licensed centre at this point. */
export function catchmentKmForPoint(point: LatLng) {
  let nearest = Infinity;
  for (const c of CITIES) {
    const d = haversineKm(point, c);
    if (d < nearest) nearest = d;
    if (nearest <= METRO_KM) break;
  }
  return nearest <= METRO_KM ? URBAN_CATCHMENT_KM : RURAL_CATCHMENT_KM;
}

export function catchmentMatch(
  origin: LatLng,
  centre: LatLng & { postalCode?: string },
  km: number,
  originFsa?: string,
) {
  const catchmentKm = catchmentKmForPoint(centre);
  const sameFsa = Boolean(originFsa && fsaOf(centre.postalCode) === originFsa);
  return {
    catchmentKm,
    inCatchment: km <= catchmentKm || sameFsa,
  };
}

export function withinRadius<T extends LatLng>(
  origin: LatLng,
  radiusKm: number,
  points: T[],
): Array<T & { distanceKm: number }> {
  const radius = clampRadiusKm(radiusKm);
  const box = bboxFromRadius(origin, radius);
  const out: Array<T & { distanceKm: number }> = [];
  for (const p of points) {
    if (!inBbox(p, box)) continue;
    const km = distanceKm(origin, p);
    if (km > radius) continue;
    out.push({ ...p, distanceKm: km });
  }
  return out;
}
