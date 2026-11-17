/**
 * When a saved centre adds an open spot, tell parents whose child is that age.
 * A parent with no child age on file is not treated as a match and is not skipped.
 * One alert per parent per centre per day, and the same daily cap as saved-search alerts.
 * This file does not send mail, push, or SMS.
 */

import { OPEN_SPOT_DAILY_CAP } from "./spot-alert-match.ts";
import { spotAgeForMonths } from "./standard-age-groups.ts";

export type SpotBand = "infant" | "toddler" | "preschool";

export type SpotCounts = {
  infant: number;
  toddler: number;
  preschool: number;
};

export type SavedParentAges = {
  userId: string;
  /** null when no child birthdate is on file. An empty list is the same. */
  childMonths: number[] | null;
};

export type SavedCentreAgePlan = {
  matches: Array<{ userId: string; band: SpotBand }>;
  /** Child ages are on file and none of the new spots fit. */
  skipped: string[];
  capped: string[];
  /** No child age on file. The caller may send the general opening note. */
  unknown: string[];
};

function count(value: number): number {
  return Math.max(0, Math.round(value) || 0);
}

export function bandsThatOpened(before: SpotCounts, after: SpotCounts): SpotBand[] {
  const opened: SpotBand[] = [];
  if (count(after.infant) > count(before.infant)) opened.push("infant");
  if (count(after.toddler) > count(before.toddler)) opened.push("toddler");
  if (count(after.preschool) > count(before.preschool)) opened.push("preschool");
  return opened;
}

export function ageMonthsFromBirthdate(birthdate: string, at = new Date()): number | null {
  const day = String(birthdate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const born = new Date(`${day}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  let months = (at.getFullYear() - born.getFullYear()) * 12 + (at.getMonth() - born.getMonth());
  if (at.getDate() < born.getDate()) months -= 1;
  if (!Number.isFinite(months) || months < 0 || months > 216) return null;
  return months;
}

export function planSavedCentreAgeAlerts(input: {
  parents: readonly SavedParentAges[];
  opened: readonly SpotBand[];
  priorToday: readonly { userId: string }[];
  enabled: boolean;
  cap?: number;
}): SavedCentreAgePlan {
  const cap = input.cap ?? OPEN_SPOT_DAILY_CAP;
  const used = new Map<string, number>();
  for (const row of input.priorToday) {
    if (!row.userId) continue;
    used.set(row.userId, (used.get(row.userId) ?? 0) + 1);
  }
  const matches: SavedCentreAgePlan["matches"] = [];
  const skipped: string[] = [];
  const capped: string[] = [];
  const unknown: string[] = [];
  if (!input.enabled || input.opened.length === 0) {
    return { matches, skipped, capped, unknown: input.parents.map((row) => row.userId).filter(Boolean) };
  }
  const open = new Set(input.opened);
  for (const parent of input.parents) {
    if (!parent.userId) continue;
    const months = (parent.childMonths ?? []).filter((value) => Number.isFinite(value));
    if (months.length === 0) {
      unknown.push(parent.userId);
      continue;
    }
    const band = months.map((value) => spotAgeForMonths(value)).find((value) => value != null && open.has(value));
    if (!band) {
      skipped.push(parent.userId);
      continue;
    }
    const sent = used.get(parent.userId) ?? 0;
    if (sent >= cap) {
      capped.push(parent.userId);
      continue;
    }
    matches.push({ userId: parent.userId, band });
    used.set(parent.userId, sent + 1);
  }
  return { matches, skipped, capped, unknown };
}
