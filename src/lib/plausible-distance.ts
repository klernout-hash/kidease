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
  // 1.1 km in another city is the other city's downtown, not the parent.
  if (listing && origin && listing !== origin && km < 40) return false;
  return true;
}

/**
 * Whether a card may print "X km away".
 * The kilometres have to come from the parent's pin (GPS, a saved or typed
 * place, edge geo, or the Winnipeg fallback), and a centre in another city
 * never wears a short local distance.
 */
export function honestCardDistance(input: {
  km: number | null | undefined;
  listingCity?: string | null;
  originLabel?: string | null;
  originSource?: string | null;
  showDistance?: boolean;
  labelFar?: boolean;
}) {
  if (input.showDistance === false) return false;
  const km = input.km;
  if (typeof km !== "number" || !Number.isFinite(km) || km <= 0) return false;
  const source = input.originSource || "";
  const measured =
    source === "gps" ||
    source === "manual" ||
    source === "saved" ||
    source === "ip" ||
    (source === "default" && Boolean((input.originLabel || "").trim()));
  if (!measured && !input.labelFar) return false;
  if (!plausibleListingKm(km, input.listingCity, input.originLabel)) return false;
  if (input.labelFar) return true;
  const listing = normalizeCityKey(input.listingCity || "");
  const origin = normalizeCityKey((input.originLabel || "").split(",")[0] || "");
  const same = Boolean(listing && origin && listing === origin);
  if (!same && km > 80) return false;
  return true;
}
