/**
 * Mobile Home search (Where, When, Who).
 * Pure helpers: no React, no Google, no network.
 * URL fields are the ones Explore already understands.
 */

import { localIsoDate } from "./explore-search.ts";
import { geocode } from "./geo.ts";
import { suggestLocalPlaces } from "./place-suggest.ts";

export const MOBILE_SEARCH_FLAG = "FEATURE_MOBILE_SEARCH_V2";

export const MOBILE_SEARCH_STEPS = ["where", "when", "who"] as const;
export type MobileSearchStep = (typeof MOBILE_SEARCH_STEPS)[number];

export const MOBILE_CATEGORIES = ["all", "centre", "home", "open", "before-after", "french"] as const;
export type MobileCategory = (typeof MOBILE_CATEGORIES)[number];

export const DATE_FLEX = ["exact", "two-weeks", "month", "school-year"] as const;
export type DateFlex = (typeof DATE_FLEX)[number];

export const SCHEDULES = ["full-time", "part-time", "before-after", "drop-in"] as const;
export type ScheduleChoice = (typeof SCHEDULES)[number];

export const CHILD_BANDS = ["infant", "toddler", "preschool", "school-age"] as const;
export type ChildBand = (typeof CHILD_BANDS)[number];

export type ChildCounts = Record<ChildBand, number>;

export type MobileSearchDraft = {
  step: MobileSearchStep;
  where: string;
  nearMe: boolean;
  from: string;
  to: string;
  dateFlex: DateFlex | "";
  schedule: ScheduleChoice | "";
  counts: ChildCounts;
  subsidy: boolean;
  accessibility: boolean;
  french: boolean;
  category: MobileCategory;
};

export type SavedMobileSearch = {
  where: string;
  from: string;
  schedule: ScheduleChoice | "";
  counts: ChildCounts;
  at: string;
};

export type MobileSearchParams = {
  q?: string;
  from?: string;
  to?: string;
  age?: string;
  ages?: string;
  sched?: string;
  fac?: string;
  cat?: "before-after";
  openings?: "1";
  subsidy?: "1";
  inclusive?: "1";
  spoken?: string;
};

/** Editing Where/When/Who must not erase the advanced filters already applied. */
export function mergeMobileSearchParams(previous: Record<string, unknown>, next: MobileSearchParams) {
  const keys = ["q", "from", "to", "age", "ages", "sched", "fac", "cat", "openings", "subsidy", "inclusive", "spoken"] as const;
  const applied = Object.fromEntries(keys.map((key) => [key, typeof previous[key] === "string" ? previous[key] : undefined]));
  const represented = mobileSearchParams(draftFromParams(applied));
  const merged: Record<string, unknown> = { ...previous, page: undefined };
  for (const key of keys) {
    // Preserve choices this smaller sheet cannot represent, such as multiple
    // facility types or languages, until their actual filter is changed.
    if (next[key] === represented[key]) continue;
    if (key === "spoken") {
      const others = String(previous.spoken || "").split(",").filter((language) => language && language !== "fr");
      merged.spoken = [...others, ...(next.spoken === "fr" ? ["fr"] : [])].join(",") || undefined;
    } else {
      merged[key] = next[key];
    }
  }
  return merged;
}

const RECENT_KEY = "kidease-mobile-search-v2";
const RECENT_LIMIT = 5;

const AGE_SHORT = {
  en: { infant: "0–18 mo", toddler: "2 yrs", preschool: "4 yrs", "school-age": "6 yrs" },
  fr: { infant: "0–18 mois", toddler: "2 ans", preschool: "4 ans", "school-age": "6 ans" },
} as const;

export function emptyCounts(): ChildCounts {
  return { infant: 0, toddler: 0, preschool: 0, "school-age": 0 };
}

export function emptyMobileSearch(): MobileSearchDraft {
  return {
    step: "where",
    where: "",
    nearMe: false,
    from: "",
    to: "",
    dateFlex: "",
    schedule: "",
    counts: emptyCounts(),
    subsidy: false,
    accessibility: false,
    french: false,
    category: "all",
  };
}

export function isMobileSearchStep(value: string): value is MobileSearchStep {
  return (MOBILE_SEARCH_STEPS as readonly string[]).includes(value);
}

export function childTotal(counts: ChildCounts): number {
  return CHILD_BANDS.reduce((sum, band) => sum + Math.max(0, counts[band] || 0), 0);
}

export function setStep(draft: MobileSearchDraft, step: MobileSearchStep): MobileSearchDraft {
  return { ...draft, step };
}

export function nextStep(step: MobileSearchStep): MobileSearchStep | "search" {
  if (step === "where") return "when";
  if (step === "when") return "who";
  return "search";
}

export function clampCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(6, Math.floor(value)));
}

export function changeCount(draft: MobileSearchDraft, band: ChildBand, delta: number): MobileSearchDraft {
  const next = clampCount((draft.counts[band] || 0) + delta);
  return { ...draft, counts: { ...draft.counts, [band]: next } };
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

/** School year runs 1 Sept–30 June. July and August use the year that starts this September. */
export function schoolYearWindow(now = new Date()): { from: string; to: string } {
  const month = now.getMonth();
  const year = now.getFullYear();
  const startYear = month >= 8 ? year : month >= 6 ? year : year - 1;
  const start = new Date(startYear, 8, 1);
  const end = new Date(startYear + 1, 5, 30);
  const from = start.getTime() > now.getTime() ? localIsoDate(start) : localIsoDate(now);
  return { from, to: localIsoDate(end) };
}

export function applyDateFlex(draft: MobileSearchDraft, flex: DateFlex, now = new Date()): MobileSearchDraft {
  const today = localIsoDate(now);
  if (flex === "exact") return { ...draft, dateFlex: "exact" };
  if (flex === "two-weeks") return { ...draft, dateFlex: flex, from: today, to: addDays(today, 14) };
  if (flex === "month") return { ...draft, dateFlex: flex, from: today, to: addDays(today, 30) };
  const year = schoolYearWindow(now);
  return { ...draft, dateFlex: flex, from: year.from, to: year.to };
}

export function pickStartDate(draft: MobileSearchDraft, iso: string): MobileSearchDraft {
  return { ...draft, dateFlex: "exact", from: iso, to: "" };
}

function localeTag(locale: string): "fr" | "en" {
  return locale === "fr" ? "fr" : "en";
}

function formatDay(iso: string, locale: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const date = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    month: "short",
    day: "numeric",
  }).format(date);
}

const SCHEDULE_LABEL = {
  en: {
    "full-time": "Full-time",
    "part-time": "Part-time",
    "before-after": "Before/after school",
    "drop-in": "Drop-in",
  },
  fr: {
    "full-time": "Temps plein",
    "part-time": "Temps partiel",
    "before-after": "Avant et après l’école",
    "drop-in": "Occasionnel",
  },
} as const;

export function whereAnswer(draft: MobileSearchDraft): string {
  return draft.where.trim();
}

export function whenAnswer(draft: MobileSearchDraft, locale = "en"): string {
  const tag = localeTag(locale);
  const day = draft.from ? formatDay(draft.from, tag) : "";
  const start = day ? (tag === "fr" ? `Dès le ${day}` : `Starts ${day}`) : "";
  const sched = draft.schedule ? SCHEDULE_LABEL[tag][draft.schedule] : "";
  return [start, sched].filter(Boolean).join(", ");
}

export function whoAnswer(draft: MobileSearchDraft, locale = "en"): string {
  const total = childTotal(draft.counts);
  if (total <= 0) return "";
  const tag = localeTag(locale);
  const bands = CHILD_BANDS.filter((band) => draft.counts[band] > 0);
  if (total === 1 && bands.length === 1) {
    const age = AGE_SHORT[tag][bands[0]];
    return tag === "fr" ? `1 enfant, ${age}` : `1 child, ${age}`;
  }
  return tag === "fr" ? `${total} enfants` : `${total} children`;
}

export function resultsHeadline(where: string, locale = "en"): string {
  const place = where.trim();
  if (!place) return locale === "fr" ? "Garderies" : "Child care";
  return locale === "fr" ? `Garderies à ${place}` : `Child care in ${place}`;
}

export function resultsSubline(draft: MobileSearchDraft, locale = "en"): string {
  const tag = localeTag(locale);
  const day = draft.from ? formatDay(draft.from, tag) : "";
  const start = day ? (tag === "fr" ? `Dès le ${day}` : `Starts ${day}`) : "";
  const sched = draft.schedule ? SCHEDULE_LABEL[tag][draft.schedule] : "";
  const who = whoAnswer(draft, locale);
  return [start, sched, who].filter(Boolean).join(" · ");
}

function ageCsv(counts: ChildCounts): string | undefined {
  const bands = CHILD_BANDS.filter((band) => counts[band] > 0);
  return bands.length ? bands.join(",") : undefined;
}

/**
 * Existing Explore params only. Ranking stays distance, age, and spot freshness.
 * Nothing here is a paid placement.
 */
export function mobileSearchParams(draft: MobileSearchDraft, nearLabel = ""): MobileSearchParams {
  const out: MobileSearchParams = {};
  const q = (draft.nearMe ? nearLabel || draft.where : draft.where).trim();
  if (q) out.q = q;
  if (draft.from) out.from = draft.from;
  if (draft.to) out.to = draft.to;
  const ages = ageCsv(draft.counts);
  if (ages) {
    out.age = ages;
    out.ages = ages;
  }
  if (draft.schedule === "full-time") out.sched = "full";
  else if (draft.schedule === "part-time") out.sched = "part";
  else if (draft.schedule === "drop-in") out.sched = "flexible";
  else if (draft.schedule === "before-after") out.cat = "before-after";
  if (draft.category === "centre") out.fac = "child_care_centre";
  else if (draft.category === "home") out.fac = "family_home";
  else if (draft.category === "open") out.openings = "1";
  else if (draft.category === "before-after") out.cat = "before-after";
  else if (draft.category === "french") out.spoken = "fr";
  if (draft.subsidy) out.subsidy = "1";
  if (draft.accessibility) out.inclusive = "1";
  if (draft.french) out.spoken = "fr";
  return out;
}

export function draftFromParams(input: {
  q?: string;
  from?: string;
  to?: string;
  age?: string;
  ages?: string;
  sched?: string;
  fac?: string;
  cat?: string;
  openings?: string;
  subsidy?: string;
  inclusive?: string;
  spoken?: string;
}): MobileSearchDraft {
  const draft = emptyMobileSearch();
  draft.where = (input.q || "").trim();
  draft.from = input.from || "";
  draft.to = input.to || "";
  if (draft.from && draft.to) draft.dateFlex = "two-weeks";
  else if (draft.from) draft.dateFlex = "exact";
  if (input.sched === "full") draft.schedule = "full-time";
  else if (input.sched === "part") draft.schedule = "part-time";
  else if (input.sched === "flexible") draft.schedule = "drop-in";
  if (input.cat === "before-after") draft.category = "before-after";
  if (input.fac === "child_care_centre") draft.category = "centre";
  else if (input.fac === "family_home") draft.category = "home";
  if (input.openings === "1") draft.category = "open";
  const ages = `${input.ages || ""},${input.age || ""}`.split(",").map((part) => part.trim());
  for (const band of CHILD_BANDS) {
    if (ages.includes(band)) draft.counts[band] = 1;
  }
  draft.subsidy = input.subsidy === "1";
  draft.accessibility = input.inclusive === "1";
  draft.french = (input.spoken || "").split(",").includes("fr");
  if (draft.french && draft.category === "all") draft.category = "french";
  return draft;
}

export type WhereSuggestion = { label: string; secondary: string };

/** City and postal matches from KidEase's own index. No paid place lookup. */
export function localWhereSuggestions(query: string, limit = 6): WhereSuggestion[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = suggestLocalPlaces(q, limit).map((row) => ({
    label: row.label,
    secondary: row.secondary,
  }));
  const hit = geocode(q);
  if (hit && !rows.some((row) => row.label.toLowerCase() === hit.label.toLowerCase())) {
    return [{ label: hit.label, secondary: "" }, ...rows].slice(0, limit);
  }
  return rows.slice(0, limit);
}

export function rememberMobileSearch(
  current: readonly SavedMobileSearch[],
  draft: MobileSearchDraft,
  at = new Date().toISOString(),
): SavedMobileSearch[] {
  const where = draft.where.trim().replace(/\s+/g, " ").slice(0, 80);
  if (where.length < 2) return [...current];
  const next: SavedMobileSearch = {
    where,
    from: draft.from,
    schedule: draft.schedule,
    counts: { ...draft.counts },
    at,
  };
  return [next, ...current.filter((item) => item.where.toLowerCase() !== where.toLowerCase())].slice(0, RECENT_LIMIT);
}

export function readMobileSearches(): SavedMobileSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => normalizeSaved(item)).slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function writeMobileSearches(items: readonly SavedMobileSearch[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, RECENT_LIMIT)));
  } catch {
    /* private mode */
  }
}

function normalizeSaved(item: unknown): SavedMobileSearch[] {
  if (!item || typeof item !== "object") return [];
  const row = item as Partial<SavedMobileSearch>;
  const where = typeof row.where === "string" ? row.where.trim() : "";
  if (where.length < 2) return [];
  const counts = emptyCounts();
  const rawCounts = row.counts;
  if (rawCounts && typeof rawCounts === "object") {
    for (const band of CHILD_BANDS) {
      const value = (rawCounts as ChildCounts)[band];
      counts[band] = clampCount(typeof value === "number" ? value : 0);
    }
  }
  const schedule = SCHEDULES.includes(row.schedule as ScheduleChoice) ? (row.schedule as ScheduleChoice) : "";
  return [
    {
      where: where.slice(0, 80),
      from: typeof row.from === "string" ? row.from : "",
      schedule,
      counts,
      at: typeof row.at === "string" ? row.at : new Date(0).toISOString(),
    },
  ];
}

export function savedToDraft(saved: SavedMobileSearch): MobileSearchDraft {
  return {
    ...emptyMobileSearch(),
    where: saved.where,
    from: saved.from,
    dateFlex: saved.from ? "exact" : "",
    schedule: saved.schedule,
    counts: { ...saved.counts },
    step: "where",
  };
}
