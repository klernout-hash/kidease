import { CITIES, PROVINCES, haversineKm, type LatLng } from "./geo.ts";

/**
 * A pin this close to a catalogue city or province coordinate is the city-list
 * stand-in, not a measured door. Winnipeg Beach shares Winnipeg's centre and
 * was showing up as "0 km away".
 */
export const CENTROID_PIN_KM = 0.05;

/** Sort key when a pin must not lead the rail as 0 km from itself. */
export const UNMEASURED_DISTANCE_KM = 1_000_000;

function foldPlace(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function placeParts(label: string): string[] {
  return label
    .split(",")
    .map((part) => foldPlace(part))
    .filter(Boolean);
}

export function catalogueCentroidNear(
  lat?: number | null,
  lng?: number | null,
  withinKm = CENTROID_PIN_KM,
): { label: string; km: number } | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la === 0 && ln === 0) return null;
  const here = { lat: la, lng: ln };
  let best: { label: string; km: number } | null = null;
  for (const point of [...CITIES, ...PROVINCES]) {
    const km = haversineKm(here, point);
    if (km <= withinKm && (!best || km < best.km)) best = { label: point.label, km };
  }
  return best;
}

/** A stored pin we can measure. The city-list centre is not a door. */
export function isDoorPin(lat?: number | null, lng?: number | null): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la === 0 && ln === 0) return false;
  return catalogueCentroidNear(la, ln) == null;
}

/**
 * The pin sits on a catalogue centre for a different place (Winnipeg Beach
 * stored on Winnipeg). A Winnipeg listing on a Winnipeg neighbourhood centre
 * still belongs to Winnipeg.
 */
export function cityMislabeledOnCentroid(
  city: string | null | undefined,
  lat?: number | null,
  lng?: number | null,
): boolean {
  const hit = catalogueCentroidNear(lat, lng);
  if (!hit) return false;
  const listing = foldPlace(String(city || "").split(",")[0] || "");
  const parts = placeParts(hit.label);
  if (!listing || parts.length === 0) return false;
  return !parts.some((part) => part === listing);
}

/**
 * Keep a card in the active radius. A door past the radius is out.
 * A city-centre pin labelled as another place (Winnipeg Beach) is out.
 * A same-city centre pin stays, but it is not measured as 0 km.
 */
export function includeCardInRadius(
  card: { city?: string | null; lat?: number | null; lng?: number | null },
  origin: LatLng,
  radiusKm: number,
): boolean {
  if (cityMislabeledOnCentroid(card.city, card.lat, card.lng)) return false;
  const door = doorDistanceKm(origin, card);
  if (door == null) return true;
  const radius = Number(radiusKm);
  if (!Number.isFinite(radius)) return true;
  return door <= radius;
}

/** Kilometres from the search origin to a real door. Null when the pin is not a door. */
export function doorDistanceKm(
  origin: LatLng | null | undefined,
  point: { lat?: number | null; lng?: number | null } | null | undefined,
): number | null {
  if (!origin || !point || !isDoorPin(point.lat, point.lng)) return null;
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return null;
  if (origin.lat === 0 && origin.lng === 0) return null;
  return Math.round(haversineKm(origin, { lat: Number(point.lat), lng: Number(point.lng) }) * 10) / 10;
}

/** Distance used for ordering. Stand-in pins sort after measured doors. */
export function cardSortKm(
  origin: LatLng | null | undefined,
  point: { lat?: number | null; lng?: number | null } | null | undefined,
): number {
  const door = doorDistanceKm(origin, point);
  return door == null ? UNMEASURED_DISTANCE_KM : door;
}
