import { WINNIPEG, type LatLng } from "./geo";

/** KidEase only lists Canadian centres. Origins outside this box fall back to Winnipeg. */
export function isInCanada(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat > 41 && lat < 84 && lng > -141 && lng < -52;
}

export function canadaOriginOrWinnipeg(origin?: (Partial<LatLng> & { label?: string }) | null) {
  if (
    origin &&
    typeof origin.lat === "number" &&
    typeof origin.lng === "number" &&
    isInCanada(origin.lat, origin.lng)
  ) {
    return {
      lat: origin.lat,
      lng: origin.lng,
      label: origin.label || WINNIPEG.label,
    };
  }
  return { lat: WINNIPEG.lat, lng: WINNIPEG.lng, label: WINNIPEG.label };
}
