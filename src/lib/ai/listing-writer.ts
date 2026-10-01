/**
 * Listing drafts may only restate the operator's notes and the website address on file.
 * A sentence that is not in that source is flagged, not published.
 */

import { z } from "zod";
import { scrubText } from "./pii.ts";

export const listingDraftSchema = z
  .object({
    description: z.string().max(600).optional(),
    programSummary: z.string().max(400).optional(),
    highlights: z.array(z.string().max(120)).max(5).optional(),
    unsourced: z.array(z.string().max(160)).max(8).optional(),
  })
  .strict();

export type ListingDraftModel = z.infer<typeof listingDraftSchema>;

export type ListingDraft = {
  description: string;
  programSummary: string;
  highlights: string[];
  unsourced: string[];
};

export const EMPTY_LISTING_DRAFT: ListingDraft = {
  description: "",
  programSummary: "",
  highlights: [],
  unsourced: [],
};

export const LISTING_WRITER_SYSTEM = [
  "Rewrite only the operator notes and website address you are given.",
  "Reply with JSON only.",
  "Keys: description, programSummary, highlights, unsourced.",
  "highlights is a short list of phrases copied or lightly reworded from the notes.",
  "Do not add a fee, licence, spot, review, rating, or program that is not in the notes.",
  "Do not describe the centre from outside knowledge.",
  "If a sentence is not supported, leave it out of description and highlights and put it in unsourced.",
  "If the notes are empty, return empty strings and an empty highlights list.",
].join(" ");

export function websiteOnFile(raw?: string | null): string {
  const value = String(raw ?? "").trim();
  if (!value || value.length > 300) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (!url.hostname.includes(".")) return "";
    if (url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "with", "our", "we", "is", "are", "at", "by", "from",
  "le", "la", "les", "de", "des", "et", "un", "une", "pour", "dans", "sur", "avec",
]);

const NEW_CLAIM = /\$|\b(?:licen[cs]e|spots?|reviews?|rated|rating|per month|\/month|montessori|reggio)\b/i;

export function listingWriterNotes(raw: string): string {
  return scrubText(raw).replace(/\s+/g, " ").trim().slice(0, 800);
}

export function listingWriterSource(website: string, notes: string): string {
  return [website.trim(), listingWriterNotes(notes)].filter(Boolean).join("\n").slice(0, 1200);
}

/** The model sees the website address and the notes. Nothing else. */
export function listingWriterModelUser(website: string, notes: string): string {
  const source = listingWriterSource(website, notes);
  return source ? `Website: ${website.trim() || "(none)"}\nNotes: ${listingWriterNotes(notes) || "(none)"}` : "";
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôùûüç\s]/gi, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP.has(word));
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function supported(sentence: string, sourceTokens: Set<string>, source: string): boolean {
  const claim = sentence.match(NEW_CLAIM);
  if (claim && !source.toLowerCase().includes(claim[0].toLowerCase())) return false;
  const words = tokens(sentence);
  if (!words.length) return true;
  return words.some((word) => sourceTokens.has(word));
}

export function groundListingDraft(raw: ListingDraftModel | null, source: string): ListingDraft {
  if (!raw || !source.trim()) return { ...EMPTY_LISTING_DRAFT };
  const sourceTokens = new Set(tokens(source));
  const unsourced = [...(raw.unsourced ?? [])].map((item) => item.trim()).filter(Boolean).slice(0, 8);
  const keep = (sentence: string) => {
    if (supported(sentence, sourceTokens, source)) return true;
    if (unsourced.length < 8) unsourced.push(sentence.slice(0, 160));
    return false;
  };
  const description = sentences(raw.description ?? "").filter(keep).join(" ").slice(0, 600);
  const programSummary = sentences(raw.programSummary ?? "").filter(keep).join(" ").slice(0, 400);
  const highlights = (raw.highlights ?? []).map((item) => item.trim()).filter(Boolean).filter(keep).slice(0, 5);
  return { description, programSummary, highlights, unsourced };
}

export const LISTING_WRITER_EVENTS = ["listing_writer_used", "listing_writer_published"] as const;

export function listingWriterEventProps(input: Record<string, unknown> = {}): Record<string, string> {
  const id = typeof input.daycare_id === "string" ? input.daycare_id.trim().slice(0, 80) : "";
  return id && !id.includes("@") ? { daycare_id: id } : {};
}
