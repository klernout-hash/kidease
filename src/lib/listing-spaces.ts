import { facilityLabel, ROOM_ACCESS_IDS, ROOM_AMENITY_IDS } from "./daycare-facilities.ts";
import { managedListingPhotos } from "./listing-photo.ts";

/** Childcare spaces. Not bedrooms, bathrooms, or floor plans. */
export const LISTING_SPACE_TYPES = ["play", "nap", "meals", "outdoor", "entry", "care", "other"] as const;
export type ListingSpaceType = (typeof LISTING_SPACE_TYPES)[number];

export const SPACE_AMENITY_KEYS = ROOM_AMENITY_IDS;
export const SPACE_ACCESS_KEYS = ROOM_ACCESS_IDS;

export const MAX_LISTING_SPACES = 12;
export const MAX_SPACE_NAME = 60;

export const SPACE_DELETE_CONFIRM = "Confirm room deletion";
export const PHOTO_DELETE_CONFIRM = "Confirm photo removal";

export type ListingSpace = {
  id: string;
  name: string;
  spaceType: ListingSpaceType;
  amenities: string[];
  accessibility: string[];
  sort: number;
  photos: string[];
};

export type SpaceGroup = {
  cover: string;
  photos: string[];
  spaces: ListingSpace[];
  unassigned: string[];
};

const TYPE_LABEL: Record<ListingSpaceType, { en: string; fr: string }> = {
  play: { en: "Play room", fr: "Salle de jeu" },
  nap: { en: "Nap room", fr: "Salle de repos" },
  meals: { en: "Meals", fr: "Repas" },
  outdoor: { en: "Outdoor space", fr: "Espace extérieur" },
  entry: { en: "Entry", fr: "Entrée" },
  care: { en: "Care room", fr: "Salle de soins" },
  other: { en: "Other space", fr: "Autre espace" },
};

export function isListingSpaceType(value: string): value is ListingSpaceType {
  return (LISTING_SPACE_TYPES as readonly string[]).includes(value);
}

export function spaceTypeLabel(type: string, locale: string): string {
  const key = isListingSpaceType(type) ? type : "other";
  return TYPE_LABEL[key][locale === "fr" ? "fr" : "en"];
}

export function spaceAmenityLabel(key: string, locale: string): string {
  return facilityLabel(key, locale);
}

export function spaceAccessLabel(key: string, locale: string): string {
  return facilityLabel(key, locale);
}

export function cleanSpaceName(value: unknown): string {
  return String(value ?? "")
    .split("\0")
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SPACE_NAME);
}

export function allowKeys(value: unknown, allowed: readonly string[]): string[] {
  const list = Array.isArray(value) ? value : String(value ?? "").split(",");
  const next: string[] = [];
  for (const raw of list) {
    const key = String(raw ?? "").trim();
    if (!key || !allowed.includes(key) || next.includes(key)) continue;
    next.push(key);
  }
  return next;
}

export function normalizeSpaceInput(input: {
  name: unknown;
  spaceType: unknown;
  amenities?: unknown;
  accessibility?: unknown;
}): { ok: true; name: string; spaceType: ListingSpaceType; amenities: string[]; accessibility: string[] } | { ok: false; error: string } {
  const name = cleanSpaceName(input.name);
  if (!name) return { ok: false, error: "Enter a name for this room or space." };
  const spaceType = String(input.spaceType ?? "other").trim();
  if (!isListingSpaceType(spaceType)) return { ok: false, error: "Choose a space type." };
  return {
    ok: true,
    name,
    spaceType,
    amenities: allowKeys(input.amenities, SPACE_AMENITY_KEYS),
    accessibility: allowKeys(input.accessibility, SPACE_ACCESS_KEYS),
  };
}

/** Cover stays the first stored photo. A room only shows photos that are still on the listing. */
export function groupListingSpaces(rawPhotos: string | string[] | null | undefined, spaces: ListingSpace[]): SpaceGroup {
  const photos = managedListingPhotos(rawPhotos);
  const known = new Set(photos);
  const used = new Set<string>();
  const next = spaces
    .slice()
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((space) => {
      const assigned = space.photos.filter((src) => known.has(src) && !used.has(src));
      for (const src of assigned) used.add(src);
      return { ...space, photos: assigned };
    });
  return {
    cover: photos[0] ?? "",
    photos,
    spaces: next,
    unassigned: photos.filter((src) => !used.has(src)),
  };
}

/** Dropped srcs need an explicit confirm. Order-only changes do not. */
export function photoRemovalNeedsConfirm(before: readonly string[], after: readonly string[]): string[] {
  const kept = new Set(after);
  return before.filter((src) => src && !kept.has(src));
}
