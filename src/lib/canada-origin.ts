import type { LatLng } from "./geo.ts";

/**
 * Map camera for a Canada-wide view. Not a city, and not a search query.
 * KidEase covers every province and territory. Never fall back to one city.
 */
export const CANADA_CAMERA: LatLng & { label: string } = {
  lat: 56.1304,
  lng: -106.3468,
  label: "",
};

/** KidEase only lists Canadian centres. */
export function isInCanada(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat > 41 && lat < 84 && lng > -141 && lng < -52;
}

/**
 * Keep a fix that is inside Canada. Anything else is the neutral Canada view,
 * with an empty label so /search does not invent a city query.
 */
export function canadaOriginOrNeutral(origin?: (Partial<LatLng> & { label?: string }) | null) {
  if (
    origin &&
    typeof origin.lat === "number" &&
    typeof origin.lng === "number" &&
    isInCanada(origin.lat, origin.lng)
  ) {
    return {
      lat: origin.lat,
      lng: origin.lng,
      label: (origin.label || "").trim(),
    };
  }
  return { lat: CANADA_CAMERA.lat, lng: CANADA_CAMERA.lng, label: "" };
}
