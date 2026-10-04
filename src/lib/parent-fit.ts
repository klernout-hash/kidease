/**
 * Per-parent search rank. Guests do not use this score.
 * Missing facts add zero. Pro and featured pins are not inputs.
 * Node tests import this file. Relative imports only.
 */

import { distanceToSegmentKm } from "./commute-route.ts";
import { haversineKm, type LatLng } from "./geo.ts";

export const PARENT_FIT_WEIGHTS = {
  place: 30,
  age: 25,
  spots: 20,
  budget: 15,
  language: 5,
  subsidy: 5,
} as const;

const SPOT_HALF_LIFE_DAYS = 21;

export type ParentFitSubsidy = "ten" | "ten_max" | "qc_965" | "reduced";

export type ParentFitProfile = {
  guest: false;
  childAgeMonths?: number | null;
  home?: LatLng | null;
  work?: LatLng | null;
  radiusKm?: number;
  budgetMonthly?: number | null;
  languages?: string[];
  wantSubsidy?: boolean;
};

export type ParentFitListing = {
  lat: number;
  lng: number;
  agesKnown?: boolean | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  spotsInfant?: number | null;
  spotsToddler?: number | null;
  spotsPreschool?: number | null;
  lastVacancyUpdatedAt?: string | null;
  spotsUpdatedAt?: string | null;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  languages?: string | null;
  amenities?: string | null;
  subsidy?: ParentFitSubsidy | null;
};

export type ParentFitChip = { code: "place" | "age" | "spots" | "budget" | "language" | "subsidy"; en: string; fr: string };

const CHIP_ORDER: ParentFitChip["code"][] = ["age", "spots", "budget", "subsidy", "language", "place"];

export type ParentFitResult = {
  total: number;
  chips: ParentFitChip[];
};

const LANGS: Array<{ en: string; fr: string; words: string[] }> = [
  { en: "French", fr: "Français", words: ["fr", "french", "francais", "français"] },
  { en: "English", fr: "Anglais", words: ["en", "english", "anglais"] },
  { en: "Mandarin", fr: "Mandarin", words: ["zh", "mandarin", "chinese", "chinois"] },
  { en: "Cantonese", fr: "Cantonais", words: ["yue", "cantonese", "cantonais"] },
  { en: "Punjabi", fr: "Pendjabi", words: ["pa", "punjabi", "pendjabi"] },
  { en: "Spanish", fr: "Espagnol", words: ["es", "spanish", "espagnol", "español"] },
  { en: "Arabic", fr: "Arabe", words: ["ar", "arabic", "arabe"] },
  { en: "Tagalog", fr: "Tagalog", words: ["tl", "tagalog"] },
  { en: "Italian", fr: "Italien", words: ["it", "italian", "italien"] },
  { en: "German", fr: "Allemand", words: ["de", "german", "allemand"] },
];

export function parentFitApplies(profile: ParentFitProfile | null | undefined): profile is ParentFitProfile {
  return Boolean(profile && profile.guest === false);
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function point(value: LatLng | null | undefined): LatLng | null {
  if (!value || !finite(value.lat) || !finite(value.lng)) return null;
  return value;
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function positiveFee(value: number | null | undefined): number | null {
  if (!finite(value) || value <= 0) return null;
  return value;
}

function feeForChild(listing: ParentFitListing, months: number | null): number | null {
  if (months == null) return null;
  if (months < 18) return positiveFee(listing.infantMonthly);
  if (months < 36) return positiveFee(listing.toddlerMonthly);
  return positiveFee(listing.preschoolMonthly);
}

function spotsForChild(listing: ParentFitListing, months: number | null): number {
  const infant = Math.max(0, listing.spotsInfant ?? 0);
  const toddler = Math.max(0, listing.spotsToddler ?? 0);
  const preschool = Math.max(0, listing.spotsPreschool ?? 0);
  if (months == null) return infant + toddler + preschool;
  if (months < 18) return infant;
  if (months < 36) return toddler;
  return preschool;
}

function confirmAgeDays(listing: ParentFitListing, now: number): number | null {
  const raw = listing.lastVacancyUpdatedAt || listing.spotsUpdatedAt;
  if (!raw) return null;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return null;
  const days = (now - ts) / 86_400_000;
  if (days < 0) return null;
  return days;
}

function placeKm(listing: ParentFitListing, profile: ParentFitProfile): { km: number; corridor: boolean } | null {
  const home = point(profile.home);
  const work = point(profile.work);
  const here = { lat: listing.lat, lng: listing.lng };
  if (!finite(here.lat) || !finite(here.lng)) return null;
  if (home && work) return { km: distanceToSegmentKm(home, work, here), corridor: true };
  const origin = home || work;
  if (!origin) return null;
  return { km: haversineKm(origin, here), corridor: false };
}

function decay(km: number, halfLife: number): number {
  const half = Math.max(2, halfLife);
  return Math.exp((-Math.LN2 * Math.max(0, km)) / half);
}

function ageFits(listing: ParentFitListing, months: number): boolean {
  if (!listing.agesKnown) return false;
  const min = listing.ageMinMonths;
  const max = listing.ageMaxMonths;
  if (!finite(min) || !finite(max) || !(max > min) || !(max > 0)) return false;
  return months >= min && months <= max;
}

function hasWord(hay: string, word: string): boolean {
  const escaped = fold(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return false;
  return new RegExp(`(?:^|[^a-z])${escaped}(?:[^a-z]|$)`).test(hay);
}

function languageHit(listing: ParentFitListing, asked: string[]): { en: string; fr: string } | null {
  const hay = fold(`${listing.languages || ""} ${listing.amenities || ""}`);
  if (!hay.trim()) return null;
  for (const raw of asked) {
    const needle = fold(raw);
    if (!needle) continue;
    const known = LANGS.find((row) => row.words.some((word) => needle === fold(word)));
    if (known && known.words.some((word) => hasWord(hay, word))) return known;
    if (needle.length >= 3 && hasWord(hay, needle)) {
      const label = raw.trim().slice(0, 24);
      return { en: label, fr: label };
    }
  }
  return null;
}

function subsidyChip(kind: ParentFitSubsidy): { en: string; fr: string } {
  if (kind === "ten" || kind === "ten_max") return { en: "$10 a day", fr: "10 $ par jour" };
  if (kind === "qc_965") return { en: "$9.65 a day", fr: "9,65 $ par jour" };
  return { en: "Reduced fees", fr: "Frais réduits" };
}

function monthChip(months: number): { en: string; fr: string } {
  const n = Math.round(months);
  if (n === 1) return { en: "Takes 1 month", fr: "Accueille 1 mois" };
  return { en: `Takes ${n} months`, fr: `Accueille ${n} mois` };
}

export function parentFitScore(
  listing: ParentFitListing,
  profile: ParentFitProfile,
  now = Date.now(),
): ParentFitResult {
  const chips: ParentFitChip[] = [];
  let total = 0;
  const months = finite(profile.childAgeMonths) ? Math.max(0, Math.round(profile.childAgeMonths)) : null;

  const place = placeKm(listing, profile);
  if (place) {
    const half = place.corridor ? 4 : Math.max(2, (profile.radiusKm && profile.radiusKm > 0 ? profile.radiusKm : 25) * 0.6);
    const ratio = decay(place.km, half);
    total += ratio * PARENT_FIT_WEIGHTS.place;
    if (place.corridor && place.km <= 8) chips.push({ code: "place", en: "On your commute", fr: "Sur votre trajet" });
    else if (!place.corridor && place.km <= 8) chips.push({ code: "place", en: "Close to you", fr: "Près de chez vous" });
  }

  if (months != null && ageFits(listing, months)) {
    total += PARENT_FIT_WEIGHTS.age;
    chips.push({ code: "age", ...monthChip(months) });
  }

  const days = confirmAgeDays(listing, now);
  const spots = spotsForChild(listing, months);
  if (days != null && spots > 0) {
    const fresh = Math.max(0.2, Math.exp((-Math.LN2 * days) / SPOT_HALF_LIFE_DAYS));
    total += fresh * PARENT_FIT_WEIGHTS.spots;
    if (days <= 14) chips.push({ code: "spots", en: "Open spot confirmed", fr: "Place confirmée" });
    else chips.push({
      code: "spots",
      en: `Confirmed ${Math.floor(days)} days ago`,
      fr: `Confirmé il y a ${Math.floor(days)} jours`,
    });
  }

  const budget = finite(profile.budgetMonthly) && profile.budgetMonthly > 0 ? profile.budgetMonthly : null;
  const fee = budget != null ? feeForChild(listing, months) : null;
  if (budget != null && fee != null) {
    const ratio = fee <= budget ? 1 : Math.max(0, 1 - (fee - budget) / budget);
    total += ratio * PARENT_FIT_WEIGHTS.budget;
    if (fee <= budget) chips.push({ code: "budget", en: "Within your budget", fr: "Dans votre budget" });
  }

  const asked = (profile.languages ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 4);
  const language = asked.length ? languageHit(listing, asked) : null;
  if (language) {
    total += PARENT_FIT_WEIGHTS.language;
    chips.push({ code: "language", ...language });
  }

  if (profile.wantSubsidy && listing.subsidy) {
    total += PARENT_FIT_WEIGHTS.subsidy;
    chips.push({ code: "subsidy", ...subsidyChip(listing.subsidy) });
  }

  return {
    total: Math.max(0, Math.min(100, Math.round(total))),
    chips: chips
      .slice()
      .sort((a, b) => CHIP_ORDER.indexOf(a.code) - CHIP_ORDER.indexOf(b.code))
      .slice(0, 4),
  };
}

/** Signed-in parents. Guests return 0 so the caller keeps fresh-first order. */
export function compareParentFit(
  a: ParentFitListing,
  b: ParentFitListing,
  profile: ParentFitProfile | null | undefined,
  now = Date.now(),
): number {
  if (!parentFitApplies(profile)) return 0;
  return parentFitScore(b, profile, now).total - parentFitScore(a, profile, now).total;
}

function coord(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pin(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== "object") return null;
  const lat = coord((raw as { lat?: unknown }).lat);
  const lng = coord((raw as { lng?: unknown }).lng);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

/** Trust only a signed-in parent payload. Guests and junk become null. */
export function parseParentFit(raw: unknown): ParentFitProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.guest !== false) return null;
  const child = coord(row.childAgeMonths);
  const budget = coord(row.budgetMonthly);
  const radius = coord(row.radiusKm);
  const languages = Array.isArray(row.languages)
    ? row.languages.map((item) => String(item || "").trim().slice(0, 24)).filter(Boolean).slice(0, 4)
    : [];
  return {
    guest: false,
    childAgeMonths: child == null ? null : Math.max(0, Math.min(216, Math.round(child))),
    home: pin(row.home),
    work: pin(row.work),
    radiusKm: radius == null ? undefined : Math.max(1, Math.min(50, Math.round(radius))),
    budgetMonthly: budget == null || budget <= 0 ? null : Math.min(20000, Math.round(budget)),
    languages,
    wantSubsidy: row.wantSubsidy === true,
  };
}

export function parentFitCacheKey(profile: ParentFitProfile | null): string {
  if (!profile) return "";
  const home = profile.home ? `${profile.home.lat.toFixed(3)},${profile.home.lng.toFixed(3)}` : "";
  const work = profile.work ? `${profile.work.lat.toFixed(3)},${profile.work.lng.toFixed(3)}` : "";
  return [
    profile.childAgeMonths ?? "",
    profile.budgetMonthly ?? "",
    profile.wantSubsidy ? "1" : "",
    (profile.languages ?? []).join(","),
    home,
    work,
    profile.radiusKm ?? "",
  ].join("|");
}
