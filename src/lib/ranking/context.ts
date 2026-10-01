/**
 * Remembers the sort and 1-based position for the search the parent just ran.
 * Listing events read it so we can measure ranking later. No names or messages.
 */

import type { RankingVariant } from "./variant.ts";

const KEY = "ke-ranking-ctx";

export type RankingContext = {
  sort: string;
  variant: RankingVariant;
  positions: Record<string, number>;
};

export function publishRankingContext(items: Array<{ id: string }>, sort: string, variant: RankingVariant) {
  if (typeof sessionStorage === "undefined") return;
  const positions: Record<string, number> = {};
  items.forEach((item, index) => {
    if (item.id) positions[item.id] = index + 1;
  });
  const payload: RankingContext = { sort, variant, positions };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* private mode */
  }
}

export function readRankingContext(): RankingContext | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RankingContext;
    if (!parsed || typeof parsed.sort !== "string" || typeof parsed.positions !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function rankingContextFor(listingId: string): { sort?: string; position?: number; variant?: RankingVariant } {
  const ctx = readRankingContext();
  if (!ctx) return {};
  const position = ctx.positions[listingId];
  return {
    sort: ctx.sort,
    variant: ctx.variant,
    position: typeof position === "number" ? position : undefined,
  };
}
