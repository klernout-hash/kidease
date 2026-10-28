/**
 * In-memory commute detour math. No map API on the hot path.
 * Minutes are a straight-line urban estimate, not a live route.
 */

export type CommuteMode = "drive" | "transit" | "walk" | "bike";

export type LatLng = { lat: number; lng: number };

const SPEEDS_KMH: Record<CommuteMode, number> = {
  drive: 40,
  transit: 22,
  bike: 15,
  walk: 5,
};

const EARTH_KM = 6371;

export function isCommuteMode(value: unknown): value is CommuteMode {
  return value === "drive" || value === "transit" || value === "walk" || value === "bike";
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function travelMinutes(a: LatLng, b: LatLng, mode: CommuteMode): number {
  const speed = SPEEDS_KMH[mode];
  if (!speed) return 0;
  return (haversineKm(a, b) / speed) * 60;
}

/** Extra minutes to stop at a centre versus going straight from home to work. */
export function calcDetourMinutes(home: LatLng, work: LatLng, stop: LatLng, mode: CommuteMode): number {
  const direct = travelMinutes(home, work, mode);
  const via = travelMinutes(home, stop, mode) + travelMinutes(stop, work, mode);
  return Math.max(0, Math.round(via - direct));
}

export type SiblingSplitInput = {
  home: LatLng;
  work: LatLng;
  stops: LatLng[];
  mode: CommuteMode;
  childCount: number;
};

/**
 * One stop when one centre fits every child.
 * Two or more stops add the extra leg between centres.
 */
export function calcSiblingSplitDetour(input: SiblingSplitInput): { minutes: number; split: boolean } {
  const stops = input.stops.filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
  const children = Math.max(0, Math.floor(input.childCount));
  if (!stops.length || children < 2) {
    const only = stops[0];
    return {
      minutes: only ? calcDetourMinutes(input.home, input.work, only, input.mode) : 0,
      split: false,
    };
  }
  const ordered = stops.slice(0, Math.min(stops.length, children));
  let via = travelMinutes(input.home, ordered[0]!, input.mode);
  for (let i = 1; i < ordered.length; i += 1) {
    via += travelMinutes(ordered[i - 1]!, ordered[i]!, input.mode);
  }
  via += travelMinutes(ordered[ordered.length - 1]!, input.work, input.mode);
  const direct = travelMinutes(input.home, input.work, input.mode);
  return { minutes: Math.max(0, Math.round(via - direct)), split: ordered.length > 1 };
}

export function detourPill(minutes: number, locale: "en" | "fr"): string {
  const n = Math.max(0, Math.round(minutes));
  if (locale === "fr") return `+${n} min sur votre trajet`;
  return `+${n} min on your commute`;
}
