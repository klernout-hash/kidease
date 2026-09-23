export type DistanceUnit = "km" | "mi";

export const KM_PER_MI = 1.609344;
export const DISTANCE_UNIT_KEY = "kidease-distance-unit";
export const MAX_RADIUS_MI = 31;

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

/**
 * KidEase.ca shows kilometres on EN and FR, including en-US browsers.
 * `language` stays in the signature so callers can pass navigator.language.
 */
export function defaultDistanceUnit(_language = typeof navigator === "undefined" ? "en-CA" : navigator.language): DistanceUnit {
  return "km";
}

export function readDistanceUnit(): DistanceUnit {
  if (typeof window === "undefined") return "km";
  try {
    const saved = window.localStorage.getItem(DISTANCE_UNIT_KEY);
    if (saved === "mi") {
      writeDistanceUnit("km");
      return "km";
    }
    if (saved === "km") return "km";
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
