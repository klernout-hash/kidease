/**
 * Best match experiment.
 * PostHog flag `best-match-sort` wins once it is in the flag payload.
 * Until then, a stable session bucket sends half of searches to Best match.
 * Nearest stays the default for the other half. A scoring error uses Nearest.
 */

import { BEST_MATCH_FLAG } from "./weights.ts";

export { BEST_MATCH_FLAG };

export type RankVariant = "best_match" | "nearest";

export function bestMatchBucket(seed: string): number {
  let hash = 2166136261;
  const text = seed || "kidease";
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100;
}

export function resolveBestMatchVariant(input: {
  /** True only when PostHog has loaded flags and this flag key is in the payload. */
  flagKnown: boolean;
  flag: boolean | string | undefined;
  seed: string;
  force?: RankVariant | null;
}): RankVariant {
  if (input.force === "best_match" || input.force === "nearest") return input.force;
  if (input.flagKnown) {
    if (input.flag === true || input.flag === "best_match") return "best_match";
    return "nearest";
  }
  return bestMatchBucket(input.seed) < 50 ? "best_match" : "nearest";
}

const SEED_KEY = "kidease-rank-seed";

/** Same browser tab stays in one half. Not a user id and not personal data. */
export function rankSessionSeed(): string {
  if (typeof sessionStorage === "undefined") return "kidease";
  try {
    const cur = sessionStorage.getItem(SEED_KEY);
    if (cur && cur.length >= 8) return cur;
    const next = `s${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    sessionStorage.setItem(SEED_KEY, next);
    return next;
  } catch {
    return "kidease";
  }
}
