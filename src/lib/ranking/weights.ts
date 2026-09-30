/**
 * Smart match v1 — the only place these weights live.
 * Change a number here to retune ranking. Do not copy them into components.
 *
 * Each value is the most points that input can add. Missing or stale facts
 * score 0 (neutral). Nothing in this file can go negative.
 *
 * Paid plans (priority pins, featured city, Parent Plus, centre plans) are
 * not weights. They must never enter the score.
 *
 * PostHog flag `best-match-sort` (boolean, 50% rollout) is the experiment
 * switch. Until that flag exists in PostHog, the app assigns 50% of sessions
 * itself and logs the variant. Flag off, or a scoring error, falls back to
 * Nearest. See src/lib/ranking/flag.ts.
 */
export const BEST_MATCH_FLAG = "best-match-sort";

export const SMART_MATCH_WEIGHTS = {
  /** Closer to the search origin. Home, work, or both — whichever the parent set. */
  distance: 30,
  /** The age band the parent asked for. Unknown ages score 0, never a guess. */
  ageFit: 18,
  /**
   * Openings confirmed in the last 14 days. Stale or unknown score 0.
   * A fresh "no spots" confirm does not score — we do not invent openings.
   */
  openingsFreshness: 20,
  /** Only when the parent turned on the fee filter, and only if this centre's fee program is true. */
  subsidyFit: 12,
  /** Only when the parent picked hours or days. Unknown hours score 0. */
  hoursFit: 10,
  /** Photo, ages, hours, licence, fees. Partial credit. Incomplete listings stay in the list. */
  completeness: 6,
  /**
   * Soft trust: claim-verified and a complete listing. Recently confirmed
   * openings are scored under openingsFreshness so they are not counted twice.
   * Unclaimed and unverified listings stay visible and can still rank on the facts above.
   */
  trust: 4,
} as const;

export type SmartMatchWeightKey = keyof typeof SMART_MATCH_WEIGHTS;

/** Reason codes. The card turns these into a short "Why this match" line. */
export const MATCH_REASON_CODES = [
  "close_home",
  "close_work",
  "close_both",
  "age_fit",
  "ages_listed",
  "spots_fresh",
  "subsidy",
  "hours",
  "complete",
  "claim",
] as const;

export type MatchReasonCode = (typeof MATCH_REASON_CODES)[number];
