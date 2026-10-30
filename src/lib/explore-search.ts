import { coerceSearchText } from "./search-query.ts";

export type ExploreSearchValues = {
  q?: string;
  name?: string;
  from?: string;
  to?: string;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function parseExploreSearchFields(s: Record<string, unknown>): ExploreSearchValues {
  const out: ExploreSearchValues = {};
  const q = coerceSearchText(s.q).slice(0, 160);
  if (q) out.q = q;
  const name = coerceSearchText(s.name).slice(0, 80);
  if (name) out.name = name;
  if (typeof s.from === "string" && isIsoDate(s.from)) out.from = s.from.trim();
  if (typeof s.to === "string" && isIsoDate(s.to)) out.to = s.to.trim();
  if (out.from && out.to && out.to < out.from) {
    const swap = out.from;
    out.from = out.to;
    out.to = swap;
  }
  return out;
}

/** Accent-folded, with saint / st / ste written out. Safe for French and English names. */
export function foldDaycareName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(ste|sainte)\.?\b/g, "sainte")
    .replace(/\b(st|saint)\.?\b/g, "saint")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(value: string) {
  const padded = `  ${value} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) out.add(padded.slice(i, i + 3));
  return out;
}

/** Dice score, close to pg_trgm similarity. 1 is the same string. */
export function daycareNameSimilarity(left: string, right: string) {
  const a = foldDaycareName(left);
  const b = foldDaycareName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const leftGrams = trigrams(a);
  const rightGrams = trigrams(b);
  let shared = 0;
  for (const gram of leftGrams) if (rightGrams.has(gram)) shared += 1;
  return (2 * shared) / (leftGrams.size + rightGrams.size);
}

const FUZZY_NAME_MIN = 5;
const FUZZY_NAME_SCORE = 0.45;

/** Every public name match. A name search does not drop centres outside the radius. */
export function filterByDaycareName<T extends { name: string; nameFr?: string | null }>(
  rows: readonly T[],
  name: string,
): T[] {
  const q = name.trim();
  if (!q) return [...rows];
  return rows.filter((row) => matchesDaycareName(row, q));
}

export function matchesDaycareName(
  item: { name: string; nameFr?: string | null },
  query: string,
): boolean {
  const q = foldDaycareName(query);
  if (!q) return true;
  const names = [item.name, item.nameFr ?? ""].map(foldDaycareName).filter(Boolean);
  if (names.some((name) => name.includes(q))) return true;
  if (q.length < FUZZY_NAME_MIN) return false;
  return names.some((name) => fuzzyNameTokens(q, name));
}

function fuzzyNameTokens(query: string, name: string) {
  const wanted = query.split(" ").filter((part) => part.length >= 2);
  const words = name.split(" ").filter((part) => part.length >= 2);
  if (!wanted.length || !words.length) return false;
  return wanted.every(
    (part) =>
      words.some(
        (word) => word.includes(part) || (part.length >= 4 && daycareNameSimilarity(part, word) >= FUZZY_NAME_SCORE),
      ),
  );
}

export const OPENING_HORIZON_DAYS = 14;

export function localIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** A near date can filter confirmed openings. Later dates are a start date only. */
export function dateAsksForOpenSpot(iso: string, now = new Date()): boolean {
  if (!isIsoDate(iso)) return false;
  const today = localIsoDate(now);
  if (iso < today) return false;
  const soon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + OPENING_HORIZON_DAYS);
  return iso <= localIsoDate(soon);
}

export function startWindowForDate(iso: string, now = new Date()): "now" | "this-month" | "next-month" {
  if (dateAsksForOpenSpot(iso, now)) return "now";
  const month = localIsoDate(now).slice(0, 7);
  if (iso.startsWith(month)) return "this-month";
  return "next-month";
}

export function formatExploreDateRange(from?: string, to?: string, locale = "en"): string {
  if (!from && !to) return "";
  const tag = locale === "fr" ? "fr-CA" : "en-CA";
  const fmt = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    if (!year || !month || !day) return iso;
    return new Date(year, month - 1, day).toLocaleDateString(tag, {
      month: "short",
      day: "numeric",
    });
  };
  if (from && to && from !== to) return `${fmt(from)} – ${fmt(to)}`;
  return fmt(from || to || "");
}

/** Name-search cards farther than this show the province and the kilometres. */
export const FAR_NAME_KM = 80;

/** Closest centre first. A name search does not prefer a complete card in another city. */
export function orderNameMatches<T extends { distanceKm: number; name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name));
}

/**
 * `live=1` in the URL. Also accept `true` and a quoted `"1"` from older links.
 * A number is what the router writes without extra quotes.
 */
export function readLiveSearchFlag(value: unknown): boolean {
  if (value === 1 || value === true || value === "1") return true;
  if (typeof value !== "string") return false;
  const bare = value.trim().replace(/^["']+|["']+$/g, "");
  return bare === "1";
}

/** On writes `live=1`. Off drops the param. */
export function liveSearchParam(on: boolean): 1 | undefined {
  return on ? 1 : undefined;
}

/** "{n} live · browse directory" splits so the second half can be a real link. */
export function splitLiveBrowseHint(hint: string): { count: string; browse: string } {
  const parts = hint.split(" · ");
  if (parts.length < 2) return { count: hint.trim(), browse: "" };
  return { count: parts[0]?.trim() || hint.trim(), browse: parts.slice(1).join(" · ").trim() };
}

/**
 * Licensed count stays on the line.
 * A live count is extra text, never a replacement for the centre count.
 */
export function licensedSearchCountLine(input: {
  nameSearch: boolean;
  liveCount: number;
  licensed: string;
  liveHint: string;
}): string {
  if (!input.nameSearch && input.liveCount > 0 && input.liveHint) {
    return `${input.licensed} · ${input.liveHint}`;
  }
  return input.licensed;
}

export function compactExploreSearch(values: {
  q?: string;
  name?: string;
  from?: string;
  to?: string;
}): ExploreSearchValues {
  const out: ExploreSearchValues = {};
  const q = values.q?.trim();
  const name = values.name?.trim();
  if (q) out.q = q;
  if (name) out.name = name.slice(0, 80);
  if (values.from && isIsoDate(values.from)) out.from = values.from;
  if (values.to && isIsoDate(values.to)) out.to = values.to;
  if (out.from && out.to && out.to < out.from) {
    const swap = out.from;
    out.from = out.to;
    out.to = swap;
  }
  return out;
}

/**
 * Guest hero is one field. A resolved place stays a location (`q`).
 * Unresolved text is a centre-name filter on existing /search listings.
 */
export function guestHeroSearch(
  raw: string,
  resolved?: { label: string } | null,
): ExploreSearchValues {
  const text = raw.trim();
  if (!text) return {};
  if (resolved?.label) return compactExploreSearch({ q: resolved.label });
  return compactExploreSearch({ name: text });
}
