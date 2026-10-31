/**
 * Home feed by area, child age, and a start date the parent typed.
 * A start date never invents an opening. FEATURE_HOME_FEED defaults off.
 */

export const HOME_FEED_FLAG = "FEATURE_HOME_FEED";
export const ALSO_VIEWED_MIN = 5;

export type FeedEnv = Record<string, string | undefined>;

export type FeedPreference = {
  city: string;
  province: string;
  childAgeMonths: number | null;
  startDate: string | null;
};

export type FeedListing = {
  id: string;
  slug: string;
  name: string;
  city: string;
  province: string;
  agesKnown: boolean;
  ageMinMonths: number | null;
  ageMaxMonths: number | null;
};

export type FeedRank = FeedListing & { score: number };

function flagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function homeFeedEnabled(env?: FeedEnv): boolean {
  const bag = env ?? (typeof process !== "undefined" ? process.env : {});
  return flagOn(bag[HOME_FEED_FLAG]) || flagOn(bag[`VITE_${HOME_FEED_FLAG}`]);
}

export function cleanFeedPreference(input: Partial<FeedPreference> | null | undefined): FeedPreference | null {
  const city = String(input?.city || "").trim().slice(0, 80);
  const province = String(input?.province || "").trim().toUpperCase().slice(0, 2);
  if (!city || !/^[A-Z]{2}$/.test(province)) return null;
  const age = Number(input?.childAgeMonths);
  const childAgeMonths = Number.isFinite(age) && age >= 0 && age <= 216 ? Math.round(age) : null;
  const start = String(input?.startDate || "").trim();
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : null;
  return { city, province, childAgeMonths, startDate };
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Higher score first. Age counts only when the listing says the ages are known. */
export function rankHomeFeed(prefs: FeedPreference | null, listings: readonly FeedListing[]): FeedRank[] {
  if (!prefs) return [];
  const city = fold(prefs.city);
  const province = prefs.province.toUpperCase();
  const ranked: FeedRank[] = [];
  for (const row of listings) {
    if (!row.id || !row.name) continue;
    let score = 0;
    if (fold(row.city) === city) score += 20;
    if (row.province.toUpperCase() === province) score += 5;
    if (score === 0) continue;
    if (
      prefs.childAgeMonths != null &&
      row.agesKnown &&
      row.ageMinMonths != null &&
      row.ageMaxMonths != null &&
      prefs.childAgeMonths >= row.ageMinMonths &&
      prefs.childAgeMonths <= row.ageMaxMonths
    ) {
      score += 30;
    }
    if (score <= 0) continue;
    ranked.push({ ...row, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return ranked.slice(0, 12);
}

export type AlsoViewedRow = { listingId: string; city: string; viewers: number };

/** Same city, at least 5 viewers, not the listing you are on. No names. */
export function alsoViewed(input: {
  currentId: string;
  city: string;
  views: readonly AlsoViewedRow[];
}): string[] {
  const city = fold(input.city);
  if (!city) return [];
  return input.views
    .filter((row) => row.listingId !== input.currentId && fold(row.city) === city && row.viewers >= ALSO_VIEWED_MIN)
    .sort((a, b) => b.viewers - a.viewers || a.listingId.localeCompare(b.listingId))
    .slice(0, 6)
    .map((row) => row.listingId);
}
