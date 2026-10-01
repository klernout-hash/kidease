/**
 * Reply drafts rewrite a parent's message using listing facts already on file.
 * The model cannot invent a fee, a licence, a spot, or a review.
 * The daycare edits the draft and sends it. Nothing goes out after 9 PM Winnipeg.
 */

import { z } from "zod";
import { isAlertQuietHours } from "../search-alert-policy.ts";

export const replyDraftSchema = z
  .object({
    body: z.string().min(1).max(500),
  })
  .strict();

export type ReplyDraftModel = z.infer<typeof replyDraftSchema>;

export type ReplyDraftFacts = {
  centre: string;
  city: string;
  hours: string;
  infant: number;
  toddler: number;
  preschool: number;
  ageMin: number;
  ageMax: number;
  parentMessage: string;
};

export const REPLY_DRAFT_SYSTEM = [
  "Write a short reply a daycare could send.",
  "Use only the parent message and the listing facts.",
  "Do not add a fee, a licence, a review, a spot count, a child name, a birthdate, or a contact detail that is not in the facts.",
  "If the facts do not answer the question, say you will check and reply.",
  "Reply with JSON only: {\"body\":\"...\"}.",
].join(" ");

export const REPLY_DRAFT_EVENTS = ["reply_draft_used", "reply_draft_sent", "reply_draft_held_quiet", "reply_draft_fallback"] as const;

export function replyDraftEventProps(input: { conversationId?: string } = {}) {
  const id = String(input.conversationId || "").trim();
  if (!id || id.includes("@")) return {};
  return { conversation_id: id };
}

export function replyDraftModelUser(facts: ReplyDraftFacts): string {
  return JSON.stringify({
    centre: facts.centre,
    city: facts.city,
    hours: facts.hours,
    infant: facts.infant,
    toddler: facts.toddler,
    preschool: facts.preschool,
    ageMin: facts.ageMin,
    ageMax: facts.ageMax,
    parentMessage: facts.parentMessage,
  });
}

function allowedNumbers(facts: ReplyDraftFacts): Set<string> {
  const allowed = new Set<string>(["0"]);
  for (const n of [facts.infant, facts.toddler, facts.preschool, facts.ageMin, facts.ageMax]) {
    allowed.add(String(Math.max(0, Math.round(n) || 0)));
  }
  for (const n of `${facts.centre} ${facts.city} ${facts.hours} ${facts.parentMessage}`.match(/\d+/g) || []) {
    allowed.add(n);
  }
  return allowed;
}

/** Empty body means the daycare types the reply. The page still works. */
export function groundReplyDraft(model: ReplyDraftModel | null, facts: ReplyDraftFacts): { body: string; source: "model" | "fallback" } {
  const body = model?.body.replace(/\s+/g, " ").trim() || "";
  if (!body || body.length > 500) return { body: "", source: "fallback" };
  if (/@/.test(body) || /\b(fee|fees|licence|license|review|\$|birthdate|birth date)\b/i.test(body)) {
    return { body: "", source: "fallback" };
  }
  const nums = body.match(/\d+/g) || [];
  const allowed = allowedNumbers(facts);
  if (nums.some((n) => !allowed.has(n))) return { body: "", source: "fallback" };
  return { body, source: "model" };
}

export function replyDraftQuiet(now: Date = new Date()): boolean {
  return isAlertQuietHours(now);
}
