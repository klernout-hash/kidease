/**
 * French listing drafts restate the English listing text already saved.
 * A number, fee, or licence that is not in that text is dropped.
 */

import { z } from "zod";
import { scrubText } from "./pii.ts";

export const translateSchema = z
  .object({
    french: z.string().max(600),
  })
  .strict();

export type TranslateModel = z.infer<typeof translateSchema>;

export const TRANSLATE_SYSTEM = [
  "Translate the listing text into French.",
  "Do not add a fee, a licence, a spot, a review, or any fact that is not in the text.",
  "Keep numbers that are already in the text.",
  "Reply with JSON only: {\"french\":\"...\"}.",
].join(" ");

export function translateSource(description: string, tagline: string): string {
  return scrubText([tagline, description].filter((part) => part.trim()).join(". "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

export function groundListingFrench(french: string | null, source: string): string {
  const text = String(french || "").replace(/\s+/g, " ").trim();
  if (!text || !source.trim() || text.length > 600) return "";
  if (/@/.test(text)) return "";
  if (/\b(licence number|license number)\b/i.test(text) && !/\b(licence number|license number)\b/i.test(source)) return "";
  if (/\$/.test(text) && !/\$/.test(source)) return "";
  const allowed = new Set(source.match(/\d+/g) || []);
  const nums = text.match(/\d+/g) || [];
  if (nums.some((n) => !allowed.has(n))) return "";
  return text;
}

export const TRANSLATE_EVENTS = ["translate_drafted", "translate_fallback"] as const;

export function translateEventProps(input: { daycareId?: string } = {}) {
  const id = String(input.daycareId || "").trim();
  if (!id || id.includes("@")) return {};
  return { daycare_id: id };
}
