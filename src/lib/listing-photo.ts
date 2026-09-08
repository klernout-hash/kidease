/** Listing-honesty photo pick. Official operator JPEGs beat /photos/wpg/; never Street View. */

import { isUnflaggedSharedFallbackSrc } from "./photo-honesty.ts";

export const LISTING_PLACEHOLDER = "/photos/storefront-placeholder-480.webp";

/** Default photos for a newly listed centre before a real storefront is uploaded. */
export const STOCK_CREATE_PHOTOS = "/photos/community.jpg,/photos/playroom.jpg";

/** Provider-uploaded interiors (playroom, yard, cubbies). Never invent these. */
export const MAX_INTERIOR_PHOTOS = 5;

const STOCK_CREATE_SET = new Set(STOCK_CREATE_PHOTOS.split(","));

export function isStockListingPhoto(src: string) {
  return STOCK_CREATE_SET.has(src) || src.includes("storefront-placeholder") || isUnflaggedSharedFallbackSrc(src);
}

/** Unique assets stay; unflagged shared fallbacks become the official placeholder. */
export function honestListingSrc(src: string | undefined) {
  if (!src || isUnflaggedSharedFallbackSrc(src)) return LISTING_PLACEHOLDER;
  return src;
}

export function isLogoPhoto(src: string) {
  return src.includes("-logo");
}

/**
 * Split the persisted photos CSV without breaking `data:image…;base64,…` payloads.
 * Separators are commas that start the next path, data URL, or http(s) URL.
 */
export function splitPhotoList(raw: string | string[] | null | undefined): string[] {
  if (Array.isArray(raw)) return raw.map((p) => String(p).trim()).filter(Boolean);
  const text = String(raw ?? "").trim();
  if (!text) return [];
  return text
    .split(/,(?=\s*(?:data:|\/|https?:))/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Real interior extras only. Street-view (/photos/wpg/), official storefronts,
 * logos, stock marketing stills, and placeholders are never interiors.
 */
export function isInteriorEligiblePhoto(src: string) {
  const p = (src || "").trim();
  if (!p || p.includes("..")) return false;
  if (isLogoPhoto(p) || isStockListingPhoto(p)) return false;
  if (p.includes("placeholder")) return false;
  if (p.includes("/photos/wpg/")) return false;
  if (p.startsWith("/photos/buildings/")) return false;
  if (p.startsWith("data:image")) return true;
  if (p.startsWith("/img/")) return true;
  if (/^https?:\/\//i.test(p)) return true;
  if (p.startsWith("/") && !p.startsWith("/photos/")) return true;
  return false;
}

export type ClassifiedListingPhotos = {
  storefront: string;
  interiors: string[];
  logos: string[];
};

/**
 * First non-logo slot is the storefront (applyStorefrontPhoto prepends).
 * Later eligible extras are interiors. Does not invent photos.
 */
export function classifyListingPhotos(raw: string | string[] | null | undefined): ClassifiedListingPhotos {
  const list = splitPhotoList(raw);
  const logos = list.filter(isLogoPhoto);
  const rest = list.filter((p) => !isLogoPhoto(p));
  const storefront = rest[0] || "";
  const interiors = rest.slice(1).filter(isInteriorEligiblePhoto).slice(0, MAX_INTERIOR_PHOTOS);
  return { storefront, interiors, logos };
}

export function listingInteriors(raw: string | string[] | null | undefined): string[] {
  return classifyListingPhotos(raw).interiors;
}

/** Same persist rule as updateListing: real storefront first; drop stock placeholders. */
export function applyStorefrontPhoto(current: string, storefront?: string) {
  if (!storefront || !(storefront.startsWith("data:image") || storefront.startsWith("/"))) {
    return current;
  }
  const rest = splitPhotoList(current).filter((p) => p && p !== storefront && !isStockListingPhoto(p));
  return [storefront, ...rest].join(",");
}

function acceptInteriorUpload(src: string) {
  const p = (src || "").trim();
  if (!p || p.includes("..")) return false;
  if (p.startsWith("data:image")) return true;
  return isInteriorEligiblePhoto(p);
}

/**
 * Append provider interiors after the storefront. Caps at 5. Dedupes.
 * Empty extras leave the current list unchanged (fee/hours saves must not wipe photos).
 */
export function applyInteriorPhotos(current: string, extras?: string[]) {
  const incoming = (extras ?? []).filter(acceptInteriorUpload);
  if (!incoming.length) return current;
  const { storefront, interiors, logos } = classifyListingPhotos(current);
  const next = [...interiors];
  for (const extra of incoming) {
    if (!extra || extra === storefront || next.includes(extra)) continue;
    if (next.length >= MAX_INTERIOR_PHOTOS) break;
    next.push(extra);
  }
  const head = storefront || next[0] || "";
  const body = next.filter((p) => p !== head);
  return [head, ...body, ...logos].filter(Boolean).join(",");
}

/** True only when the persisted photo list actually changed. Never invents a date. */
export function listingPhotosChanged(before: string, after: string): boolean {
  return splitPhotoList(before).join(",") !== splitPhotoList(after).join(",");
}

export function isOfficialBuildingPhoto(src: string | undefined): boolean {
  return Boolean(src && src.startsWith("/photos/buildings/") && !src.includes("..") && !src.includes("-logo"));
}

/** First unique non-logo photo; prefer official /photos/buildings/ over /photos/wpg/. */
export function listingThumb(photos: string[] | undefined) {
  const list = (photos ?? []).filter((p) => p && !p.includes("-logo") && !isUnflaggedSharedFallbackSrc(p));
  const official = list.find((p) => isOfficialBuildingPhoto(p));
  return official || list[0] || LISTING_PLACEHOLDER;
}

/**
 * Storefront for a catalogue card.
 * Mapped IDs always use real-storefronts (/photos/buildings/{id}.jpg) when
 * that file is unique. Unflagged shared fallbacks (copied street-view, a
 * pumping-station grab reused on five IDs) skip to a unique /photos/wpg/
 * asset when one exists, otherwise the official placeholder.
 * Unmapped IDs keep /photos/wpg/ or the placeholder — never invent a photo.
 */
export function resolveListingStorefront(
  id: string,
  officialById: Record<string, string>,
  wpgById: Record<string, string>,
): string {
  const official = officialById[id];
  if (official && !isUnflaggedSharedFallbackSrc(official)) return official;
  const wpg = wpgById[id];
  if (wpg && !isUnflaggedSharedFallbackSrc(wpg)) return wpg;
  return LISTING_PLACEHOLDER;
}

/**
 * Catalogue card photos: official/wpg storefront, then any already-present interiors,
 * then logos. Never invents interiors for unmapped catalogue rows.
 */
export function listingPhotosFor(
  id: string,
  rawPhotos: string[] | undefined,
  officialById: Record<string, string>,
  wpgById: Record<string, string>,
): string[] {
  const storefront = resolveListingStorefront(id, officialById, wpgById);
  const { interiors, logos } = classifyListingPhotos(rawPhotos);
  const extras = interiors.filter((p) => p !== storefront);
  return [storefront, ...extras, ...logos];
}
