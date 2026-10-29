/**
 * Help chat text and ask limits.
 * The floating launcher does not follow the parent-helper flag.
 * FEATURE_INAPP_CHAT does not show or hide this bubble.
 * A signed-out visitor can ask until a short limit, then must pass Turnstile.
 * Questions must not carry a child's name, birthdate, or health details.
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

const CHILD_INTRO =
  /\b(?:my child(?:'s)?(?: name)? is|child(?:'s)? name is|nom de l'enfant est|mon enfant s'appelle|my son is|my daughter is|mon fils s'appelle|ma fille s'appelle)\s+\p{Lu}[\p{L}'’-]{1,40}/giu;

/** Drop child names, birthdates, and health details before a question is kept or sent. */
export function scrubHelpChatText(raw: string): string {
  return scrubText(String(raw || "").replace(CHILD_INTRO, "[redacted]"))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Text the model may see. Personal details are removed first.
 * Null when nothing useful is left, so a name or birthdate is not stored.
 */
export function helpChatQuestion(raw: string): string | null {
  const safe = scrubHelpChatText(raw).slice(0, 400);
  const letters = safe.replace(/\[redacted\]/g, "").replace(/[^\p{L}]/gu, "");
  if (letters.length < 3) return null;
  return safe;
}

/** Text the model may see. Personal details are removed first. */
export function bubbleQuestionForModel(raw: string): string {
  return scrubHelpChatText(raw).slice(0, 400);
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
