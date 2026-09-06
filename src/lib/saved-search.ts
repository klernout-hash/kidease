/**
 * Saved-search params and alert filter matching.
 * Origin lat/lng must come from a real search origin — never invent coordinates.
 */

import { cwelccKind, hasAmenity, opensEarly, staysLate } from "@/lib/licensing";
import { vacancyFreshness, vacancyTimestamp } from "@/lib/listing-readiness";
import { clampRadiusKm } from "@/lib/proximity";
import { isClaimVerified } from "@/lib/trust";
import type { AgeGroup } from "@/lib/types";

export const SAVED_SEARCH_APPLY_KEY = "kidease-apply-saved-search";
export const MAX_SAVED_SEARCHES = 12;
export const MAX_SEARCH_NAME = 80;

export const AGE_BANDS = ["any", "infant", "toddler", "preschool"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const AVAIL_FILTERS = ["any", "open", "waitlist", "unknown"] as const;
export type AvailFilter = (typeof AVAIL_FILTERS)[number];

export const ALERT_KINDS = ["new_centre", "vacancy_reconfirmed"] as const;
export type SearchAlertKind = (typeof ALERT_KINDS)[number];

/** Listing-side filters from search (includes PR #59 honesty chips when present). */
export type SavedSearchFilters = {
  avail: AvailFilter;
  liveOnly: boolean;
  ten: boolean;
  meals: boolean;
  outdoor: boolean;
  inclusive: boolean;
  extended: boolean;
  infantOnly: boolean;
  catchmentOnly: boolean;
  confirmedOnly: boolean;
  readyOnly: boolean;
  claimVerifiedOnly: boolean;
};

export const EMPTY_SEARCH_FILTERS: SavedSearchFilters = {
  avail: "any",
  liveOnly: false,
  ten: false,
  meals: false,
  outdoor: false,
  inclusive: false,
  extended: false,
  infantOnly: false,
  catchmentOnly: false,
  confirmedOnly: false,
  readyOnly: false,
  claimVerifiedOnly: false,
};

export type SavedSearch = {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  centerLabel: string;
  radiusKm: number;
  ageBand: AgeBand;
  filters: SavedSearchFilters;
  alertsEnabled: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SearchAlertPrefs = {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  updatedAt: string | null;
};

export type SearchAlertNotice = {
  id: string;
  savedSearchId: string | null;
  daycareId: string | null;
  kind: SearchAlertKind;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export type SearchAlertCandidate = {
  daycareId: string;
  slug: string;
  name: string;
  city: string;
  kind: SearchAlertKind;
  distanceKm: number;
  lastVacancyUpdatedAt: string | null;
  createdAt: string | null;
};

/** Reject missing / non-finite / out-of-range coordinates. Never substitute a city default. */
export function isValidSearchOrigin(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export function isAgeBand(raw: unknown): raw is AgeBand {
  return AGE_BANDS.includes(raw as AgeBand);
}

export function isAvailFilter(raw: unknown): raw is AvailFilter {
  return AVAIL_FILTERS.includes(raw as AvailFilter);
}

function flag(value: unknown) {
  return value === true || value === 1 || value === "1";
}

export function parseSavedSearchFilters(raw: unknown): SavedSearchFilters {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    avail: isAvailFilter(src.avail) ? src.avail : "any",
    liveOnly: flag(src.liveOnly),
    ten: flag(src.ten),
    meals: flag(src.meals),
    outdoor: flag(src.outdoor),
    inclusive: flag(src.inclusive),
    extended: flag(src.extended),
    infantOnly: flag(src.infantOnly),
    catchmentOnly: flag(src.catchmentOnly),
    confirmedOnly: flag(src.confirmedOnly),
    readyOnly: flag(src.readyOnly),
    claimVerifiedOnly: flag(src.claimVerifiedOnly),
  };
}

export function cleanSearchName(raw: unknown) {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_NAME);
}

export function defaultSearchName(label: string, radiusKm: number, ageBand: AgeBand) {
  const place = (label || "").split(",")[0]?.trim() || "Saved search";
  const age = ageBand === "any" ? "" : ` · ${ageBand}`;
  return cleanSearchName(`${place} · ${clampRadiusKm(radiusKm)} km${age}`) || "Saved search";
}

export function matchesAgeBand(
  ageBand: AgeBand,
  row: { agesKnown?: boolean; ageMinMonths: number; ageMaxMonths: number },
) {
  if (ageBand === "any") return true;
  if (row.agesKnown === false) return false;
  if (ageBand === "infant") return row.ageMinMonths <= 18;
  if (ageBand === "toddler") return row.ageMinMonths < 36 && row.ageMaxMonths >= 18;
  return row.ageMaxMonths >= 30 && row.ageMinMonths < 72;
}

export type FilterableListing = {
  live?: boolean;
  availabilityKnown?: boolean;
  spotsTotal?: number;
  spotsInfant?: number;
  spotsToddler?: number;
  spotsPreschool?: number;
  amenities?: string;
  hours?: string;
  agesKnown?: boolean;
  ageMinMonths: number;
  ageMaxMonths: number;
  inCatchment?: boolean;
  lastVacancyUpdatedAt?: string | null;
  spotsUpdatedAt?: string | null;
  detailsReady?: boolean;
  claimStatus?: string | null;
  claimed?: boolean;
  claimedAt?: string | null;
  province?: string;
};

function spotsTotalOf(row: FilterableListing) {
  if (typeof row.spotsTotal === "number") return row.spotsTotal;
  return (row.spotsInfant ?? 0) + (row.spotsToddler ?? 0) + (row.spotsPreschool ?? 0);
}

/** Same chip rules as /search, including PR #59 honesty filters. */
export function listingMatchesSavedFilters(row: FilterableListing, filters: SavedSearchFilters) {
  if (filters.liveOnly && !row.live) return false;
  const spots = spotsTotalOf(row);
  const amenities = row.amenities || "";
  const hours = row.hours || "";
  const known = row.availabilityKnown === true || Boolean(vacancyTimestamp(row));
  if (filters.avail === "open" && !(known && spots > 0)) return false;
  if (filters.avail === "waitlist" && !(known && spots <= 0)) return false;
  if (filters.avail === "unknown" && known) return false;
  if (filters.ten && cwelccKind(row.province || "") === "ask" && !hasAmenity(amenities, "ten-a-day") && !hasAmenity(amenities, "funded")) {
    return false;
  }
  if (filters.meals && !hasAmenity(amenities, "meals")) return false;
  if (filters.outdoor && !hasAmenity(amenities, "outdoor") && !hasAmenity(amenities, "yard")) return false;
  if (filters.inclusive && !hasAmenity(amenities, "inclusive")) return false;
  if (filters.extended && !staysLate(hours, amenities) && !opensEarly(hours)) return false;
  if (filters.infantOnly && !(row.agesKnown !== false && row.ageMinMonths <= 18)) return false;
  if (filters.catchmentOnly && !row.inCatchment) return false;
  if (filters.confirmedOnly && vacancyFreshness(vacancyTimestamp(row)).kind !== "fresh") return false;
  if (filters.readyOnly && row.detailsReady !== true) return false;
  if (filters.claimVerifiedOnly && !isClaimVerified(row)) return false;
  return true;
}

export function listingMatchesSavedSearch(
  row: FilterableListing,
  search: { ageBand: AgeBand; filters: SavedSearchFilters },
) {
  return matchesAgeBand(search.ageBand, row) && listingMatchesSavedFilters(row, search.filters);
}

export function activeFilterCount(filters: SavedSearchFilters, ageBand: AgeBand) {
  let n = ageBand !== "any" ? 1 : 0;
  if (filters.avail !== "any") n += 1;
  if (filters.liveOnly) n += 1;
  if (filters.ten) n += 1;
  if (filters.meals) n += 1;
  if (filters.outdoor) n += 1;
  if (filters.inclusive) n += 1;
  if (filters.extended) n += 1;
  if (filters.infantOnly) n += 1;
  if (filters.catchmentOnly) n += 1;
  if (filters.confirmedOnly) n += 1;
  if (filters.readyOnly) n += 1;
  if (filters.claimVerifiedOnly) n += 1;
  return n;
}

export function stashSavedSearchToApply(search: SavedSearch) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SAVED_SEARCH_APPLY_KEY, JSON.stringify(search));
  } catch {
    /* ignore */
  }
}

export function takeSavedSearchToApply(): SavedSearch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SAVED_SEARCH_APPLY_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(SAVED_SEARCH_APPLY_KEY);
    const parsed = JSON.parse(raw) as SavedSearch;
    if (!isValidSearchOrigin(parsed.centerLat, parsed.centerLng)) return null;
    return {
      ...parsed,
      filters: parseSavedSearchFilters(parsed.filters),
      ageBand: isAgeBand(parsed.ageBand) ? parsed.ageBand : "any",
      radiusKm: clampRadiusKm(parsed.radiusKm),
    };
  } catch {
    return null;
  }
}
