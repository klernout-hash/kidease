import { haversineKm, type LatLng } from "./geo.ts";

/** Listings this close to the home-work line count as along the commute. */
export const COMMUTE_CORRIDOR_KM = 8;

/** Midpoint lookup cap so a long commute does not scan the whole province. */
export const COMMUTE_QUERY_CAP_KM = 50;

export function commuteMidpoint(a: LatLng, b: LatLng): LatLng {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

/**
 * Radius for the midpoint lookup. Ends of a commute longer than about 100 km
 * can fall outside this cap. The segment filter still drops anything off the line.
 */
export function commuteQueryRadiusKm(a: LatLng, b: LatLng, searchRadiusKm: number): number {
  const commuteKm = haversineKm(a, b);
  const want = Math.max(finiteKm(searchRadiusKm), commuteKm / 2 + COMMUTE_CORRIDOR_KM);
  return Math.min(COMMUTE_QUERY_CAP_KM, want);
}

/** Shortest distance from a point to the home-work segment, in kilometres. */
export function distanceToSegmentKm(a: LatLng, b: LatLng, point: LatLng): number {
  const originLat = (a.lat * Math.PI) / 180;
  const kmPerLng = 111.32 * Math.cos(originLat);
  const ax = 0;
  const ay = 0;
  const bx = (b.lng - a.lng) * kmPerLng;
  const by = (b.lat - a.lat) * 110.574;
  const px = (point.lng - a.lng) * kmPerLng;
  const py = (point.lat - a.lat) * 110.574;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function isAlongCommute(
  a: LatLng,
  b: LatLng,
  point: LatLng,
  corridorKm = COMMUTE_CORRIDOR_KM,
): boolean {
  if (![a.lat, a.lng, b.lat, b.lng, point.lat, point.lng, corridorKm].every(Number.isFinite)) return false;
  return distanceToSegmentKm(a, b, point) <= corridorKm;
}

function finiteKm(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
