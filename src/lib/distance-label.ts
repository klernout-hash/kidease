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
}): string {
  if (!input.show) return "";
  const km = input.km;
  if (typeof km !== "number" || !Number.isFinite(km) || km <= 0) return "";
  const shown = displayDistance(km, "km");
  if (shown === "0" || shown === "0.0") return "";
  return `${shown} ${input.away}`;
}
