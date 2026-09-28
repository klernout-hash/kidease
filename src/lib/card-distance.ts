import { CITIES, PROVINCES, haversineKm, type LatLng } from "./geo.ts";
import { displayDistance, type DistanceUnit } from "./units.ts";

/**
 * Pins this close to a catalogue city or province coordinate are the default
 * centre, not a measured door. Winnipeg Beach shares Winnipeg's centre and
 * was rendering as "0 km away".
 */
export const CENTROID_PIN_KM = 0.05;

/** Sort key when we must not pretend the centre pin is 0 km from itself. */
export const UNMEASURED_DISTANCE_KM = 1_000_000;

export function hasDistanceReference(
  origin: { lat?: number | null; lng?: number | null } | null | undefined,
  referenceKnown: boolean,
): origin is LatLng {
  if (!referenceKnown || !origin) return false;
  const lat = Number(origin.lat);
  const lng = Number(origin.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
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

function placeHead(value: string): string {
  return value.split(",")[0]?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

/**
 * The pin sits on a catalogue centre for a different place (Winnipeg Beach
 * stored on Winnipeg). It is not inside that centre's search radius.
 */
export function cityMislabeledOnCentroid(
  city: string | null | undefined,
  lat?: number | null,
  lng?: number | null,
): boolean {
  const hit = catalogueCentroidNear(lat, lng);
  if (!hit) return false;
  const listing = placeHead(String(city || "").replace(/&/g, "&"));
  const name = placeHead(hit.label);
  if (!listing || !name) return false;
  return listing !== name;
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

/** Kilometres from the search origin to a real door. Null when either pin is unusable. */
export function doorDistanceKm(
  origin: LatLng | null | undefined,
  point: { lat?: number | null; lng?: number | null } | null | undefined,
): number | null {
  if (!origin || !point || !isDoorPin(point.lat, point.lng)) return null;
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return null;
  if (origin.lat === 0 && origin.lng === 0) return null;
  return Math.round(haversineKm(origin, { lat: Number(point.lat), lng: Number(point.lng) }) * 10) / 10;
}

export function cardDistanceKm(
  origin: { lat?: number | null; lng?: number | null } | null | undefined,
  point: { lat?: number | null; lng?: number | null } | null | undefined,
  referenceKnown: boolean,
): number | null {
  if (!hasDistanceReference(origin, referenceKnown)) return null;
  return doorDistanceKm(origin, point);
}

/** "3.2 km away", or "" when there is no reference or no door pin. */
export function cardAwayLabel(input: {
  origin: { lat?: number | null; lng?: number | null } | null | undefined;
  lat?: number | null;
  lng?: number | null;
  referenceKnown: boolean;
  unit?: DistanceUnit;
  awayLabel: string;
}): string {
  const km = cardDistanceKm(input.origin, { lat: input.lat, lng: input.lng }, input.referenceKnown);
  if (km == null) return "";
  return `${displayDistance(km, input.unit ?? "km")} ${input.awayLabel}`;
}
