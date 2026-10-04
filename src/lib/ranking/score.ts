/**
 * Rules-based smart match, 0 to 100.
 * Weights: ./weights.ts. Paid fields are not read. Missing facts score 0.
 */

import { haversineKm, type LatLng } from "@/lib/geo";
import { confirmedFeeProgramBadge } from "@/lib/fee-program";
import {
  compareFreshOpenSpots,
  hasListedHours,
  listingCompleteness,
  vacancyFreshness,
  vacancyTimestamp,
} from "@/lib/listing-readiness";
import { opensEarly, staysLate } from "@/lib/licensing";
import { matchesAgeBand, type AgeBand } from "@/lib/saved-search";
import { isClaimVerified } from "@/lib/trust";
import type { Daycare } from "@/lib/types";
import {
  SMART_MATCH_WEIGHTS,
  WHY_PRIORITY,
  WHY_REASON_LIMIT,
  type SmartMatchWeightKey,
  type WhyCode,
} from "./weights.ts";

export type RankAge = "any" | AgeBand;

export type SmartMatchQuery = {
  home?: LatLng | null;
  work?: LatLng | null;
  radiusKm?: number;
  ageGroup?: RankAge | null;
  wantSubsidy?: boolean;
  /** full / part / flexible. Empty means the parent did not ask. */
  schedules?: Array<"full" | "part" | "flexible">;
  wantExtendedHours?: boolean;
};

export type SmartMatchListing = Pick<
  Daycare,
  | "id"
  | "lat"
  | "lng"
  | "ageMinMonths"
  | "ageMaxMonths"
  | "agesKnown"
  | "spotsInfant"
  | "spotsToddler"
  | "spotsPreschool"
  | "lastVacancyUpdatedAt"
  | "spotsUpdatedAt"
  | "availabilityKnown"
  | "hours"
  | "amenities"
  | "scheduleOptions"
  | "feeProgram"
  | "province"
  | "city"
  | "name"
  | "facilityType"
  | "financial"
  | "claimStatus"
  | "claimed"
  | "claimedAt"
  | "live"
  | "licenseNumber"
  | "photos"
  | "infantMonthly"
  | "toddlerMonthly"
  | "preschoolMonthly"
  | "partTimeMonthly"
>;

export type SmartMatchWhy = { code: WhyCode; days?: number; age?: RankAge };

export type SmartMatchResult = {
  total: number;
  why: SmartMatchWhy[];
};

const OPTIONAL_WEIGHTS: SmartMatchWeightKey[] = ["distanceWork", "ageFit", "subsidyFit", "hoursDaysFit"];

function clamp(n: number, max: number) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, n);
}

function radiusOf(query: SmartMatchQuery) {
  const n = Number(query.radiusKm);
  return Number.isFinite(n) && n > 0 ? n : 25;
}

function kmBetween(origin: LatLng | null | undefined, listing: SmartMatchListing): number | null {
  if (!origin) return null;
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return null;
  if (!Number.isFinite(listing.lat) || !Number.isFinite(listing.lng)) return null;
  return haversineKm(origin, { lat: listing.lat, lng: listing.lng });
}

/** 1 next to the pin, 0 at the far end of the search radius. */
export function commuteRatio(km: number | null, radiusKm: number) {
  if (km == null || !Number.isFinite(km) || km < 0) return 0;
  const half = Math.max(2, radiusKm * 0.6);
  return clamp(Math.exp((-Math.LN2 * km) / half), 1);
}

function ageAsked(query: SmartMatchQuery): RankAge | null {
  const age = query.ageGroup;
  if (!age || age === "any") return null;
  return age;
}

function spotsForAge(listing: SmartMatchListing, age: RankAge | null) {
  if (age === "infant") return Math.max(0, listing.spotsInfant ?? 0);
  if (age === "toddler") return Math.max(0, listing.spotsToddler ?? 0);
  if (age === "preschool" || age === "school-age") return Math.max(0, listing.spotsPreschool ?? 0);
  return Math.max(0, (listing.spotsInfant ?? 0) + (listing.spotsToddler ?? 0) + (listing.spotsPreschool ?? 0));
}

function ageFits(listing: SmartMatchListing, age: RankAge) {
  if (age === "any") return Boolean(listing.agesKnown);
  return matchesAgeBand(age, listing);
}

function subsidyFits(listing: SmartMatchListing) {
  return confirmedFeeProgramBadge(listing) != null;
}

function hoursDaysRatio(listing: SmartMatchListing, query: SmartMatchQuery) {
  const asked: boolean[] = [];
  const schedules = query.schedules ?? [];
  if (schedules.length) {
    const have = new Set(listing.scheduleOptions ?? []);
    asked.push(schedules.every((item) => have.has(item)));
  }
  if (query.wantExtendedHours) {
    const hours = listing.hours || "";
    asked.push(Boolean(hours && (staysLate(hours, listing.amenities || "") || opensEarly(hours))));
  }
  if (!asked.length) return 0;
  return asked.filter(Boolean).length / asked.length;
}

function openingDays(listing: SmartMatchListing, now: number): number | null {
  const at = vacancyTimestamp(listing);
  if (!at) return null;
  const ts = Date.parse(at);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((now - ts) / 86_400_000));
}

function openingsRatio(listing: SmartMatchListing, age: RankAge | null, now: number) {
  const freshness = vacancyFreshness(vacancyTimestamp(listing), now);
  if (freshness.kind !== "fresh") return 0;
  if (spotsForAge(listing, age) <= 0) return 0;
  const days = openingDays(listing, now);
  if (days == null) return 0;
  if (days <= 3) return 1;
  if (days <= 7) return 0.75;
  return 0.5;
}

function trustRatio(listing: SmartMatchListing, freshSpots: boolean, complete: boolean) {
  let ratio = 0;
  if (isClaimVerified(listing)) ratio += 0.5;
  if (freshSpots) ratio += 0.25;
  if (complete) ratio += 0.25;
  return clamp(ratio, 1);
}

function scaledWeights(query: SmartMatchQuery): Record<SmartMatchWeightKey, number> {
  const next = { ...SMART_MATCH_WEIGHTS } as Record<SmartMatchWeightKey, number>;
  if (!query.work) next.distanceWork = 0;
  if (!ageAsked(query)) next.ageFit = 0;
  if (!query.wantSubsidy) next.subsidyFit = 0;
  if (!(query.schedules ?? []).length && !query.wantExtendedHours) next.hoursDaysFit = 0;
  const active = (Object.keys(next) as SmartMatchWeightKey[]).filter((key) => next[key] > 0);
  const base = active.reduce((sum, key) => sum + next[key], 0);
  if (base <= 0) return next;
  const factor = 100 / base;
  for (const key of active) next[key] = next[key] * factor;
  for (const key of OPTIONAL_WEIGHTS) {
    if (!active.includes(key)) next[key] = 0;
  }
  return next;
}

export function smartMatchScore(
  listing: SmartMatchListing,
  query: SmartMatchQuery = {},
  now = Date.now(),
): SmartMatchResult {
  const weights = scaledWeights(query);
  const radius = radiusOf(query);
  const age = ageAsked(query);
  const homeKm = kmBetween(query.home, listing);
  const workKm = kmBetween(query.work, listing);
  const homeRatio = query.home ? commuteRatio(homeKm, radius) : 0;
  const workRatio = query.work ? commuteRatio(workKm, radius) : 0;
  const ageRatio = age ? (ageFits(listing, age) ? 1 : 0) : 0;
  const openRatio = openingsRatio(listing, age, now);
  const subsidyRatio = query.wantSubsidy && subsidyFits(listing) ? 1 : 0;
  const hoursRatio =
    (query.schedules ?? []).length || query.wantExtendedHours ? hoursDaysRatio(listing, query) : 0;
  const complete = listingCompleteness(listing);
  const completeRatio = complete.score / 5;
  const freshSpots = openRatio > 0;
  const trust = trustRatio(listing, freshSpots, complete.ready);

  const parts: Record<WhyCode, number> = {
    close_home: homeRatio * weights.distanceHome,
    close_work: workRatio * weights.distanceWork,
    age_fit: ageRatio * weights.ageFit,
    spots_fresh: openRatio * weights.openingsFreshness,
    subsidy: subsidyRatio * weights.subsidyFit,
    hours_days: hoursRatio * weights.hoursDaysFit,
    complete: complete.ready ? weights.completeness : 0,
    claim_verified: isClaimVerified(listing) ? weights.trust * 0.5 : 0,
  };
  // Completeness partial credit still counts toward the total, even below "complete".
  const completenessPoints = completeRatio * weights.completeness;
  const trustPoints = trust * weights.trust;
  const total = clamp(
    Math.round(
      parts.close_home +
        parts.close_work +
        parts.age_fit +
        parts.spots_fresh +
        parts.subsidy +
        parts.hours_days +
        completenessPoints +
        trustPoints,
    ),
    100,
  );

  const closeEnough = (km: number | null) => km != null && km <= Math.min(8, radius);
  const why: SmartMatchWhy[] = [];
  for (const code of WHY_PRIORITY) {
    if (why.length >= WHY_REASON_LIMIT) break;
    if (code === "close_home" && homeRatio >= 0.45 && closeEnough(homeKm)) {
      why.push({ code });
      continue;
    }
    if (code === "close_work" && workRatio >= 0.45 && closeEnough(workKm)) {
      why.push({ code });
      continue;
    }
    if (code === "spots_fresh" && freshSpots) {
      const days = openingDays(listing, now);
      why.push({ code, days: days ?? undefined, age: age ?? "any" });
      continue;
    }
    if (code === "age_fit" && age && ageRatio > 0) {
      why.push({ code, age });
      continue;
    }
    if (code === "subsidy" && subsidyRatio > 0) {
      why.push({ code });
      continue;
    }
    if (code === "hours_days" && hoursRatio > 0 && hasListedHours(listing.hours)) {
      why.push({ code });
      continue;
    }
    if (code === "claim_verified" && parts.claim_verified > 0) {
      why.push({ code });
      continue;
    }
    if (code === "complete" && complete.ready) {
      why.push({ code });
    }
  }

  return { total, why };
}

export function compareSmartMatch(
  a: SmartMatchListing,
  b: SmartMatchListing,
  query: SmartMatchQuery = {},
  now = Date.now(),
) {
  const delta = smartMatchScore(b, query, now).total - smartMatchScore(a, query, now).total;
  if (delta !== 0) return delta;
  const fresh = compareFreshOpenSpots(a, b, now);
  if (fresh !== 0) return fresh;
  const aKm = kmBetween(query.home, a);
  const bKm = kmBetween(query.home, b);
  return (aKm ?? 9e6) - (bKm ?? 9e6);
}

/** Flag off, or a throw inside the scorer: order by home distance. Never throws. */
export function compareSmartMatchOrNearest(
  a: SmartMatchListing,
  b: SmartMatchListing,
  query: SmartMatchQuery = {},
  now = Date.now(),
) {
  try {
    return compareSmartMatch(a, b, query, now);
  } catch {
    const aKm = kmBetween(query.home, a);
    const bKm = kmBetween(query.home, b);
    return (aKm ?? 9e6) - (bKm ?? 9e6);
  }
}

export function whyForListing(
  listing: SmartMatchListing,
  query: SmartMatchQuery,
  now = Date.now(),
): SmartMatchWhy[] {
  try {
    return smartMatchScore(listing, query, now).why;
  } catch {
    return [];
  }
}
