/** Listing-honesty photo pick. Official operator JPEGs beat /photos/wpg/; never Street View. */

export const LISTING_PLACEHOLDER = "/photos/storefront-placeholder-480.webp";

export function isOfficialBuildingPhoto(src: string | undefined): boolean {
  return Boolean(src && src.startsWith("/photos/buildings/") && !src.includes("..") && !src.includes("-logo"));
}

/** First non-logo photo; prefer official /photos/buildings/ over /photos/wpg/ or placeholders. */
export function listingThumb(photos: string[] | undefined) {
  const list = (photos ?? []).filter((p) => p && !p.includes("-logo"));
  const official = list.find((p) => isOfficialBuildingPhoto(p));
  return official || list[0] || LISTING_PLACEHOLDER;
}

/**
 * Storefront for a catalogue card.
 * Mapped IDs always use real-storefronts (/photos/buildings/{id}.jpg).
 * BuildingPhoto falls back to the placeholder if that JPEG is not on disk yet.
 * Unmapped IDs keep /photos/wpg/ or the placeholder — never invent a photo.
 */
export function resolveListingStorefront(
  id: string,
  officialById: Record<string, string>,
  wpgById: Record<string, string>,
): string {
  return officialById[id] || wpgById[id] || LISTING_PLACEHOLDER;
}

export function listingPhotosFor(
  id: string,
  rawPhotos: string[] | undefined,
  officialById: Record<string, string>,
  wpgById: Record<string, string>,
): string[] {
  const logos = (rawPhotos ?? []).filter((p) => p.includes("-logo"));
  return [resolveListingStorefront(id, officialById, wpgById), ...logos];
}
