/**
 * Vacancy confirm history and freshness bands for the public index.
 * Counts come only from stored timestamps and spot columns.
 * Relative imports so Node tests can load this file.
 */

import { jurisdiction } from "./province-registry.ts";

export const VACANCY_FRESH_DAYS = 14;
export const VACANCY_AGING_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const VACANCY_EVENT_SOURCES = ["confirm", "edit", "import"] as const;
export type VacancyEventSource = (typeof VACANCY_EVENT_SOURCES)[number];

export type FreshnessBand = "fresh" | "aging" | "stale" | "unknown";

export type FreshnessCounts = {
  fresh: number;
  aging: number;
  stale: number;
  unknown: number;
};

export type VacancySpotSnapshot = {
  infant: number | null;
  toddler: number | null;
  preschool: number | null;
};

export type OfficialOpeningTotal = {
  centres: number;
  openings: number;
  fetchedAt: string;
};

/** A province code from the registry, or "" when the query is not one. */
export function parseVacancyProvince(value: unknown): string {
  if (typeof value !== "string") return "";
  const found = jurisdiction(value.trim());
  return found ? found.code : "";
}

export function freshnessBand(iso: string | null | undefined, now = Date.now()): FreshnessBand {
  if (!iso) return "unknown";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "unknown";
  const age = now - ts;
  if (age < 0) return "fresh";
  const days = age / DAY_MS;
  if (days < VACANCY_FRESH_DAYS) return "fresh";
  if (days < VACANCY_AGING_DAYS) return "aging";
  return "stale";
}

export function emptyFreshness(): FreshnessCounts {
  return { fresh: 0, aging: 0, stale: 0, unknown: 0 };
}

export function countFreshness(stamps: readonly (string | null | undefined)[], now = Date.now()): FreshnessCounts {
  const counts = emptyFreshness();
  for (const stamp of stamps) {
    counts[freshnessBand(stamp, now)] += 1;
  }
  return counts;
}

export function freshnessByProvince(
  rows: readonly { province?: string | null; lastVacancyUpdatedAt?: string | null }[],
  now = Date.now(),
): Record<string, FreshnessCounts> {
  const out: Record<string, FreshnessCounts> = {};
  for (const row of rows) {
    const code = parseVacancyProvince(row.province);
    if (!code) continue;
    const bucket = out[code] ?? emptyFreshness();
    bucket[freshnessBand(row.lastVacancyUpdatedAt, now)] += 1;
    out[code] = bucket;
  }
  return out;
}

function spot(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export function sameVacancySnapshot(before: VacancySpotSnapshot, after: VacancySpotSnapshot): boolean {
  return (
    spot(before.infant) === spot(after.infant) &&
    spot(before.toddler) === spot(after.toddler) &&
    spot(before.preschool) === spot(after.preschool)
  );
}

/** A confirm or import always records. An edit records only when a spot count changed. */
export function shouldRecordVacancy(input: {
  source: VacancyEventSource;
  before?: VacancySpotSnapshot | null;
  after: VacancySpotSnapshot;
}): boolean {
  if (input.source === "confirm" || input.source === "import") return true;
  if (!input.before) return true;
  return !sameVacancySnapshot(input.before, input.after);
}

/**
 * Government file totals. Missing date, missing total, or zero matched centres
 * stay hidden. KidEase does not invent an opening count.
 */
export function officialOpeningTotal(input: {
  centres: number;
  openings: number | null;
  fetchedAt: string | null;
}): OfficialOpeningTotal | null {
  if (!Number.isFinite(input.centres) || input.centres <= 0) return null;
  if (input.openings == null || !Number.isFinite(input.openings) || input.openings < 0) return null;
  const fetchedAt = String(input.fetchedAt || "").trim();
  if (!fetchedAt || !Number.isFinite(Date.parse(fetchedAt))) return null;
  return { centres: Math.round(input.centres), openings: Math.round(input.openings), fetchedAt };
}
