/**
 * URL chips for search: cwelcc, openings, inclusive, meals, subsidy, lang.
 */

import { languageChipMatches } from "./inclusive-filters.ts";
import { hasAmenity } from "./licensing.ts";
import { confirmedFeeProgramBadge, listingSubsidy } from "./fee-program.ts";

export const PIONEER_LANGS = ["fr", "zh", "pa", "es", "ar", "tl", "uk", "it", "cr", "iu"] as const;
export type PioneerLang = (typeof PIONEER_LANGS)[number];

export const PIONEER_LANG_LABELS: Record<PioneerLang, { en: string; fr: string }> = {
  fr: { en: "French", fr: "Français" },
  zh: { en: "Mandarin", fr: "Mandarin" },
  pa: { en: "Punjabi", fr: "Pendjabi" },
  es: { en: "Spanish", fr: "Espagnol" },
  ar: { en: "Arabic", fr: "Arabe" },
  tl: { en: "Tagalog", fr: "Tagalog" },
  uk: { en: "Ukrainian", fr: "Ukrainien" },
  it: { en: "Italian", fr: "Italien" },
  cr: { en: "Cree", fr: "Cri" },
  iu: { en: "Inuktitut", fr: "Inuktitut" },
};

const DIET_KEYS = ["meals", "halal", "kosher", "nut-free", "vegetarian", "hot-meals"];

export type PioneerSearch = {
  cwelcc?: "1";
  openings?: "1";
  inclusive?: "1";
  meals?: "1";
  subsidy?: "1";
  lang?: string;
};

export type PioneerFilters = {
  cwelcc: boolean;
  openings: boolean;
  inclusive: boolean;
  meals: boolean;
  subsidy: boolean;
  langs: PioneerLang[];
};

function flag(value: unknown): "1" | undefined {
  if (value === "1" || value === 1 || value === true || value === "true") return "1";
  return undefined;
}

export function parsePioneerLangs(value: unknown): PioneerLang[] {
  const raw = Array.isArray(value) ? value.join(",") : typeof value === "string" ? value : "";
  const want = new Set(
    raw
      .split(/[,\s]+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
  return PIONEER_LANGS.filter((code) => want.has(code));
}

export function parsePioneerSearch(search: Record<string, unknown>): PioneerSearch {
  const out: PioneerSearch = {};
  const cwelcc = flag(search.cwelcc);
  const openings = flag(search.openings);
  const inclusive = flag(search.inclusive);
  const meals = flag(search.meals);
  const subsidy = flag(search.subsidy);
  const langs = parsePioneerLangs(search.lang);
  if (cwelcc) out.cwelcc = cwelcc;
  if (openings) out.openings = openings;
  if (inclusive) out.inclusive = inclusive;
  if (meals) out.meals = meals;
  if (subsidy) out.subsidy = subsidy;
  if (langs.length) out.lang = langs.join(",");
  return out;
}

export function pioneerFiltersFrom(search: PioneerSearch): PioneerFilters {
  return {
    cwelcc: search.cwelcc === "1",
    openings: search.openings === "1",
    inclusive: search.inclusive === "1",
    meals: search.meals === "1",
    subsidy: search.subsidy === "1",
    langs: parsePioneerLangs(search.lang),
  };
}

type Filterable = {
  amenities?: string | null;
  languages?: string | null;
  staffLanguages?: string[] | null;
  financial?: { subsidy?: boolean; meals?: boolean } | null;
  province?: string | null;
  feeProgram?: string | null;
  feeConfirmed?: boolean | null;
  availabilityKnown?: boolean | null;
  spotsInfant?: number | null;
  spotsToddler?: number | null;
  spotsPreschool?: number | null;
  spotsUpdatedAt?: string | null;
  lastVacancyUpdatedAt?: string | null;
};

function languageBlob(row: Filterable): string {
  const staff = Array.isArray(row.staffLanguages) ? row.staffLanguages.join(",") : "";
  return `${row.languages || ""},${staff}`.toLowerCase();
}

export function rowMatchesPioneer<T extends Filterable>(row: T, filters: PioneerFilters): boolean {
  if (filters.cwelcc && confirmedFeeProgramBadge(row as never) == null) return false;
  if (
    filters.inclusive &&
    !hasAmenity(row.amenities, "inclusive") &&
    !hasAmenity(row.amenities, "special-needs")
  ) {
    return false;
  }
  if (filters.meals) {
    const diet = DIET_KEYS.some((key) => hasAmenity(row.amenities, key)) || row.financial?.meals === true;
    if (!diet) return false;
  }
  if (filters.subsidy && listingSubsidy(row as never) == null && row.financial?.subsidy !== true && !hasAmenity(row.amenities, "subsidy")) {
    return false;
  }
  if (filters.langs.length) {
    const blob = languageBlob(row);
    const hit = filters.langs.some(
      (code) => languageChipMatches(blob, code) || blob.includes(PIONEER_LANG_LABELS[code].en.toLowerCase()),
    );
    if (!hit) return false;
  }
  return true;
}
