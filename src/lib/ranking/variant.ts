/**
 * Best match is a PostHog experiment. Nearest is the fallback.
 * Set `ranking-best-match` to 50% of searches in PostHog.
 * Flag missing, still loading, or off → Nearest.
 * `?rank=best` and `?rank=nearest` are explicit overrides for preview and e2e.
 */

import { RANKING_BEST_MATCH_FLAG, RANKING_BEST_MATCH_ROLLOUT_PERCENT } from "./weights.ts";

export { RANKING_BEST_MATCH_FLAG, RANKING_BEST_MATCH_ROLLOUT_PERCENT };

export type RankingVariant = "best_match" | "nearest";
export type RankingOverride = "best" | "nearest" | null;

export function parseRankingOverride(raw: unknown): RankingOverride {
  if (raw === "best" || raw === "best_match") return "best";
  if (raw === "nearest" || raw === "distance") return "nearest";
  return null;
}

export function assignRankingVariant(input: {
  /** `true` / `false` from PostHog. `undefined` means the flag has not loaded. */
  flag?: boolean;
  override?: RankingOverride;
}): RankingVariant {
  if (input.override === "best") return "best_match";
  if (input.override === "nearest") return "nearest";
  if (input.flag === true) return "best_match";
  return "nearest";
}

/** Stable 0–99 bucket. PostHog should use the same 50% cutoff on the flag. */
export function rankingBucket(id: string, percent = RANKING_BEST_MATCH_ROLLOUT_PERCENT) {
  let hash = 0;
  const key = id.trim() || "0";
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  const bucket = hash % 100;
  return { bucket, inRollout: bucket < percent };
}
