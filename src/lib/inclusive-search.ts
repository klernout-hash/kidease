/**
 * Diet and extra-support search. A listing matches only when the centre
 * stored that exact key. Words in a description do not count.
 * scripts/inclusive-search.test.mjs loads this file in Node.
 */
import {
  CARE_DETAIL_KEYS,
  careDetailLabel,
  isCareDetailKey,
  rowHasCareDetail,
  type CareDetailKey,
} from "./inclusive-filters.ts";

export type { CareDetailKey };

export const CARE_DECLARATION_NOTE = {
  en: "The centre says it offers these. KidEase has not checked them.",
  fr: "Le centre déclare ces services. KidEase ne les a pas vérifiés.",
} as const;

export function careChipsWhen(flagOn: boolean): readonly CareDetailKey[] {
  return flagOn ? CARE_DETAIL_KEYS : [];
}

export function parseCareKeys(value: unknown): CareDetailKey[] {
  const raw = Array.isArray(value) ? value.join(",") : typeof value === "string" ? value : "";
  const seen = new Set<CareDetailKey>();
  for (const part of raw.split(",")) {
    const key = part.trim().toLowerCase();
    if (isCareDetailKey(key)) seen.add(key);
  }
  return CARE_DETAIL_KEYS.filter((key) => seen.has(key));
}

/** Every selected key must be an exact declared token. No selection matches all. */
export function matchesDeclaredCare(amenities: string | null | undefined, keys: readonly string[]): boolean {
  const selected = parseCareKeys(keys.join(","));
  if (!selected.length) return true;
  return selected.every((key) => rowHasCareDetail(amenities, key));
}

export function careChipLabel(key: CareDetailKey, locale: "en" | "fr"): string {
  return careDetailLabel(key, locale);
}
