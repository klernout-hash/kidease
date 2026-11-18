import { clampRadiusKm } from "./proximity.ts";

export const DEFAULT_SEARCH_RADIUS_KM = 25;

function radiusValue(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? clampRadiusKm(number) : undefined;
}

/** `km` is canonical; older radius/radiusKm links remain readable. */
export function searchRadiusFromParams(input: unknown): number {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const read = (key: string) => params instanceof URLSearchParams
    ? params.get(key)
    : params && typeof params === "object" ? (params as Record<string, unknown>)[key] : undefined;
  return radiusValue(read("km")) ?? radiusValue(read("radius")) ?? radiusValue(read("radiusKm")) ?? DEFAULT_SEARCH_RADIUS_KM;
}

/** Keep the longstanding 25 km default URL compact. */
export function compactSearchRadius(input: unknown): { km?: number } {
  const km = searchRadiusFromParams(input);
  return km === DEFAULT_SEARCH_RADIUS_KM ? {} : { km };
}

/** Radius changes preserve every other filter and restart pagination. */
export function withSearchRadius<T extends Record<string, unknown>>(previous: T, value: number) {
  const km = searchRadiusFromParams({ km: value });
  return {
    ...previous,
    km: km === DEFAULT_SEARCH_RADIUS_KM ? undefined : km,
    radius: undefined,
    radiusKm: undefined,
    page: undefined,
  };
}
