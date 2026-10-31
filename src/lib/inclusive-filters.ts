/**
 * Structured care details a centre can publish: diet and extra support.
 * Search already reads amenity words. These keys are the structured set.
 */

export const CARE_DETAIL_KEYS = ["halal", "kosher", "nut-free", "vegetarian", "special-needs"] as const;
export type CareDetailKey = (typeof CARE_DETAIL_KEYS)[number];

export const CARE_DETAIL_LABELS: Record<CareDetailKey, { en: string; fr: string }> = {
  halal: { en: "Halal meals", fr: "Repas halal" },
  kosher: { en: "Kosher meals", fr: "Repas casher" },
  "nut-free": { en: "Nut-free", fr: "Sans noix" },
  vegetarian: { en: "Vegetarian meals", fr: "Repas végétariens" },
  "special-needs": { en: "Extra support", fr: "Soutien supplémentaire" },
};

const LANG_ALIASES: Record<string, string[]> = {
  fr: ["french", "français", "francais"],
  zh: ["mandarin", "chinese", "chinois"],
  pa: ["punjabi", "pendjabi"],
  es: ["spanish", "espagnol"],
  ar: ["arabic", "arabe"],
  tl: ["tagalog"],
  uk: ["ukrainian", "ukrainien"],
  it: ["italian", "italien"],
  cr: ["cree", "cri"],
  iu: ["inuktitut"],
};

export function isCareDetailKey(value: string): value is CareDetailKey {
  return (CARE_DETAIL_KEYS as readonly string[]).includes(value);
}

export function careDetailLabel(key: CareDetailKey, locale: "en" | "fr"): string {
  return CARE_DETAIL_LABELS[key][locale];
}

/** A language chip matches the code or a plain-language name on the profile. */
export function languageChipMatches(blob: string, code: string): boolean {
  const text = blob.toLowerCase();
  if (text.includes(code)) return true;
  const names = LANG_ALIASES[code] ?? [];
  return names.some((name) => text.includes(name));
}

export function rowHasCareDetail(amenities: string | null | undefined, key: CareDetailKey): boolean {
  return (amenities || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .includes(key);
}
