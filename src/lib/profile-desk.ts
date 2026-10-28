/** Pure profile-desk facts. Empty or unconfirmed values stay null so the screen hides them. */

const FEATURE_KEYS = [
  "outdoor",
  "meals",
  "extended",
  "inclusive",
  "transit",
  "yard",
  "gym",
  "music",
  "nature",
  "bilingual",
  "french",
  "infant-room",
  "school-age",
  "evenings",
  "weekends",
  "park",
  "walkable",
] as const;

export type ProfileListingInput = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  hours: string | null;
  hoursFr: string | null;
  ageMinMonths: number | null;
  ageMaxMonths: number | null;
  agesConfirmed: boolean;
  languages: string | null;
  amenities: string | null;
  photos: string | null;
  licenseNumber: string | null;
  licenseStatus: string | null;
  spotsInfant: number | null;
  spotsToddler: number | null;
  spotsPreschool: number | null;
  vacancyUpdatedAt: string | null;
};

export type ProfileListingCard = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  photo: string | null;
  hours: string | null;
  hoursFr: string | null;
  ages: string | null;
  languages: string | null;
  spots: number | null;
  licensed: boolean;
  features: string[];
};

export function listingFeatureKeys(amenities: string | null | undefined): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const part of String(amenities || "").split(",")) {
    const key = part.trim();
    if (!key || seen.has(key) || !FEATURE_KEYS.includes(key as (typeof FEATURE_KEYS)[number])) continue;
    seen.add(key);
    keys.push(key);
    if (keys.length >= 8) break;
  }
  return keys;
}

export function confirmedSpots(input: Pick<ProfileListingInput, "spotsInfant" | "spotsToddler" | "spotsPreschool" | "vacancyUpdatedAt">): number | null {
  if (!String(input.vacancyUpdatedAt || "").trim()) return null;
  const parts = [input.spotsInfant, input.spotsToddler, input.spotsPreschool];
  let total = 0;
  for (const part of parts) {
    if (part == null || !Number.isFinite(Number(part))) return null;
    total += Number(part);
  }
  return total;
}

export function confirmedAges(input: Pick<ProfileListingInput, "ageMinMonths" | "ageMaxMonths" | "agesConfirmed">): string | null {
  if (!input.agesConfirmed) return null;
  const min = Number(input.ageMinMonths);
  const max = Number(input.ageMaxMonths);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= 0 || max < min) return null;
  return `${min}–${max}`;
}

function firstPhoto(raw: string | null): string | null {
  const photo = String(raw || "")
    .split(/[,\n]/)
    .map((part) => part.trim())
    .find((part) => part.startsWith("http://") || part.startsWith("https://") || part.startsWith("/"));
  return photo || null;
}

export function shapeProfileListing(input: ProfileListingInput): ProfileListingCard {
  const languages = input.languages?.trim() || null;
  const status = String(input.licenseStatus || "").toLowerCase();
  const licensed = Boolean(input.licenseNumber?.trim()) || status === "active" || status === "matched";
  return {
    id: input.id,
    slug: input.slug,
    name: input.name.trim(),
    city: input.city?.trim() || null,
    photo: firstPhoto(input.photos),
    hours: input.hours?.trim() || null,
    hoursFr: input.hoursFr?.trim() || null,
    ages: confirmedAges(input),
    languages,
    spots: confirmedSpots(input),
    licensed,
    features: listingFeatureKeys(input.amenities),
  };
}

export function sharedText(values: readonly (string | null)[]): string | null {
  if (!values.length) return null;
  const first = values[0];
  if (!first || !values.every((value) => value === first)) return null;
  return first;
}

export function sharedNumber(values: readonly (number | null)[]): number | null {
  if (!values.length) return null;
  const first = values[0];
  if (first == null || !values.every((value) => value === first)) return null;
  return first;
}

export function listingHours(listing: Pick<ProfileListingCard, "hours" | "hoursFr">, french: boolean): string | null {
  return french && listing.hoursFr ? listing.hoursFr : listing.hours;
}

export function uniqueLanguages(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 4) break;
  }
  return out;
}
