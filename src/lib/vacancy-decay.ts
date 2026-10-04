/**
 * Slow rank weight as a vacancy confirmation ages.
 * The factor never reaches 0, so a listing stays in search.
 * No paid plan, pin, or priority field is read here.
 */

import { vacancyStamp, type SpotStamp } from "./vacancy-rank.ts";

export const VACANCY_STALE_DAYS = 30;
export const VACANCY_DECAY_HALF_LIFE_DAYS = 45;
export const VACANCY_DECAY_FLOOR = 0.55;
/** Same number for every missing date, so unconfirmed listings keep their relative order. */
export const VACANCY_UNCONFIRMED_FACTOR = 0.8;

const DAY_MS = 24 * 60 * 60 * 1000;
const DECAY_TIE = 0.02;

export function vacancyAgeDays(item: SpotStamp, now = Date.now()): number | null {
  const stamp = vacancyStamp(item);
  if (!stamp) return null;
  const ts = Date.parse(stamp);
  if (!Number.isFinite(ts)) return null;
  const age = now - ts;
  if (age < 0) return 0;
  return age / DAY_MS;
}

/** 1 on the confirm day, about 0.63 at 30 days, floored at 0.55. Missing date is 0.8. */
export function vacancyDecayFactor(item: SpotStamp, now = Date.now()): number {
  const days = vacancyAgeDays(item, now);
  if (days == null) return VACANCY_UNCONFIRMED_FACTOR;
  const raw = Math.exp((-Math.LN2 * days) / VACANCY_DECAY_HALF_LIFE_DAYS);
  return Math.min(1, Math.max(VACANCY_DECAY_FLOOR, raw));
}

/** No confirm date, or the last confirm is 30 days old or more. */
export function vacancyUnconfirmed(item: SpotStamp, now = Date.now()): boolean {
  const days = vacancyAgeDays(item, now);
  if (days == null) return true;
  return days >= VACANCY_STALE_DAYS;
}

/** 1 when just confirmed, about 0.93 at the floor. Never 0. */
export function vacancyRankWeight(item: SpotStamp, now = Date.now()): number {
  const weight = 0.85 + 0.15 * vacancyDecayFactor(item, now);
  return weight > 0 ? weight : VACANCY_DECAY_FLOOR;
}

/** Higher (fresher) factor sorts first. A tiny gap stays a tie. */
export function compareVacancyDecay<T extends SpotStamp>(a: T, b: T, now = Date.now()): number {
  const delta = vacancyDecayFactor(b, now) - vacancyDecayFactor(a, now);
  if (Math.abs(delta) < DECAY_TIE) return 0;
  return delta;
}
