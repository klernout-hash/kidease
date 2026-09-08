/**
 * Parent Match score (0–100): how well a centre fits a parent's search prefs.
 *
 * Distance, ages, vacancy, claim/licence trust, and quality signals (PR #65).
 * Missing signals add zero — they are never invented.
 * Paid Pro / Network, featured-city, and promote pins never enter this score.
 */

import { vacancyFreshness, vacancyTimestamp } from "@/lib/listing-readiness";
import { qualityBreakdown, QUALITY_WEIGHTS } from "@/lib/quality";
import { distanceDecay } from "@/lib/proximity";
import { matchesAgeBand, type AgeBand } from "@/lib/saved-search";
import { parseAgeGroup } from "@/lib/care-type";
import type { AgeGroup, Daycare } from "@/lib/types";

export const MATCH_WEIGHTS = {
  distance: 25,
  ages: 20,
  vacancy: 20,
  trust: 20,
  quality: 15,
} as const;

export type ParentMatchPrefs = {
  /** Parsed via `parseAgeGroup` — string chips must not fail tsc. */
  ageGroup?: string | null;
  radiusKm?: number;
  /** Set only after a real origin→centre distance was measured. */
  distanceKnown?: boolean;
};

export type ParentMatchInput = Pick<
  Daycare,
  | "id"
  | "city"
  | "province"
  | "infantMonthly"
  | "toddlerMonthly"
  | "preschoolMonthly"
  | "partTimeMonthly"
  | "agesKnown"
  | "ageMinMonths"
  | "ageMaxMonths"
  | "hours"
  | "licenseNumber"
  | "photos"
  | "lastVacancyUpdatedAt"
  | "spotsUpdatedAt"
  | "lastPhotoUpdatedAt"
  | "parentRatingX10"
  | "parentReviewCount"
  | "claimStatus"
  | "claimed"
  | "live"
  | "licenseStatus"
  | "registryMatchState"
  | "spotsInfant"
  | "spotsToddler"
  | "spotsPreschool"
  | "availabilityKnown"
  | "qualityScore"
> & {
  distanceKm?: number;
  spotsTotal?: number;
  tourDecided?: number;
  tourAccepted?: number;
  threadCount?: number;
  threadReplied?: number;
};

export type ParentMatchBreakdown = {
  distance: number;
  ages: number;
  vacancy: number;
  trust: number;
  quality: number;
  total: number;
};

function clampScore(n: number, max: number) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, Math.round(n));
}

export function spotsForAgeGroup(
  item: Pick<ParentMatchInput, "spotsInfant" | "spotsToddler" | "spotsPreschool" | "spotsTotal">,
  ageGroup: "any" | AgeGroup = "any",
) {
  if (ageGroup === "infant") return Math.max(0, item.spotsInfant ?? 0);
  if (ageGroup === "toddler") return Math.max(0, item.spotsToddler ?? 0);
  if (ageGroup === "preschool") return Math.max(0, item.spotsPreschool ?? 0);
  if (typeof item.spotsTotal === "number") return Math.max(0, item.spotsTotal);
  return Math.max(0, (item.spotsInfant ?? 0) + (item.spotsToddler ?? 0) + (item.spotsPreschool ?? 0));
}

function distancePoints(item: ParentMatchInput, prefs: ParentMatchPrefs): number {
  if (!prefs.distanceKnown) return 0;
  const km = item.distanceKm;
  if (typeof km !== "number" || !Number.isFinite(km) || km < 0) return 0;
  const radius = prefs.radiusKm && Number.isFinite(prefs.radiusKm) ? prefs.radiusKm : 25;
  const decay = distanceDecay(km, Math.max(2, radius * 0.6));
  return clampScore(decay * MATCH_WEIGHTS.distance, MATCH_WEIGHTS.distance);
}

function agePoints(item: ParentMatchInput, prefs: ParentMatchPrefs): number {
  const band = parseAgeGroup(prefs.ageGroup) as AgeBand;
  if (band === "any") {
    return item.agesKnown ? MATCH_WEIGHTS.ages : 0;
  }
  if (!matchesAgeBand(band, item)) return 0;
  return MATCH_WEIGHTS.ages;
}

function vacancyPoints(item: ParentMatchInput, prefs: ParentMatchPrefs): number {
  const vacancy = vacancyFreshness(vacancyTimestamp(item));
  if (vacancy.kind === "unknown") return 0;
  const ageGroup = parseAgeGroup(prefs.ageGroup);
  const ageSpots = spotsForAgeGroup(item, ageGroup);
  const anySpots = spotsForAgeGroup(item, "any");
  if (vacancy.kind === "stale") {
    if (ageSpots > 0) return 8;
    if (anySpots > 0) return 5;
    return 2;
  }
  if (ageSpots > 0) return MATCH_WEIGHTS.vacancy;
  if (anySpots > 0 && ageGroup !== "any") return 12;
  if (anySpots > 0) return MATCH_WEIGHTS.vacancy;
  return 6;
}

function trustAndQuality(item: ParentMatchInput): { trust: number; quality: number } {
  const q = qualityBreakdown(item);
  const trust = clampScore((q.trust / QUALITY_WEIGHTS.trust) * MATCH_WEIGHTS.trust, MATCH_WEIGHTS.trust);
  const rest = q.completeness + q.reviews + q.engagement;
  const restMax = QUALITY_WEIGHTS.completeness + QUALITY_WEIGHTS.reviews + QUALITY_WEIGHTS.engagement;
  const quality = clampScore((rest / restMax) * MATCH_WEIGHTS.quality, MATCH_WEIGHTS.quality);
  return { trust, quality };
}

export function parentMatchBreakdown(item: ParentMatchInput, prefs: ParentMatchPrefs = {}): ParentMatchBreakdown {
  const distance = distancePoints(item, prefs);
  const ages = agePoints(item, prefs);
  const vacancy = vacancyPoints(item, prefs);
  const composed = trustAndQuality(item);
  const total = clampScore(
    distance + ages + vacancy + composed.trust + composed.quality,
    100,
  );
  return {
    distance,
    ages,
    vacancy,
    trust: composed.trust,
    quality: composed.quality,
    total,
  };
}

/** Public 0–100 match. Paid pins are ignored. Missing prefs or signals score zero. */
export function parentMatchScore(item: ParentMatchInput, prefs: ParentMatchPrefs = {}): number {
  return parentMatchBreakdown(item, prefs).total;
}

export function compareParentMatch(
  a: ParentMatchInput,
  b: ParentMatchInput,
  prefs: ParentMatchPrefs = {},
) {
  const delta = parentMatchScore(b, prefs) - parentMatchScore(a, prefs);
  if (delta !== 0) return delta;
  const kmA = typeof a.distanceKm === "number" ? a.distanceKm : 9e6;
  const kmB = typeof b.distanceKm === "number" ? b.distanceKm : 9e6;
  return kmA - kmB;
}
