import type { LatLng } from "./geo.ts";

/** Same default as the search store when the parent has not chosen a radius. */
export const DEFAULT_SEARCH_RADIUS_KM = 25;

const MIN_SEARCH_RADIUS_KM = 1;
const MAX_SEARCH_RADIUS_KM = 50;

export type RadiusFrame = {
  radiusKm: number;
  meters: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

/**
 * A missing radius is the app default. A chosen radius stays inside the
 * search cap (1–50 km), matching clampRadiusKm.
 */
export function searchRadiusKm(radiusKm: number | null | undefined): number {
  if (radiusKm == null) return DEFAULT_SEARCH_RADIUS_KM;
  const n = Number(radiusKm);
  if (!Number.isFinite(n)) return DEFAULT_SEARCH_RADIUS_KM;
  return Math.min(MAX_SEARCH_RADIUS_KM, Math.max(MIN_SEARCH_RADIUS_KM, Math.round(n)));
}

/** Bounding box of the search circle. The map fits this, not the pin spread. */
export function radiusCircleFrame(origin: LatLng, radiusKm: number | null | undefined): RadiusFrame {
  const radius = searchRadiusKm(radiusKm);
  const latDelta = radius / 110.574;
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  const lngDelta = radius / (111.32 * Math.max(0.2, Math.abs(cos)));
  return {
    radiusKm: radius,
    meters: radius * 1000,
    minLat: origin.lat - latDelta,
    maxLat: origin.lat + latDelta,
    minLng: origin.lng - lngDelta,
    maxLng: origin.lng + lngDelta,
  };
}

export function radiusFrameKey(origin: LatLng, radiusKm: number | null | undefined, second?: LatLng | null): string {
  const frame = radiusCircleFrame(origin, radiusKm);
  const home = `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`;
  const extra = second && Number.isFinite(second.lat) && Number.isFinite(second.lng)
    ? `:${second.lat.toFixed(5)},${second.lng.toFixed(5)}`
    : "";
  return `${home}:${frame.radiusKm}${extra}`;
}

/** A pan or pinch does not change this key. A new city or radius does. */
export function shouldRefitSearchCamera(previousKey: string, nextKey: string): boolean {
  return previousKey !== nextKey;
}

export function boundsCoverRadiusFrame(
  visible: Pick<RadiusFrame, "minLat" | "maxLat" | "minLng" | "maxLng">,
  frame: Pick<RadiusFrame, "minLat" | "maxLat" | "minLng" | "maxLng">,
): boolean {
  return (
    visible.minLat <= frame.minLat &&
    visible.maxLat >= frame.maxLat &&
    visible.minLng <= frame.minLng &&
    visible.maxLng >= frame.maxLng
  );
}

/** Light stroke, faint fill, and no clicks. The edge of the search, not a control. */
export const RADIUS_CIRCLE_STYLE = {
  strokeColor: "#1a3790",
  strokeOpacity: 0.28,
  strokeWeight: 1.5,
  fillColor: "#1a3790",
  fillOpacity: 0.03,
  clickable: false as const,
  zIndex: 1,
};

export const RADIUS_CIRCLE_ALT_STYLE = {
  strokeColor: "#b45309",
  strokeOpacity: 0.28,
  strokeWeight: 1.5,
  fillColor: "#b45309",
  fillOpacity: 0.03,
  clickable: false as const,
  zIndex: 1,
};
