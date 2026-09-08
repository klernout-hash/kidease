/**
 * Waitlist pulse helpers (pure).
 *
 * A centre marks a spot open → one pulse row (the spot event) → fan-out to
 * parents who opted in on that listing and/or whose saved search matches
 * location + age. FEATURE_PUSH is never invoked from this path.
 *
 * No server imports — scripts/waitlist-pulse.test.mjs loads this in Node.
 */

import { clampRadiusKm, distanceKm } from "@/lib/proximity";
import {
  isValidSearchOrigin,
  listingMatchesSavedSearch,
  type AgeBand,
  type FilterableListing,
  type SavedSearchFilters,
} from "@/lib/saved-search";

export const WAITLIST_PULSE_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export const WAITLIST_PULSE_CHANNELS = ["in_app", "sms"] as const;
export type WaitlistPulseChannel = (typeof WAITLIST_PULSE_CHANNELS)[number];

export const WAITLIST_MATCH_SOURCES = ["listing_opt_in", "saved_search", "waitlist_booking"] as const;
export type WaitlistMatchSource = (typeof WAITLIST_MATCH_SOURCES)[number];

export const WAITLIST_PULSE_SOURCES = ["director", "capacity"] as const;
export type WaitlistPulseSource = (typeof WAITLIST_PULSE_SOURCES)[number];

export type WaitlistSpotCounts = {
  infant: number;
  toddler: number;
  preschool: number;
};

export type WaitlistInterest = {
  daycareId: string;
  ageBand: AgeBand;
  notifyInApp: boolean;
  notifySms: boolean;
  updatedAt: string | null;
};

export type WaitlistPulseStatus = {
  lastPulsedAt: string | null;
  cooldownUntil: string | null;
  canPulse: boolean;
  interestCount: number;
};

/** Age bands that have a posted open count. Empty = director pulsed without counts. */
export function ageBandsWithSpots(spots: WaitlistSpotCounts): AgeBand[] {
  const bands: AgeBand[] = [];
  if (spots.infant > 0) bands.push("infant");
  if (spots.toddler > 0) bands.push("toddler");
  if (spots.preschool > 0) bands.push("preschool");
  return bands;
}

/**
 * When the pulse lists open age bands, only those ages (or "any") match.
 * When every count is 0, the director still said a spot opened — notify all.
 */
export function interestMatchesPulseAge(interestAge: AgeBand, openBands: AgeBand[]): boolean {
  if (openBands.length === 0) return true;
  if (interestAge === "any") return true;
  return openBands.includes(interestAge);
}

export function pulseRateLimited(
  lastPulsedAt: string | Date | null | undefined,
  nowMs = Date.now(),
  cooldownMs = WAITLIST_PULSE_COOLDOWN_MS,
): boolean {
  if (!lastPulsedAt) return false;
  const ts = lastPulsedAt instanceof Date ? lastPulsedAt.getTime() : Date.parse(String(lastPulsedAt));
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts < cooldownMs;
}

export function cooldownUntilIso(
  lastPulsedAt: string | Date | null | undefined,
  nowMs = Date.now(),
  cooldownMs = WAITLIST_PULSE_COOLDOWN_MS,
): string | null {
  if (!lastPulsedAt) return null;
  const ts = lastPulsedAt instanceof Date ? lastPulsedAt.getTime() : Date.parse(String(lastPulsedAt));
  if (!Number.isFinite(ts)) return null;
  const until = ts + cooldownMs;
  if (until <= nowMs) return null;
  return new Date(until).toISOString();
}

/** Pulse matching ignores avail + confirmedOnly — the pulse *is* the vacancy event. */
export function pulseMatchFilters(filters: SavedSearchFilters): SavedSearchFilters {
  return { ...filters, avail: "any", confirmedOnly: false };
}

export type PulseListing = FilterableListing & { lat: number; lng: number };

export function savedSearchMatchesPulse(
  listing: PulseListing,
  search: {
    centerLat: number;
    centerLng: number;
    radiusKm: number;
    ageBand: AgeBand;
    filters: SavedSearchFilters;
  },
  spots: WaitlistSpotCounts,
): boolean {
  if (!isValidSearchOrigin(search.centerLat, search.centerLng)) return false;
  if (!isValidSearchOrigin(listing.lat, listing.lng)) return false;
  const radius = clampRadiusKm(search.radiusKm);
  const km = distanceKm(
    { lat: search.centerLat, lng: search.centerLng },
    { lat: listing.lat, lng: listing.lng },
  );
  if (km > radius) return false;
  if (!interestMatchesPulseAge(search.ageBand, ageBandsWithSpots(spots))) return false;
  return listingMatchesSavedSearch(listing, {
    ageBand: search.ageBand,
    filters: pulseMatchFilters(search.filters),
  });
}

export function spotsLabel(spots: WaitlistSpotCounts): string {
  const parts: string[] = [];
  if (spots.infant > 0) parts.push(`${spots.infant} infant`);
  if (spots.toddler > 0) parts.push(`${spots.toddler} toddler`);
  if (spots.preschool > 0) parts.push(`${spots.preschool} preschool`);
  if (!parts.length) return "an open spot";
  return parts.join(", ");
}

/** Transactional SMS. Include STOP. Do not market. */
export function waitlistPulseSmsBody(centreName: string, listingUrl: string, spots: WaitlistSpotCounts): string {
  const name = centreName.replace(/\s+/g, " ").trim().slice(0, 80) || "a centre";
  const url = listingUrl.trim().slice(0, 120);
  const spotsText = spotsLabel(spots);
  return `KidEase: ${name} posted ${spotsText}. ${url} Reply STOP to opt out.`;
}

export function waitlistPulseNoticeCopy(centreName: string, city: string, matchSource: WaitlistMatchSource) {
  const name = centreName.replace(/\s+/g, " ").trim().slice(0, 80) || "A centre";
  const place = city.replace(/\s+/g, " ").trim().slice(0, 60);
  const why =
    matchSource === "saved_search"
      ? "Matches a saved search you turned on."
      : matchSource === "waitlist_booking"
        ? "You asked this centre for a spot."
        : "You opted in on this listing.";
  return {
    title: `${name} has an open spot`,
    body: place ? `${place} · ${why}` : why,
  };
}
