/**
 * KidEase Top Rated. Our own mark. Not a government rating.
 * Every rule must pass. Missing facts fail closed.
 */

import { evaluateFeatureFlag, type EnvMap } from "./flags.ts";

export const TOP_RATED_MIN_RATING = 4.8;
export const TOP_RATED_MIN_REVIEWS = 10;
export const TOP_RATED_MIN_REPLY_PCT = 90;
export const TOP_RATED_SPOT_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TopRatedInput = {
  now: number;
  /** Average of verified parent reviews in the last 12 months. 0 to 5. */
  rating12mo: number | null;
  reviewCount12mo: number;
  licencesValid: boolean;
  certificatesValid: boolean;
  screeningsValid: boolean;
  /** Share of replies sent within 24 hours. 0 to 100. Null when unknown. */
  repliesWithin24hPct: number | null;
  spotsConfirmedAt: number | null;
  upheldSafetyReports12mo: number;
};

export type TopRatedRule = {
  id: "rating" | "reviews" | "documents" | "replies" | "spots" | "safety";
  pass: boolean;
  current: number;
  target: number;
};

export function topRatedEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_TOP_RATED_BADGE", env);
}

export function evaluateTopRated(input: TopRatedInput): { pass: boolean; rules: TopRatedRule[] } {
  const rating = input.rating12mo;
  const rules: TopRatedRule[] = [
    {
      id: "rating",
      pass: rating != null && rating >= TOP_RATED_MIN_RATING,
      current: rating ?? 0,
      target: TOP_RATED_MIN_RATING,
    },
    {
      id: "reviews",
      pass: input.reviewCount12mo >= TOP_RATED_MIN_REVIEWS,
      current: input.reviewCount12mo,
      target: TOP_RATED_MIN_REVIEWS,
    },
    {
      id: "documents",
      pass: input.licencesValid && input.certificatesValid && input.screeningsValid,
      current: [input.licencesValid, input.certificatesValid, input.screeningsValid].filter(Boolean).length,
      target: 3,
    },
    {
      id: "replies",
      pass: input.repliesWithin24hPct != null && input.repliesWithin24hPct >= TOP_RATED_MIN_REPLY_PCT,
      current: input.repliesWithin24hPct ?? 0,
      target: TOP_RATED_MIN_REPLY_PCT,
    },
    {
      id: "spots",
      pass:
        input.spotsConfirmedAt != null &&
        input.now - input.spotsConfirmedAt >= 0 &&
        input.now - input.spotsConfirmedAt <= TOP_RATED_SPOT_DAYS * DAY_MS,
      current: input.spotsConfirmedAt == null ? TOP_RATED_SPOT_DAYS + 1 : Math.floor((input.now - input.spotsConfirmedAt) / DAY_MS),
      target: TOP_RATED_SPOT_DAYS,
    },
    {
      id: "safety",
      pass: input.upheldSafetyReports12mo === 0,
      current: input.upheldSafetyReports12mo,
      target: 0,
    },
  ];
  return { pass: rules.every((rule) => rule.pass), rules };
}

/** A certificate expiry or an upheld safety report removes the mark immediately. */
export function topRatedRevoked(input: { certificateExpired?: boolean; safetyUpheld?: boolean }): boolean {
  return input.certificateExpired === true || input.safetyUpheld === true;
}
