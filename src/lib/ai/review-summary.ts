/**
 * Review points may only restate themes already in published parent reviews.
 * Fewer than 3 reviews means no summary. A fee or licence that is not in the
 * reviews is dropped.
 */

import { z } from "zod";
import { scrubText } from "./pii.ts";

export const REVIEW_SUMMARY_MIN = 3;

export const reviewSummarySchema = z
  .object({
    points: z.array(z.string().max(140)).max(3),
  })
  .strict();

export type ReviewSummaryModel = z.infer<typeof reviewSummarySchema>;

export const REVIEW_SUMMARY_SYSTEM = [
  "Summarize only themes that appear in these parent reviews.",
  "Return at most 3 short points.",
  "Do not invent a fee, a licence, a spot, a daycare, or a review.",
  "Reply with JSON only: {\"points\":[\"...\"]}.",
].join(" ");

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "they", "their", "have", "has", "was", "were", "are", "very",
  "really", "just", "les", "des", "une", "pour", "avec", "dans", "que", "qui", "est", "sont",
]);

export function reviewSummarySource(bodies: string[]): string {
  return scrubText(bodies.join(" "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôùûüç\s]/gi, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP.has(word));
}

export function groundReviewPoints(points: string[], source: string, count: number): string[] {
  if (count < REVIEW_SUMMARY_MIN || !source.trim()) return [];
  const allowed = new Set(source.match(/\d+/g) || []);
  const words = new Set(tokens(source));
  const kept: string[] = [];
  for (const raw of points) {
    if (kept.length >= 3) break;
    const text = String(raw || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 140) continue;
    if (/@/.test(text)) continue;
    if (/\$/.test(text) && !/\$/.test(source)) continue;
    if (/\b(licence number|license number)\b/i.test(text) && !/\b(licence number|license number)\b/i.test(source)) continue;
    const nums = text.match(/\d+/g) || [];
    if (nums.some((n) => !allowed.has(n))) continue;
    const pointWords = tokens(text);
    if (pointWords.length && !pointWords.some((word) => words.has(word))) continue;
    kept.push(text);
  }
  return kept;
}

export const REVIEW_SUMMARY_EVENTS = ["review_summary_shown", "review_summary_fallback"] as const;

export function reviewSummaryEventProps(input: { daycareId?: string; count?: number } = {}) {
  const id = String(input.daycareId || "").trim();
  const props: Record<string, string | number> = {};
  if (id && !id.includes("@")) props.daycare_id = id;
  if (typeof input.count === "number" && input.count >= 0) props.review_count = input.count;
  return props;
}
