/**
 * Honest daycare upload caps. UI helper copy and client/server rejects
 * must stay aligned with these numbers — do not invent a tighter or looser limit.
 */
import { PRIVATE_DOC_BAD_FILE, PRIVATE_DOC_MAX_BYTES } from "./private-docs.ts";

export { PRIVATE_DOC_BAD_FILE, PRIVATE_DOC_MAX_BYTES };

/** Storefront / interior / claim-licence data-URL photos. */
export const LISTING_PHOTO_MAX_BYTES = 1_800_000;

/** Recommended listing-photo short side. Soft hint only — no hard reject. */
export const LISTING_PHOTO_MIN_SHORT_SIDE_PX = 800;

export function isPrivateDocTooBig(size: number): boolean {
  return !Number.isFinite(size) || size <= 0 || size > PRIVATE_DOC_MAX_BYTES;
}

export function isListingPhotoTooBig(size: number): boolean {
  return !Number.isFinite(size) || size <= 0 || size > LISTING_PHOTO_MAX_BYTES;
}
