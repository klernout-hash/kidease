/**
 * Parent Urgency rank (0–100): how soon this centre can meet a parent's need.
 *
 * Start-date proximity, confirmed open spots, and reply speed when a sample exists.
 * Missing signals add zero — they are never invented.
 * Paid Pro / Network, featured-city, and promote pins never enter this rank.
 */

import { MIN_THREAD_SAMPLE } from "@/lib/quality";
import { vacancyFreshness, vacancyTimestamp } from "@/lib/listing-readiness";
import { spotsForAgeGroup, type ParentMatchInput } from "@/lib/parent-match";
import { parseAgeGroup } from "@/lib/care-type";

export const URGENCY_WEIGHTS = {
  startDate: 40,
  spots: 35,
  reply: 25,
} as const;

/** Same floor as quality reply-rate — hide speed until the sample is real. */
export const MIN_REPLY_SAMPLE = MIN_THREAD_SAMPLE;

export type ParentUrgencyPrefs = {
  startDate?: string | null;
  /** Parsed via `parseAgeGroup` — string chips must not fail tsc. */
  ageGroup?: string | null;
  now?: number;
};

export type ParentUrgencyInput = ParentMatchInput & {
  replyMedianHours?: number | null;
  replySample?: number;
};

export type ParentUrgencyBreakdown = {
  startDate: number;
  spots: number;
  reply: number;
  total: number;
};

function clampScore(n: number, max: number) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, Math.round(n));
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysUntilStart(startDate?: string | null, now = Date.now()): number | null {
  if (!startDate) return null;
  const raw = String(startDate).trim();
  if (!raw) return null;
  const iso = raw.length <= 7 ? `${raw}-01` : raw;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return Math.round((ts - now) / DAY_MS);
}

function startDatePoints(prefs: ParentUrgencyPrefs): number {
  const days = daysUntilStart(prefs.startDate, prefs.now);
  if (days == null) return 0;
  if (days <= 7) return URGENCY_WEIGHTS.startDate;
  if (days <= 21) return 28;
  if (days <= 45) return 16;
  if (days <= 90) return 8;
  return 3;
}

function spotPoints(item: ParentUrgencyInput, prefs: ParentUrgencyPrefs): number {
  const vacancy = vacancyFreshness(vacancyTimestamp(item), prefs.now);
  if (vacancy.kind === "unknown") return 0;
  const ageGroup = parseAgeGroup(prefs.ageGroup);
  const ageSpots = spotsForAgeGroup(item, ageGroup);
  const anySpots = spotsForAgeGroup(item, "any");
  if (vacancy.kind === "stale") {
    if (ageSpots > 0) return 14;
    if (anySpots > 0) return 8;
    return 4;
  }
  if (ageSpots > 0) return URGENCY_WEIGHTS.spots;
  if (anySpots > 0 && ageGroup !== "any") return 24;
  if (anySpots > 0) return URGENCY_WEIGHTS.spots;
  return 4;
}

function replyPoints(item: ParentUrgencyInput): number {
  const sample = Math.max(0, Math.floor(item.replySample ?? 0));
  const hours = item.replyMedianHours;
  if (sample < MIN_REPLY_SAMPLE) return 0;
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours < 0) return 0;
  if (hours <= 4) return URGENCY_WEIGHTS.reply;
  if (hours <= 12) return 20;
  if (hours <= 24) return 14;
  if (hours <= 48) return 8;
  return 3;
}

export function parentUrgencyBreakdown(
  item: ParentUrgencyInput,
  prefs: ParentUrgencyPrefs = {},
): ParentUrgencyBreakdown {
  const startDate = startDatePoints(prefs);
  const spots = spotPoints(item, prefs);
  const reply = replyPoints(item);
  return {
    startDate,
    spots,
    reply,
    total: clampScore(startDate + spots + reply, 100),
  };
}

/** Public 0–100 urgency. Paid pins are ignored. Missing start date or reply sample scores zero for that slice. */
export function parentUrgencyScore(item: ParentUrgencyInput, prefs: ParentUrgencyPrefs = {}): number {
  return parentUrgencyBreakdown(item, prefs).total;
}

export function compareParentUrgency(
  a: ParentUrgencyInput,
  b: ParentUrgencyInput,
  prefs: ParentUrgencyPrefs = {},
) {
  const delta = parentUrgencyScore(b, prefs) - parentUrgencyScore(a, prefs);
  if (delta !== 0) return delta;
  const kmA = typeof a.distanceKm === "number" ? a.distanceKm : 9e6;
  const kmB = typeof b.distanceKm === "number" ? b.distanceKm : 9e6;
  return kmA - kmB;
}

/** Soonest real start among the parent's open requests. Never invents a date. */
export function soonestStartDate(
  rows: Array<{ startDate?: string | null; startMonth?: string | null; status?: string | null }>,
  now = Date.now(),
): string | null {
  let best: { iso: string; days: number } | null = null;
  for (const row of rows) {
    const status = (row.status || "").toLowerCase();
    if (status === "declined" || status === "cancelled") continue;
    const raw = row.startDate || row.startMonth;
    const days = daysUntilStart(raw, now);
    if (days == null || !raw) continue;
    if (!best || days < best.days) best = { iso: String(raw), days };
  }
  return best?.iso ?? null;
}
