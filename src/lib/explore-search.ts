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
  if (typeof s.q === "string" && s.q.trim()) out.q = s.q.trim();
  if (typeof s.name === "string" && s.name.trim()) out.name = s.name.trim().slice(0, 80);
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
