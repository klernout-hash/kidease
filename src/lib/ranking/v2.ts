/**
 * Search ranking v2. With the flag off, callers must keep today's order.
 * Paid pins are never a signal.
 */

import { evaluateFeatureFlag, type EnvMap } from "../flags.ts";

export const RANKING_V2_FRESH_DAYS = 14;
export const RANKING_V2_NEW_LISTING_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

const AGE_RANGES: Record<string, [number, number]> = {
  infant: [0, 18],
  toddler: [18, 36],
  preschool: [30, 72],
  "school-age": [60, 144],
};

export type RankingV2Card = {
  id?: string;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  spotsUpdatedAt?: string | null;
  claimedAt?: string | null;
  ratingX10?: number | null;
  reviewCount?: number | null;
  parentReviewCount?: number | null;
  topRated?: boolean | null;
  blocked?: boolean | null;
  closedToday?: boolean | null;
};

export type RankingV2Context = {
  enabled: boolean;
  now?: number;
  ageGroup?: string | null;
};

export function rankingV2Enabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_RANKING_V2", env);
}

function ageOverlaps(card: RankingV2Card, ageGroup: string | null | undefined): boolean {
  if (!ageGroup || ageGroup === "any") return false;
  const range = AGE_RANGES[ageGroup];
  if (!range) return false;
  const min = card.ageMinMonths;
  const max = card.ageMaxMonths;
  if (min == null || max == null) return false;
  return max >= range[0] && min <= range[1];
}

function withinDays(iso: string | null | undefined, now: number, days: number): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  return age >= 0 && age <= days * DAY_MS;
}

/** Higher is a nudge. Never reads paid placement. */
export function rankingV2Bonus(card: RankingV2Card, ctx: RankingV2Context): number {
  if (!ctx.enabled) return 0;
  const now = ctx.now ?? Date.now();
  let bonus = 0;
  if (withinDays(card.spotsUpdatedAt, now, RANKING_V2_FRESH_DAYS)) bonus += 3;
  if (ageOverlaps(card, ctx.ageGroup)) bonus += 2;
  if (card.topRated) bonus += 1;
  if (withinDays(card.claimedAt, now, RANKING_V2_NEW_LISTING_DAYS)) bonus += 1;
  const reviews = card.reviewCount ?? 0;
  const parents = card.parentReviewCount ?? 0;
  if (reviews >= 15 && parents === 0 && (card.ratingX10 ?? 0) >= 48) bonus -= 2;
  return bonus;
}

export function rankingV2Excluded(card: RankingV2Card): boolean {
  return card.blocked === true || card.closedToday === true;
}

/**
 * Flag off: the base comparator, unchanged.
 * Flag on: the base order, then the v2 nudge only when the base call is a tie.
 */
export function rankingV2TieBreak<T>(
  a: T,
  b: T,
  base: (left: T, right: T) => number,
  ctx: RankingV2Context,
  bonus: (card: T) => number = (card) => rankingV2Bonus(card as RankingV2Card, ctx),
): number {
  const delta = base(a, b);
  if (!ctx.enabled || delta !== 0) return delta;
  return bonus(b) - bonus(a);
}

export function excludeRankingV2<T extends RankingV2Card>(cards: T[], enabled: boolean): T[] {
  if (!enabled) return cards;
  return cards.filter((card) => !rankingV2Excluded(card));
}
