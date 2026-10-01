/**
 * Smart match turns a quiz into search filters.
 * The model may only add filters. It never names, prices, or ranks a listing.
 */

import { scrubText } from "./pii.ts";
import { smartMatchNoteSchema, type SmartMatchNote } from "./smart-match-schema.ts";

export { smartMatchNoteSchema, type SmartMatchNote };

export const SMART_MATCH_AGES = ["any", "infant", "toddler", "preschool", "school-age"] as const;
export const SMART_MATCH_BUDGETS = ["any", "ten"] as const;
export type SmartMatchAge = (typeof SMART_MATCH_AGES)[number];
export type SmartMatchBudget = (typeof SMART_MATCH_BUDGETS)[number];
export type SmartMatchSchedule = "full" | "part";

export type SmartMatchQuiz = {
  age: SmartMatchAge;
  budget: SmartMatchBudget;
  french: boolean;
  fullTime: boolean;
  partTime: boolean;
  extraSupport: boolean;
  note: string;
};

export type SmartMatchFilters = {
  age: SmartMatchAge;
  budget: SmartMatchBudget;
  french: boolean;
  schedules: SmartMatchSchedule[];
  extraSupport: boolean;
};

export type MatchPlace = { lat: number; lng: number; label: string };

export type ResolvedMatchPlaces = {
  lat: number;
  lng: number;
  label: string;
  lat2?: number;
  lng2?: number;
};

const WHY_KEYS = new Set([
  "whyCloseHome",
  "whyCloseWork",
  "whyAgeInfant",
  "whyAgeToddler",
  "whyAgePreschool",
  "whyAgeSchool",
  "whySpotsToday",
  "whySpotsOne",
  "whySpotsDays",
  "whySubsidy",
  "whyHoursDays",
  "whyComplete",
  "whyClaim",
]);

const WHO_KEYS: Record<string, string> = {
  infant: "whySpotsWhoInfant",
  toddler: "whySpotsWhoToddler",
  preschool: "whySpotsWhoPreschool",
  "school-age": "whySpotsWhoSchool",
  any: "whySpotsWhoAny",
};

export type WhyPart = { key: string; who?: string; n?: string };

export const SMART_MATCH_EVENTS = [
  "smart_match_started",
  "smart_match_completed",
  "smart_match_result_clicked",
  "smart_match_applied",
] as const;

const EVENT_KEYS = new Set(["age_group", "budget", "result_count", "listing_id", "position"]);

export const SMART_MATCH_SYSTEM = [
  "Turn a parent note into search filters.",
  "Reply with JSON only.",
  "Allowed keys: age, budget, french, schedule, extraSupport.",
  "age is infant, toddler, preschool, school-age, or any.",
  "budget is ten or any. ten means the parent asked for the $10-a-day program only.",
  "schedule is full, part, or flexible.",
  "french and extraSupport are booleans.",
  "Do not name a daycare, city, price, licence, spot, review, or rank.",
  "If you are not sure, omit the key.",
].join(" ");

export function noteForModel(note: string): string {
  return scrubText(note).replace(/\s+/g, " ").trim().slice(0, 400);
}

/** The model sees the optional note only. Home, work, and the start date stay off this string. */
export function smartMatchModelUser(note: string): string {
  return noteForModel(note);
}

export function parseSmartMatchQuiz(input: unknown): SmartMatchQuiz {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const age = SMART_MATCH_AGES.includes(src.age as SmartMatchAge) ? (src.age as SmartMatchAge) : "any";
  const budget = src.budget === "ten" ? "ten" : "any";
  return {
    age,
    budget,
    french: src.french === true,
    fullTime: src.fullTime === true,
    partTime: src.partTime === true,
    extraSupport: src.extraSupport === true,
    note: noteForModel(typeof src.note === "string" ? src.note : ""),
  };
}

export function quizToFilters(quiz: SmartMatchQuiz): SmartMatchFilters {
  const schedules: SmartMatchSchedule[] = [];
  if (quiz.fullTime) schedules.push("full");
  if (quiz.partTime) schedules.push("part");
  return {
    age: quiz.age,
    budget: quiz.budget,
    french: quiz.french,
    schedules,
    extraSupport: quiz.extraSupport,
  };
}

function addSchedule(list: SmartMatchSchedule[], item: SmartMatchSchedule) {
  if (!list.includes(item)) list.push(item);
}

/** Quiz answers stay. A valid note may only add a tighter filter, never a listing. */
export function applyNoteFilters(base: SmartMatchFilters, note: SmartMatchNote | null): SmartMatchFilters {
  if (!note) return base;
  const next: SmartMatchFilters = { ...base, schedules: [...base.schedules] };
  if (note.age && note.age !== "any" && base.age === "any") next.age = note.age;
  if (note.budget === "ten") next.budget = "ten";
  if (note.french === true) next.french = true;
  if (note.extraSupport === true) next.extraSupport = true;
  if (note.schedule === "full" || note.schedule === "flexible") addSchedule(next.schedules, "full");
  if (note.schedule === "part" || note.schedule === "flexible") addSchedule(next.schedules, "part");
  return next;
}

export function filtersAfterModel(
  base: SmartMatchFilters,
  result: { ok: true; data: SmartMatchNote } | { ok: false },
): { filters: SmartMatchFilters; source: "quiz" | "note" } {
  if (!result.ok) return { filters: base, source: "quiz" };
  return { filters: applyNoteFilters(base, result.data), source: "note" };
}

export function parseNoteFilters(raw: unknown): SmartMatchNote | null {
  const parsed = smartMatchNoteSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function listed(amenities: string | null | undefined, key: string) {
  return (amenities || "")
    .split(",")
    .map((part) => part.trim())
    .includes(key);
}

export function listingMatchesMusts(
  listing: { amenities?: string | null; languages?: string | null },
  filters: SmartMatchFilters,
): boolean {
  if (filters.french) {
    const languages = listing.languages || "";
    const frenchListed = listed(listing.amenities, "french") || /\b(french|français|francais)\b/i.test(languages);
    if (!frenchListed) return false;
  }
  if (filters.extraSupport && !listed(listing.amenities, "inclusive")) return false;
  return true;
}

/** Keep the Best match order. Drop listings that do not list a requested must-have. */
export function pickSmartMatchResults<T extends { amenities?: string | null; languages?: string | null }>(
  ranked: T[],
  filters: SmartMatchFilters,
  limit = 10,
): T[] {
  return ranked.filter((item) => listingMatchesMusts(item, filters)).slice(0, Math.max(0, limit));
}

/**
 * Use a place only when lookup returns one. Never invent lat/lng.
 * Home wins. Work is the second pin when both are known, or the only pin when home is not.
 */
export function resolveMatchPlaces(
  home: string,
  work: string,
  lookup: (query: string) => MatchPlace | null,
): ResolvedMatchPlaces | null {
  const homeHit = home.trim() ? lookup(home) : null;
  const workHit = work.trim() ? lookup(work) : null;
  const origin = homeHit || workHit;
  if (!origin) return null;
  const both = Boolean(homeHit && workHit);
  return {
    lat: origin.lat,
    lng: origin.lng,
    label: origin.label,
    lat2: both ? workHit!.lat : undefined,
    lng2: both ? workHit!.lng : undefined,
  };
}

export function whyParts(reasons: Array<{ code: string; days?: number; age?: string }> | null | undefined): WhyPart[] {
  const out: WhyPart[] = [];
  for (const reason of reasons ?? []) {
    if (reason.code === "close_home") out.push({ key: "whyCloseHome" });
    else if (reason.code === "close_work") out.push({ key: "whyCloseWork" });
    else if (reason.code === "age_fit") {
      if (reason.age === "infant") out.push({ key: "whyAgeInfant" });
      else if (reason.age === "toddler") out.push({ key: "whyAgeToddler" });
      else if (reason.age === "preschool") out.push({ key: "whyAgePreschool" });
      else if (reason.age === "school-age") out.push({ key: "whyAgeSchool" });
    } else if (reason.code === "spots_fresh") {
      const who = WHO_KEYS[reason.age || "any"] ?? "whySpotsWhoAny";
      if (reason.days === 0) out.push({ key: "whySpotsToday", who });
      else if (reason.days === 1) out.push({ key: "whySpotsOne", who });
      else if (typeof reason.days === "number") out.push({ key: "whySpotsDays", who, n: String(reason.days) });
    } else if (reason.code === "subsidy") out.push({ key: "whySubsidy" });
    else if (reason.code === "hours_days") out.push({ key: "whyHoursDays" });
    else if (reason.code === "complete") out.push({ key: "whyComplete" });
    else if (reason.code === "claim_verified") out.push({ key: "whyClaim" });
  }
  return out.filter((part) => WHY_KEYS.has(part.key));
}

export function smartMatchEventProps(input: Record<string, unknown> = {}): Record<string, string | number> {
  const next: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!EVENT_KEYS.has(key) || value == null) continue;
    if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
    if (typeof value === "string") {
      const clean = value.trim().slice(0, 80);
      if (clean && !clean.includes("@") && !/\d{3}[-.\s]\d{3}/.test(clean)) next[key] = clean;
    }
  }
  return next;
}
