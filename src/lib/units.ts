export type DistanceUnit = "km" | "mi";

export const KM_PER_MI = 1.609344;
export const DISTANCE_UNIT_KEY = "kidease-distance-unit";
export const MAX_RADIUS_MI = 62;

export function kmToMi(km: number) {
  return Math.round((km / KM_PER_MI) * 10) / 10;
}

export function miToKm(mi: number) {
  return Math.round(mi * KM_PER_MI * 10) / 10;
}

export function displayDistance(km: number, unit: DistanceUnit) {
  const n = unit === "mi" ? kmToMi(km) : Math.round(km * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Canada and the rest of North America default to km; en-US defaults to miles. */
export function defaultDistanceUnit(language = typeof navigator === "undefined" ? "en-CA" : navigator.language): DistanceUnit {
  return language.toLowerCase() === "en-us" ? "mi" : "km";
}

export function readDistanceUnit(): DistanceUnit {
  if (typeof window === "undefined") return "km";
  try {
    const saved = window.localStorage.getItem(DISTANCE_UNIT_KEY);
    if (saved === "km" || saved === "mi") return saved;
  } catch {
    /* ignore */
  }
  return defaultDistanceUnit();
}

export function writeDistanceUnit(unit: DistanceUnit) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISTANCE_UNIT_KEY, unit);
  } catch {
    /* ignore */
  }
}
