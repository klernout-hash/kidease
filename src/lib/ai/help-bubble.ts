/**
 * Parent helper bubble. Visibility follows the parent-helper flag.
 * FEATURE_INAPP_CHAT does not show or hide this bubble.
 * A signed-out visitor can ask until a short limit, then must pass Turnstile.
 */

import { AI_FLAGS, aiBucket } from "./flags.ts";
import { aiFeatureVisible, sanitizeAiDistinctId, type AiFlagSnapshot } from "./flag-gate.ts";
import { scrubText } from "./pii.ts";

export const BUBBLE_SOFT_LIMIT = 6;
export const BUBBLE_HARD_LIMIT = 20;
export const BUBBLE_WINDOW_MS = 10 * 60 * 1000;

const ANON_KEY = "kidease-ai-id";

type Bucket = { used: number; reset: number };
const buckets = new Map<string, Bucket>();

export function resetBubbleAsksForTests(): void {
  buckets.clear();
}

export function bubbleVisible(snapshot: AiFlagSnapshot, bucket: number): boolean {
  return aiFeatureVisible({ flag: AI_FLAGS.parentHelper, bucket, snapshot });
}

/** Same id the flag read uses. Never an email or a name. */
export function helpBubbleDistinctId(userId?: string | null): string {
  const direct = sanitizeAiDistinctId(userId);
  if (userId && userId !== "dev-user" && direct !== "kidease-server") return direct;
  if (typeof window === "undefined") return "kidease-server";
  try {
    const existing = window.localStorage.getItem(ANON_KEY);
    const kept = sanitizeAiDistinctId(existing);
    if (existing && kept !== "kidease-server") return kept;
    const next = crypto.randomUUID();
    window.localStorage.setItem(ANON_KEY, next);
    return next;
  } catch {
    return "kidease-server";
  }
}

/** Text the model may see. Personal details are removed first. */
export function bubbleQuestionForModel(raw: string): string {
  return scrubText(String(raw || ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

export function bubbleBucket(distinctId: string): number {
  return aiBucket(distinctId);
}

export type BubbleAskDecision =
  | { ok: true; used: number }
  | { ok: false; error: "turnstile" | "rate_limited" };

export function nextBubbleAsk(input: { used: number; turnstilePassed: boolean }): BubbleAskDecision {
  if (input.used >= BUBBLE_HARD_LIMIT) return { ok: false, error: "rate_limited" };
  if (input.used >= BUBBLE_SOFT_LIMIT && !input.turnstilePassed) return { ok: false, error: "turnstile" };
  return { ok: true, used: input.used + 1 };
}

export function consumeBubbleAsk(key: string, now: number, turnstilePassed: boolean): BubbleAskDecision {
  const id = key.trim() || "guest";
  const row = buckets.get(id);
  const fresh = !row || row.reset <= now;
  const used = fresh ? 0 : row.used;
  const decision = nextBubbleAsk({ used, turnstilePassed });
  if (!decision.ok) return decision;
  buckets.set(id, { used: decision.used, reset: fresh ? now + BUBBLE_WINDOW_MS : row.reset });
  return decision;
}
