import { approximateDistanceKm } from "./home-address-privacy.ts";
import { displayDistance } from "./units.ts";

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
}): string {
  if (!input.show) return "";
  const km = input.km;
  if (typeof km !== "number" || !Number.isFinite(km) || km <= 0) return "";
  const shown = displayDistance(input.approximate ? approximateDistanceKm(km) : km, "km");
  if (shown === "0" || shown === "0.0") return "";
  if (input.approximate && input.about) return input.about.replace("{n}", shown);
  return `${shown} ${input.away}`;
}
