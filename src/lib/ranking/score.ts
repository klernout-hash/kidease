/**
 * Rules-based smart match, 0 to 100. No ML.
 * Paid pins never enter. Missing facts score 0. Unverified listings are not removed.
 */

import { confirmedFeeProgramBadge } from "@/lib/fee-program";
import { listingCompleteness, vacancyFreshness, vacancyTimestamp } from "@/lib/listing-readiness";
import { distanceDecay } from "@/lib/proximity";
import { matchesAgeBand, type AgeBand } from "@/lib/saved-search";
import { spotsForAgeGroup } from "@/lib/parent-match";
import { isClaimVerified } from "@/lib/trust";
import type { Daycare } from "@/lib/types";
import { SMART_MATCH_WEIGHTS, type MatchReasonCode } from "./weights.ts";

export type MatchAnchor = "home" | "work" | "both";

export type SmartMatchQuery = {
  ageGroup?: string | null;
  radiusKm?: number;
  distanceKnown?: boolean;
  anchor?: MatchAnchor;
  workDistanceKm?: number;
  /** Parent turned on the fee / $10-a-day style filter. */
  wantSubsidy?: boolean;
  /** Parent picked full, part, or flexible. Empty means they did not ask. */
  schedules?: readonly string[] | null;
};

export type SmartMatchListing = Pick<
  Daycare,
  | "id"
  | "name"
  | "city"
  | "province"
  | "amenities"
  | "agesKnown"
  | "ageMinMonths"
  | "ageMaxMonths"
  | "hours"
  | "licenseNumber"
  | "photos"
  | "infantMonthly"
  | "toddlerMonthly"
  | "preschoolMonthly"
  | "partTimeMonthly"
  | "feeConfirmed"
  | "feeProgram"
  | "facilityType"
  | "spotsInfant"
  | "spotsToddler"
  | "spotsPreschool"
  | "lastVacancyUpdatedAt"
  | "spotsUpdatedAt"
  | "claimStatus"
  | "claimed"
  | "claimedAt"
  | "scheduleOptions"
> & {
  distanceKm?: number;
  spotsTotal?: number;
  /** Ignored on purpose. Present so a test can prove paid pins do not move the score. */
  priority?: boolean;
  featuredCity?: boolean;
};

export type SmartMatchResult = {
  score: number;
  reasons: MatchReasonCode[];
  spotDays: number | null;
};

const CLOSE_KM = 8;

function clamp(n: number, max: number) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, n);
}

function ageBand(raw?: string | null): AgeBand {
  if (raw === "infant" || raw === "toddler" || raw === "preschool" || raw === "school-age") return raw;
  return "any";
}

function activeMax(query: SmartMatchQuery) {
  let max: number = SMART_MATCH_WEIGHTS.distance + SMART_MATCH_WEIGHTS.ageFit + SMART_MATCH_WEIGHTS.openingsFreshness + SMART_MATCH_WEIGHTS.completeness + SMART_MATCH_WEIGHTS.trust;
  if (query.wantSubsidy) max += SMART_MATCH_WEIGHTS.subsidyFit;
  if (query.schedules && query.schedules.length > 0) max += SMART_MATCH_WEIGHTS.hoursFit;
  return max;
}

function to100(earned: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((earned / max) * 100)));
}

function kmUsed(item: SmartMatchListing, query: SmartMatchQuery) {
  const home = typeof item.distanceKm === "number" && Number.isFinite(item.distanceKm) ? item.distanceKm : null;
  const work = typeof query.workDistanceKm === "number" && Number.isFinite(query.workDistanceKm) ? query.workDistanceKm : null;
  if (query.anchor === "work" && work != null) return work;
  if (query.anchor === "both" && home != null && work != null) return Math.max(home, work);
  return home;
}

function spotAgeDays(item: SmartMatchListing, now: number) {
  const freshness = vacancyFreshness(vacancyTimestamp(item), now);
  if (freshness.kind !== "fresh" || !freshness.age) return null;
  if (freshness.age.unit === "month") return freshness.age.count * 30;
  if (freshness.age.unit === "day") return freshness.age.count;
  return 0;
}

export function scoreSmartMatch(item: SmartMatchListing, query: SmartMatchQuery = {}, now = Date.now()): SmartMatchResult {
  const weights = SMART_MATCH_WEIGHTS;
  const reasons: MatchReasonCode[] = [];
  let earned = 0;

  const km = query.distanceKnown === false ? null : kmUsed(item, query);
  if (km != null && km >= 0) {
    const radius = query.radiusKm && Number.isFinite(query.radiusKm) ? query.radiusKm : 25;
    const decay = distanceDecay(km, Math.max(2, radius * 0.6));
    earned += clamp(decay * weights.distance, weights.distance);
    if (km <= CLOSE_KM) {
      const home = typeof item.distanceKm === "number" ? item.distanceKm : null;
      const work = typeof query.workDistanceKm === "number" ? query.workDistanceKm : null;
      if (query.anchor === "both" && home != null && work != null && home <= CLOSE_KM && work <= CLOSE_KM) {
        reasons.push("close_both");
      } else if (query.anchor === "work") {
        reasons.push("close_work");
      } else {
        reasons.push("close_home");
      }
    }
  }

  const band = ageBand(query.ageGroup);
  if (band === "any") {
    if (item.agesKnown) {
      earned += weights.ageFit;
      reasons.push("ages_listed");
    }
  } else if (matchesAgeBand(band, { agesKnown: item.agesKnown, ageMinMonths: item.ageMinMonths, ageMaxMonths: item.ageMaxMonths })) {
    earned += weights.ageFit;
    reasons.push("age_fit");
  }

  const days = spotAgeDays(item, now);
  const spots =
    band === "school-age"
      ? 0
      : spotsForAgeGroup(item, band === "any" ? "any" : band);
  if (days != null && spots > 0) {
    earned += weights.openingsFreshness;
    reasons.push("spots_fresh");
  }

  if (query.wantSubsidy) {
    if (confirmedFeeProgramBadge(item)) {
      earned += weights.subsidyFit;
      reasons.push("subsidy");
    }
  }

  const askedHours = (query.schedules ?? []).filter((s) => s === "full" || s === "part" || s === "flexible");
  if (askedHours.length) {
    const offered = item.scheduleOptions ?? [];
    if (offered.some((s) => askedHours.includes(s))) {
      earned += weights.hoursFit;
      reasons.push("hours");
    }
  }

  const complete = listingCompleteness(item);
  earned += clamp((complete.score / 5) * weights.completeness, weights.completeness);
  if (complete.ready) reasons.push("complete");

  let trust = 0;
  if (isClaimVerified(item)) {
    trust += weights.trust * 0.6;
    reasons.push("claim");
  }
  if (complete.ready) trust += weights.trust * 0.4;
  earned += clamp(trust, weights.trust);

  const order: MatchReasonCode[] = [
    "close_work",
    "close_home",
    "close_both",
    "spots_fresh",
    "age_fit",
    "ages_listed",
    "subsidy",
    "hours",
    "claim",
    "complete",
  ];
  const picked = order.filter((code) => reasons.includes(code)).slice(0, 3);

  return {
    score: to100(earned, activeMax(query)),
    reasons: picked,
    spotDays: days,
  };
}

export function safeScoreSmartMatch(item: SmartMatchListing, query: SmartMatchQuery = {}, now = Date.now()): SmartMatchResult {
  try {
    return scoreSmartMatch(item, query, now);
  } catch {
    return { score: 0, reasons: [], spotDays: null };
  }
}

export function compareSmartMatch(a: SmartMatchListing, b: SmartMatchListing, query: SmartMatchQuery = {}, now = Date.now()) {
  const delta = safeScoreSmartMatch(b, query, now).score - safeScoreSmartMatch(a, query, now).score;
  if (delta !== 0) return delta;
  const kmA = typeof a.distanceKm === "number" ? a.distanceKm : 9e6;
  const kmB = typeof b.distanceKm === "number" ? b.distanceKm : 9e6;
  return kmA - kmB;
}
