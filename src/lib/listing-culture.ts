/**
 * Optional languages & culture signals on a daycare listing.
 * Program / language / team-note only — never staff race or ethnicity.
 */

export const CULTURAL_TEAM_NOTE_MAX = 280;
export const CUSTOM_SIGNAL_MAX = 48;
const MAX_LIST = 24;

export type StaffLanguageOption = {
  id: string;
  en: string;
  fr: string;
};

/** Suggested staff languages. Custom / Indigenous names go in the free-text Other field. */
export const STAFF_LANGUAGE_OPTIONS: readonly StaffLanguageOption[] = [
  { id: "english", en: "English", fr: "Anglais" },
  { id: "french", en: "French", fr: "Français" },
  { id: "punjabi", en: "Punjabi", fr: "Pendjabi" },
  { id: "mandarin", en: "Mandarin", fr: "Mandarin" },
  { id: "cantonese", en: "Cantonese", fr: "Cantonais" },
  { id: "tagalog", en: "Tagalog", fr: "Tagalog" },
  { id: "arabic", en: "Arabic", fr: "Arabe" },
  { id: "spanish", en: "Spanish", fr: "Espagnol" },
  { id: "hindi", en: "Hindi", fr: "Hindi" },
  { id: "urdu", en: "Urdu", fr: "Ourdou" },
  { id: "korean", en: "Korean", fr: "Coréen" },
  { id: "vietnamese", en: "Vietnamese", fr: "Vietnamien" },
  { id: "portuguese", en: "Portuguese", fr: "Portugais" },
  { id: "ukrainian", en: "Ukrainian", fr: "Ukrainien" },
  { id: "polish", en: "Polish", fr: "Polonais" },
  { id: "somali", en: "Somali", fr: "Somali" },
];

export type CulturalProgramOption = {
  id: string;
  en: string;
  fr: string;
};

export const CULTURAL_PROGRAM_OPTIONS: readonly CulturalProgramOption[] = [
  { id: "bilingual", en: "Bilingual environment", fr: "Milieu bilingue" },
  { id: "indigenous-programming", en: "Indigenous programming", fr: "Programmation autochtone" },
  { id: "multicultural", en: "Multicultural celebrations", fr: "Célébrations multiculturelles" },
  { id: "faith-aware", en: "Faith-aware practices", fr: "Pratiques sensibles à la foi" },
  { id: "dietary", en: "Dietary cultural accommodations", fr: "Adaptations alimentaires culturelles" },
];

const STAFF_LANGUAGE_IDS = new Set(STAFF_LANGUAGE_OPTIONS.map((o) => o.id));
const CULTURAL_PROGRAM_IDS = new Set(CULTURAL_PROGRAM_OPTIONS.map((o) => o.id));

export function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeSignalList(value.map((item) => (typeof item === "string" ? item : "")));
  }
  if (typeof value !== "string") return [];
  const raw = value.trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      return parseStringList(JSON.parse(raw));
    } catch {
      /* fall through to comma list */
    }
  }
  return normalizeSignalList(raw.split(","));
}

export function normalizeSignalToken(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, CUSTOM_SIGNAL_MAX);
}

export function normalizeSignalList(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const token = normalizeSignalToken(value);
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
    if (out.length >= MAX_LIST) break;
  }
  return out;
}

export function normalizeStaffLanguages(values: readonly string[]): string[] {
  return normalizeSignalList(values).filter((token) => STAFF_LANGUAGE_IDS.has(token) || !CULTURAL_PROGRAM_IDS.has(token));
}

export function normalizeCulturalPrograms(values: readonly string[]): string[] {
  return normalizeSignalList(values);
}

export function normalizeCulturalTeamNote(value: string | null | undefined): string | null {
  const note = (value ?? "").trim().replace(/\s+/g, " ").slice(0, CULTURAL_TEAM_NOTE_MAX);
  return note || null;
}

export function staffLanguageLabel(id: string, locale: string) {
  const hit = STAFF_LANGUAGE_OPTIONS.find((o) => o.id === id);
  return hit ? (locale === "fr" ? hit.fr : hit.en) : id;
}

export function culturalProgramLabel(id: string, locale: string) {
  const hit = CULTURAL_PROGRAM_OPTIONS.find((o) => o.id === id);
  return hit ? (locale === "fr" ? hit.fr : hit.en) : id;
}

export function isPresetStaffLanguage(id: string) {
  return STAFF_LANGUAGE_IDS.has(id);
}

export function isPresetCulturalProgram(id: string) {
  return CULTURAL_PROGRAM_IDS.has(id);
}

export function listingCultureFrom(input: {
  staffLanguages?: unknown;
  culturalPrograms?: unknown;
  culturalTeamNote?: unknown;
  staff_languages?: unknown;
  cultural_programs?: unknown;
  cultural_team_note?: unknown;
}) {
  return {
    staffLanguages: parseStringList(input.staffLanguages ?? input.staff_languages),
    culturalPrograms: parseStringList(input.culturalPrograms ?? input.cultural_programs),
    culturalTeamNote: normalizeCulturalTeamNote(
      typeof input.culturalTeamNote === "string"
        ? input.culturalTeamNote
        : typeof input.cultural_team_note === "string"
          ? input.cultural_team_note
          : null,
    ),
  };
}

export function hasListingCulture(input: {
  staffLanguages?: readonly string[] | null;
  culturalPrograms?: readonly string[] | null;
  culturalTeamNote?: string | null;
}) {
  return (
    (input.staffLanguages?.length ?? 0) > 0 ||
    (input.culturalPrograms?.length ?? 0) > 0 ||
    Boolean(input.culturalTeamNote?.trim())
  );
}

export function cultureFieldsToSql(input: {
  staffLanguages?: readonly string[] | null;
  culturalPrograms?: readonly string[] | null;
  culturalTeamNote?: string | null;
}) {
  return {
    staffLanguagesJson: JSON.stringify(normalizeStaffLanguages(input.staffLanguages ?? [])),
    culturalProgramsJson: JSON.stringify(normalizeCulturalPrograms(input.culturalPrograms ?? [])),
    culturalTeamNote: normalizeCulturalTeamNote(input.culturalTeamNote),
  };
}
