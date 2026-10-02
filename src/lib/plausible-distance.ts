import { normalizeCityKey } from "./city-hubs.ts";

/**
 * A distance we can show a parent.
 * 0 km is hidden. So is a pin that sits far from the city named on the listing.
 */
export function plausibleListingKm(
  km: number | null | undefined,
  listingCity?: string | null,
  originLabel?: string | null,
) {
  if (typeof km !== "number" || !Number.isFinite(km) || km <= 0) return false;
  if (Math.round(km * 10) / 10 <= 0) return false;
  const listing = normalizeCityKey(listingCity || "");
  const origin = normalizeCityKey((originLabel || "").split(",")[0] || "");
  if (listing && origin && listing === origin && km > 80) return false;
  return true;
}
