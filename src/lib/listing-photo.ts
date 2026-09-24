/** Listing-honesty photo pick. Official operator JPEGs beat /photos/wpg/; never Street View. */

import { isUnflaggedSharedFallbackSrc } from "./photo-honesty.ts";

export const LISTING_PLACEHOLDER = "/photos/storefront-placeholder-480.webp";

const EMPTY_MEDIA = /^(?:null|undefined|none|n\/a|about:blank|https?:\/{0,2})$/i;

/** Drop blank, null-like, and scheme-only media URLs before an <img> can paint a broken icon. */
export function healMediaUrl(src?: string | null): string {
  const p = String(src ?? "").trim();
  if (!p || EMPTY_MEDIA.test(p)) return "";
  if (p.includes("..")) return "";
  return p;
}

/** Default photos for a newly listed centre before a real storefront is uploaded. */
export const STOCK_CREATE_PHOTOS = "/photos/community.jpg,/photos/playroom.jpg";

/** Cover (storefront) plus interiors. Logos do not count toward this cap. */
export const MAX_LISTING_PHOTOS = 10;

/** Interiors that sit after the cover. Together they stay within MAX_LISTING_PHOTOS. */
export const MAX_INTERIOR_PHOTOS = MAX_LISTING_PHOTOS - 1;

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

const NEXT_PHOTO = /^(?:data:|https?:\/\/|\/)/i;

/**
 * Split the persisted photos CSV without breaking `data:image…;base64,…` payloads.
 * JPEG payloads start with `/9j`, so a naive "comma then slash" split paints two
 * broken tiles. The comma after `;base64` stays inside the data URL. A later comma
 * starts the next path, data URL, or http(s) URL.
 */
export function splitPhotoList(raw: string | string[] | null | undefined): string[] {
  if (Array.isArray(raw)) {
    return splitPhotoList(raw.map((p) => String(p).trim()).filter(Boolean).join(","));
  }
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const parts: string[] = [];
  let i = 0;
  while (i < text.length) {
    while (text[i] === ",") i += 1;
    if (i >= text.length) break;
    if (text.startsWith("data:", i)) {
      const marker = text.indexOf(";base64,", i);
      let end = text.length;
      if (marker !== -1) {
        let j = marker + ";base64,".length;
        while (j < text.length) {
          const comma = text.indexOf(",", j);
          if (comma === -1) {
            j = text.length;
            break;
          }
          const rest = text.slice(comma + 1).trimStart();
          if (NEXT_PHOTO.test(rest)) {
            j = comma;
            break;
          }
          j = comma + 1;
        }
        end = j;
      } else {
        const comma = text.indexOf(",", i);
        end = comma === -1 ? text.length : comma;
      }
      const token = text.slice(i, end).trim();
      if (token) parts.push(token);
      i = end + 1;
      continue;
    }
    const comma = text.indexOf(",", i);
    const end = comma === -1 ? text.length : comma;
    const token = text.slice(i, end).trim();
    if (token) parts.push(token);
    i = end + 1;
  }
  return parts;
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
  const interiorCap = storefront ? MAX_INTERIOR_PHOTOS : MAX_LISTING_PHOTOS;
  const interiors = rest.slice(1).filter(isInteriorEligiblePhoto).slice(0, interiorCap);
  return { storefront, interiors, logos };
}

export function listingInteriors(raw: string | string[] | null | undefined): string[] {
  return classifyListingPhotos(raw).interiors;
}

/** First photo the listing hero should paint. Empty when the centre has none. */
export function primaryListingPhoto(raw: string | string[] | null | undefined): string {
  const classified = classifyListingPhotos(raw);
  const list = [classified.storefront, ...classified.interiors].filter(Boolean);
  list.sort((a, b) => Number(isOfficialBuildingPhoto(b)) - Number(isOfficialBuildingPhoto(a)));
  return list[0] || "";
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
 * Append provider interiors after the storefront.
 * Cover + interiors stay at MAX_LISTING_PHOTOS. Dedupes.
 * Empty extras leave the current list unchanged (fee/hours saves must not wipe photos).
 */
export function applyInteriorPhotos(current: string, extras?: string[]) {
  const incoming = (extras ?? []).filter(acceptInteriorUpload);
  if (!incoming.length) return current;
  const { storefront, interiors, logos } = classifyListingPhotos(current);
  const next = [...interiors];
  const cap = storefront ? MAX_INTERIOR_PHOTOS : MAX_LISTING_PHOTOS;
  for (const extra of incoming) {
    if (!extra || extra === storefront || next.includes(extra)) continue;
    if (next.length >= cap) break;
    next.push(extra);
  }
  const head = storefront || next[0] || "";
  const body = next.filter((p) => p !== head);
  return [head, ...body, ...logos].filter(Boolean).join(",");
}

/** A photo the daycare desk can show, reorder, delete, or set as the cover. */
export function acceptManagedPhoto(src: string): boolean {
  const p = (src || "").trim();
  if (!p || p.includes("..") || isLogoPhoto(p)) return false;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(p)) return true;
  if (/^https?:\/\//i.test(p)) return true;
  if (p.startsWith("/") && !p.startsWith("//")) return true;
  return false;
}

/** Cover first, then interiors. At most MAX_LISTING_PHOTOS. */
export function managedListingPhotos(raw: string | string[] | null | undefined): string[] {
  const { storefront, interiors } = classifyListingPhotos(raw);
  return [storefront, ...interiors].filter(Boolean).slice(0, MAX_LISTING_PHOTOS);
}

export function listingPhotoRoom(count: number): number {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return Math.max(0, MAX_LISTING_PHOTOS - n);
}

/**
 * Replace the cover and interiors. Logos on the current listing stay at the end.
 * Pass an empty list to clear managed photos. Fee saves must not call this.
 */
export function applyManagedListingPhotos(current: string, ordered: string[]): string {
  const { logos } = classifyListingPhotos(current);
  const next: string[] = [];
  for (const raw of ordered) {
    const p = (raw || "").trim();
    if (!acceptManagedPhoto(p) || next.includes(p)) continue;
    next.push(p);
    if (next.length >= MAX_LISTING_PHOTOS) break;
  }
  const tail = logos.filter((logo) => !next.includes(logo));
  return [...next, ...tail].filter(Boolean).join(",");
}

export function moveListingPhoto<T>(list: readonly T[], index: number, dir: -1 | 1): T[] {
  const next = list.slice();
  const target = index + dir;
  if (index < 0 || target < 0 || index >= next.length || target >= next.length) return next;
  const current = next[index] as T;
  const swap = next[target] as T;
  next[index] = swap;
  next[target] = current;
  return next;
}

export function makeListingCover<T>(list: readonly T[], index: number): T[] {
  if (index <= 0 || index >= list.length) return list.slice();
  const next = list.slice();
  const [item] = next.splice(index, 1);
  if (item === undefined) return next;
  next.unshift(item);
  return next;
}

export function removeListingPhoto<T>(list: readonly T[], index: number): T[] {
  if (index < 0 || index >= list.length) return list.slice();
  return list.filter((_, i) => i !== index);
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
  const list = (photos ?? [])
    .map((p) => healMediaUrl(p))
    .filter((p) => p && !p.includes("-logo") && !isUnflaggedSharedFallbackSrc(p));
  const official = list.find((p) => isOfficialBuildingPhoto(p));
  return official || list[0] || LISTING_PLACEHOLDER;
}

/**
 * Thumbnail for the Explore map pin card.
 * Same pick as listingThumb, but empty when the only still would be a
 * placeholder or stock marketing photo. Never invents a storefront.
 */
export function mapPinThumb(photos: string[] | undefined): string {
  const thumb = listingThumb(photos);
  if (!thumb || isStockListingPhoto(thumb)) return "";
  return thumb;
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
