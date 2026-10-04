/**
 * Public vacancy window and the search tie-break.
 * No paid plan, pin, or priority field is read here.
 */

export const VACANCY_OUT_OF_DATE_MS = 30 * 24 * 60 * 60 * 1000;
export const VACANCY_UPDATED_THIS_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type SpotStamp = {
  spotsTotal?: number | null;
  spotsInfant?: number | null;
  spotsToddler?: number | null;
  spotsPreschool?: number | null;
  lastVacancyUpdatedAt?: string | null;
  spotsUpdatedAt?: string | null;
};

export function openSpotCount(item: SpotStamp): number {
  if (typeof item.spotsTotal === "number" && Number.isFinite(item.spotsTotal)) {
    return Math.max(0, item.spotsTotal);
  }
  return Math.max(0, (item.spotsInfant ?? 0) + (item.spotsToddler ?? 0) + (item.spotsPreschool ?? 0));
}

export function vacancyStamp(item: SpotStamp): string | null {
  return item.lastVacancyUpdatedAt ?? item.spotsUpdatedAt ?? null;
}

function vacancyAgeMs(updatedAt: string | null | undefined, now: number): number | null {
  if (!updatedAt) return null;
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return null;
  return now - ts;
}

/** Confirmed open spots whose timestamp is inside the last 30 days. */
export function openSpotsConfirmedRecently(item: SpotStamp, now = Date.now()): boolean {
  if (openSpotCount(item) <= 0) return false;
  const age = vacancyAgeMs(vacancyStamp(item), now);
  if (age == null || age < 0) return false;
  return age <= VACANCY_OUT_OF_DATE_MS;
}

/** Tie-break only. Call this after relevance and trust. */
export function compareFreshOpenSpots<T extends SpotStamp>(a: T, b: T, now = Date.now()): number {
  const aFresh = openSpotsConfirmedRecently(a, now);
  const bFresh = openSpotsConfirmedRecently(b, now);
  if (aFresh === bFresh) return 0;
  return aFresh ? -1 : 1;
}

export function vacancyUpdatedThisWeek(item: SpotStamp, now = Date.now()): boolean {
  const age = vacancyAgeMs(vacancyStamp(item), now);
  if (age == null || age < 0) return false;
  return age <= VACANCY_UPDATED_THIS_WEEK_MS;
}

/** Unknown stays unknown. Older than 30 days is out of date. */
export function vacancyPublicWindow(
  updatedAt?: string | null,
  now = Date.now(),
): "unknown" | "recent" | "out_of_date" {
  const age = vacancyAgeMs(updatedAt, now);
  if (age == null || age < 0) return "unknown";
  return age > VACANCY_OUT_OF_DATE_MS ? "out_of_date" : "recent";
}
