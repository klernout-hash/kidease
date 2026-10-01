/**
 * Smart match v1. Every ranking weight lives in this file.
 *
 * Rules only. No paid plan, no invented review, no invented opening.
 * A missing fact scores 0. Nothing in this file can score below 0.
 *
 * When a factor does not apply (no work address, no age group, the parent
 * did not ask about subsidy, the parent did not ask about hours or days),
 * that weight is spread across the factors that do apply so the total
 * can still reach 100. Stale or unknown openings stay inside
 * `openingsFreshness` and score 0. They are not dropped and not a penalty.
 *
 * PostHog flag `ranking-best-match` is read on the server. Off stays on Nearest.
 * If PostHog cannot be reached, search stays on Nearest. Not a 50% split.
 */

export const SMART_MATCH_WEIGHTS = {
  /** Commute from the home pin. Full points near the pin, gone at the search radius. */
  distanceHome: 22,
  /** Commute from the work pin. Dropped (and redistributed) when work is not set. */
  distanceWork: 18,
  /** Age group the parent asked for. Dropped when they did not pick one. Unknown ages score 0. */
  ageFit: 18,
  /** Confirmed openings. Fresh matching spots score more. Stale or unknown score 0, never below. */
  openingsFreshness: 16,
  /** $10-a-day or a sourced subsidy. Used only when the parent asked. Otherwise redistributed. */
  subsidyFit: 8,
  /** Hours and days the parent asked for. Otherwise redistributed. Unknown hours score 0. */
  hoursDaysFit: 8,
  /** Fees, ages, hours, licence, and a real photo. Partial credit. Never invented. */
  completeness: 6,
  /**
   * Soft trust only: claim-verified, a fresh confirmed opening, a complete listing.
   * Paid plans, featured pins, and unclaimed listings are not in this weight.
   * Unclaimed scores 0 here. They are not hidden and not pushed down.
   */
  trust: 4,
} as const;

export type SmartMatchWeightKey = keyof typeof SMART_MATCH_WEIGHTS;

/** Boolean PostHog flag. The rollout percent is set in PostHog, not in this file. */
export const RANKING_BEST_MATCH_FLAG = "ranking-best-match";

/** The split set on the PostHog flag. Code does not turn Best match on by itself. */
export const RANKING_BEST_MATCH_ROLLOUT_PERCENT = 50;

export const WHY_REASON_LIMIT = 2;

/** First reasons that actually scored fill the "Why this match" line. */
export const WHY_PRIORITY = [
  "close_work",
  "close_home",
  "spots_fresh",
  "age_fit",
  "subsidy",
  "hours_days",
  "claim_verified",
  "complete",
] as const;

export type WhyCode = (typeof WHY_PRIORITY)[number];

const WEIGHT_SUM = Object.values(SMART_MATCH_WEIGHTS).reduce((sum, n) => sum + n, 0);

if (WEIGHT_SUM !== 100) {
  throw new Error(`SMART_MATCH_WEIGHTS must sum to 100, got ${WEIGHT_SUM}`);
}
