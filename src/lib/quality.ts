/**
 * Centre quality score (0–100) and Guest Favorites.
 *
 * Built from real KidEase signals only:
 *   claim / licence trust, listing completeness, vacancy freshness,
 *   gated parent-review average + count, reply / tour-accept rates
 *   when the sample is large enough.
 *
 * KidEase never invents ratings, vacancy times, or a Guest Favorites badge.
 * Incomplete or stale listings stay searchable — they are soft-demoted only.
 * Never claim KidEase police-checks educators.
 */

import {
  listingCompleteness,
  vacancyFreshness,
  vacancyTimestamp,
  type CompletenessField,
} from "@/lib/listing-readiness";
import {
  isClaimVerified,
  normalizeLicenseStatus,
  type TrustListing,
} from "@/lib/trust";
import type { Daycare } from "@/lib/types";

export const QUALITY_WEIGHTS = {
  trust: 25,
  completeness: 25,
  freshness: 15,
  reviews: 20,
  engagement: 15,
} as const;

/** Gated parent reviews do not move the needle until this many are published. */
export const MIN_REVIEW_COUNT = 3;

/** Tour accept rate is unused until this many tours are accepted or declined. */
export const MIN_TOUR_DECIDED = 5;

/** Reply rate is unused until this many parent threads exist. */
export const MIN_THREAD_SAMPLE = 5;

/** Guest Favorites: top tenth of eligible listings in the same metro. */
export const GUEST_FAVORITE_PERCENTILE = 0.1;

/** Hide the badge entirely when a metro has fewer eligible listings than this. */
export const GUEST_FAVORITE_MIN_METRO = 8;

/** Floor so a thin high score cannot mint a badge. */
export const GUEST_FAVORITE_MIN_SCORE = 60;

export const GUEST_FAVORITE_MIN_REVIEWS = MIN_REVIEW_COUNT;

export type QualityIssueId =
  | "claim_unverified"
  | "license_unverified"
  | "license_expired"
  | "license_suspended"
  | "incomplete_fees"
  | "incomplete_ages"
  | "incomplete_hours"
  | "incomplete_license"
  | "incomplete_photo"
  | "vacancy_unknown"
  | "vacancy_stale"
  | "reviews_thin"
  | "tours_low"
  | "replies_low";

export type QualityIssueCta =
  | "confirm_spots"
  | "edit_fees"
  | "edit_ages"
  | "edit_hours"
  | "edit_photo"
  | "edit_license"
  | "claim"
  | "inbox";

export type QualityIssue = {
  id: QualityIssueId;
  severity: "warn" | "info";
  cta: QualityIssueCta;
  anchor?: string;
};

export type QualityInput = TrustListing &
  Pick<
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
    | "parentRatingX10"
    | "parentReviewCount"
  > & {
    tourDecided?: number;
    tourAccepted?: number;
    threadCount?: number;
    threadReplied?: number;
  };

export type QualityBreakdown = {
  trust: number;
  completeness: number;
  freshness: number;
  reviews: number;
  engagement: number;
  total: number;
  issues: QualityIssue[];
  eligibleForFavorite: boolean;
};

const ISSUE_ANCHOR: Partial<Record<QualityIssueId, string>> = {
  incomplete_fees: "listing-health-fees",
  incomplete_ages: "listing-health-ages",
  incomplete_hours: "listing-health-hours",
  incomplete_photo: "listing-health-photo",
  incomplete_license: "listing-health-license",
  vacancy_unknown: "listing-health-vacancy",
  vacancy_stale: "listing-health-vacancy",
};

const ISSUE_CTA: Record<QualityIssueId, QualityIssueCta> = {
  claim_unverified: "claim",
  license_unverified: "edit_license",
  license_expired: "edit_license",
  license_suspended: "edit_license",
  incomplete_fees: "edit_fees",
  incomplete_ages: "edit_ages",
  incomplete_hours: "edit_hours",
  incomplete_license: "edit_license",
  incomplete_photo: "edit_photo",
  vacancy_unknown: "confirm_spots",
  vacancy_stale: "confirm_spots",
  reviews_thin: "inbox",
  tours_low: "inbox",
  replies_low: "inbox",
};

const COMPLETE_ISSUE: Record<CompletenessField, QualityIssueId> = {
  fees: "incomplete_fees",
  ages: "incomplete_ages",
  hours: "incomplete_hours",
  license: "incomplete_license",
  photo: "incomplete_photo",
};

function clampScore(n: number, max: number) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, Math.round(n));
}

export function metroKey(item: { city?: string | null; province?: string | null }) {
  const city = (item.city || "").trim().toLowerCase();
  const province = (item.province || "").trim().toLowerCase();
  return `${city}|${province}`;
}

function trustPoints(item: QualityInput): { score: number; issues: QualityIssue[] } {
  const issues: QualityIssue[] = [];
  let score = 0;
  if (isClaimVerified(item)) {
    score += 15;
  } else {
    issues.push(makeIssue("claim_unverified"));
  }
  const license = normalizeLicenseStatus(item.licenseStatus);
  if (license === "expired") {
    issues.push(makeIssue("license_expired"));
  } else if (license === "suspended") {
    issues.push(makeIssue("license_suspended"));
  } else if (license === "matched" || item.registryMatchState === "matched") {
    score += 10;
  } else {
    issues.push(makeIssue("license_unverified"));
  }
  return { score: clampScore(score, QUALITY_WEIGHTS.trust), issues };
}

function completenessPoints(item: QualityInput): { score: number; issues: QualityIssue[] } {
  const complete = listingCompleteness(item);
  const issues = complete.missing.map((field) => makeIssue(COMPLETE_ISSUE[field]));
  const score = (complete.score / 5) * QUALITY_WEIGHTS.completeness;
  return { score: clampScore(score, QUALITY_WEIGHTS.completeness), issues };
}

function freshnessPoints(item: QualityInput): { score: number; issues: QualityIssue[] } {
  const vacancy = vacancyFreshness(vacancyTimestamp(item));
  if (vacancy.kind === "fresh") {
    return { score: QUALITY_WEIGHTS.freshness, issues: [] };
  }
  if (vacancy.kind === "stale") {
    return { score: 4, issues: [makeIssue("vacancy_stale")] };
  }
  return { score: 0, issues: [makeIssue("vacancy_unknown")] };
}

function reviewPoints(item: QualityInput): { score: number; issues: QualityIssue[] } {
  const count = Math.max(0, Math.floor(item.parentReviewCount ?? 0));
  const ratingX10 = item.parentRatingX10 ?? 0;
  if (count < MIN_REVIEW_COUNT || ratingX10 <= 0) {
    return { score: 0, issues: [makeIssue("reviews_thin", "info")] };
  }
  const avgShare = Math.min(1, ratingX10 / 50);
  const volume = Math.min(1, count / 8);
  const score = QUALITY_WEIGHTS.reviews * avgShare * volume;
  return { score: clampScore(score, QUALITY_WEIGHTS.reviews), issues: [] };
}

function engagementPoints(item: QualityInput): { score: number; issues: QualityIssue[] } {
  const issues: QualityIssue[] = [];
  const decided = Math.max(0, Math.floor(item.tourDecided ?? 0));
  const accepted = Math.max(0, Math.floor(item.tourAccepted ?? 0));
  const threads = Math.max(0, Math.floor(item.threadCount ?? 0));
  const replied = Math.max(0, Math.floor(item.threadReplied ?? 0));
  let score = 0;
  let used = 0;

  if (decided >= MIN_TOUR_DECIDED) {
    used += 1;
    const rate = Math.min(1, accepted / decided);
    score += 8 * rate;
    if (rate < 0.5) issues.push(makeIssue("tours_low"));
  }
  if (threads >= MIN_THREAD_SAMPLE) {
    used += 1;
    const rate = Math.min(1, replied / threads);
    score += 7 * rate;
    if (rate < 0.5) issues.push(makeIssue("replies_low"));
  }
  if (!used) return { score: 0, issues: [] };
  return { score: clampScore(score, QUALITY_WEIGHTS.engagement), issues };
}

function makeIssue(id: QualityIssueId, severity: QualityIssue["severity"] = "warn"): QualityIssue {
  return {
    id,
    severity,
    cta: ISSUE_CTA[id],
    anchor: ISSUE_ANCHOR[id],
  };
}

export function guestFavoriteEligible(item: QualityInput, breakdown?: QualityBreakdown): boolean {
  const score = breakdown ?? qualityBreakdown(item);
  if (score.total < GUEST_FAVORITE_MIN_SCORE) return false;
  if (!isClaimVerified(item)) return false;
  if (!listingCompleteness(item).ready) return false;
  if (vacancyFreshness(vacancyTimestamp(item)).kind !== "fresh") return false;
  if ((item.parentReviewCount ?? 0) < GUEST_FAVORITE_MIN_REVIEWS) return false;
  if ((item.parentRatingX10 ?? 0) <= 0) return false;
  const license = normalizeLicenseStatus(item.licenseStatus);
  if (license === "expired" || license === "suspended") return false;
  return true;
}

export function qualityBreakdown(item: QualityInput): QualityBreakdown {
  const trust = trustPoints(item);
  const completeness = completenessPoints(item);
  const freshness = freshnessPoints(item);
  const reviews = reviewPoints(item);
  const engagement = engagementPoints(item);
  const total = clampScore(
    trust.score + completeness.score + freshness.score + reviews.score + engagement.score,
    100,
  );
  const issues = [
    ...trust.issues,
    ...completeness.issues,
    ...freshness.issues,
    ...reviews.issues,
    ...engagement.issues,
  ];
  const breakdown: QualityBreakdown = {
    trust: trust.score,
    completeness: completeness.score,
    freshness: freshness.score,
    reviews: reviews.score,
    engagement: engagement.score,
    total,
    issues,
    eligibleForFavorite: false,
  };
  breakdown.eligibleForFavorite = guestFavoriteEligible(item, breakdown);
  return breakdown;
}

/** Public 0–100 score. Missing signals add zero — they are never invented. */
export function qualityScore100(item: QualityInput): number {
  return qualityBreakdown(item).total;
}

export function applyQualityFields<T extends QualityInput>(
  item: T,
  extras?: Pick<QualityInput, "tourDecided" | "tourAccepted" | "threadCount" | "threadReplied">,
): T & { qualityScore: number; guestFavorite: boolean } {
  const scored = extras ? { ...item, ...extras } : item;
  const breakdown = qualityBreakdown(scored);
  return {
    ...scored,
    qualityScore: breakdown.total,
    guestFavorite: false,
  };
}

/**
 * Mark Guest Favorites in-place among already-scored listings.
 * Top percentile per metro, only when the metro sample clears the threshold.
 */
export function assignGuestFavorites<T extends QualityInput & { qualityScore?: number; guestFavorite?: boolean }>(
  items: T[],
): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = metroKey(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  const winners = new Set<string>();
  for (const group of groups.values()) {
    const eligible = group.filter((item) => {
      const total = item.qualityScore ?? qualityScore100(item);
      return guestFavoriteEligible(item, {
        ...qualityBreakdown(item),
        total,
      });
    });
    if (eligible.length < GUEST_FAVORITE_MIN_METRO) continue;
    const ranked = [...eligible].sort((a, b) => {
      const delta = (b.qualityScore ?? qualityScore100(b)) - (a.qualityScore ?? qualityScore100(a));
      if (delta !== 0) return delta;
      return (a.id || "").localeCompare(b.id || "");
    });
    const take = Math.max(1, Math.ceil(ranked.length * GUEST_FAVORITE_PERCENTILE));
    for (const item of ranked.slice(0, take)) {
      if (item.id) winners.add(item.id);
    }
  }
  return items.map((item) => ({
    ...item,
    guestFavorite: Boolean(item.id && winners.has(item.id)),
  }));
}
