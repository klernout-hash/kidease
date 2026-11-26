import { approximateDistanceKm } from "./home-address-privacy.ts";
import { displayDistanceFor } from "./units.ts";

/** Same value as UNMEASURED_DISTANCE_KM in card-distance (kept local so this stays out of a shared chunk). */
const UNMEASURED_DISTANCE_KM = 1_000_000;

/**
 * Distance text for a listing, or "" when we must not show one.
 * Callers pass show=false when there is no parent location.
 * A missing number, or one that rounds to 0, stays hidden so a different
 * address never reads "0 km".
 */
export function parentDistanceLabel(input: {
  km: number | null | undefined;
  away: string;
  show: boolean;
  /** Home daycare. Rounds to the nearest kilometre and uses `about`. */
  approximate?: boolean;
  about?: string;
  /** "fr" uses a decimal comma. */
  locale?: string | null;
}): string {
  if (!input.show) return "";
  const km = input.km;
  if (typeof km !== "number" || !Number.isFinite(km) || km <= 0) return "";
  // The sort sentinel for an unmeasured pin is never a real distance.
  if (km >= UNMEASURED_DISTANCE_KM) return "";
  const shown = displayDistanceFor(input.approximate ? approximateDistanceKm(km) : km, "km", input.locale);
  if (shown === "0" || shown === "0.0" || shown === "0,0") return "";
  if (input.approximate && input.about) return input.about.replace("{n}", shown);
  // "{n}" templates let French read "à 0,5 km" instead of "0,5 km away".
  if (input.away.includes("{n}")) return input.away.replace("{n}", shown);
  return `${shown} ${input.away}`;
}
