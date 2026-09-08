/**
 * Distinct listing IDs may not share photo bytes unless the hash is flagged
 * as an intentional shared asset (same-site programs). Unflagged copies —
 * city street-view fallbacks, a pumping-station grab reused on five centres —
 * are remapped to the official storefront placeholder or encoded as a
 * per-listing placeholder by /img.
 *
 * Committed src/hash lists must match `collectUnflaggedSharedFallbacks`
 * (scripts/photo-honesty.mjs). Tests fail when a new duplicate lands on disk.
 */

/** Empty until Kyle flags a same-site / chain photo by sha256. */
export const INTENTIONAL_SHARED_PHOTO_SHA256: readonly string[] = [];

/**
 * SHA-256 of listing JPEGs that appear under two or more IDs and are not
 * in INTENTIONAL_SHARED_PHOTO_SHA256. Includes the Portage & Main street-view
 * copied onto /photos/wpg/2121.jpg, 2029.jpg, and 101693.jpg.
 */
export const UNFLAGGED_SHARED_FALLBACK_SHA256: readonly string[] = [
  "22bda4ea4e918faac25bb1e7fc3a9a0b630898ed10bfba191b754de7993e31e4",
  "3450d3565fa55010c2e4ed80861a49ff99a8caebe8d3f5aac22034a7e3e4aef7",
  "62b243fdf565171e82fd822db320e081bb77a59650b81104c7508dc017489d31",
  "871981fbbc5ac0e93ba47d55891ea105584969c1df1d7c4b328404a423cc612f",
  "db622fb403fde4a6f9a20f7738438fced5576a55ad5d0f1ec0ac4d361182a4fc",
  "e5c5552bf1704b7248ff05784409186b11e6f886176b85b9c65f41397268ff74",
  "eaf02f4c3c3a5894e144190774861c02285ff2e422cb527948ab39f0f9ed3575",
  "f682e570f1eacbfb26eb07996be3bfe621ad113fa05267781380009df6dbbc54",
  "f6f55f186dc35201ffdb3dd1e1d2bb66f6ea64582ee021ae517a2251bd4f3e76",
  "f7e80947983873b7dcf4d973cc6b967ce5a22f549edd897676765cd9b37e33ee",
];

export const UNFLAGGED_SHARED_FALLBACK_SRCS: readonly string[] = [
  "/photos/buildings/mb-101053.jpg",
  "/photos/buildings/mb-101061.jpg",
  "/photos/buildings/mb-1014.jpg",
  "/photos/buildings/mb-102137.jpg",
  "/photos/buildings/mb-2169.jpg",
  "/photos/storefront/mb-100820.jpg",
  "/photos/storefront/mb-101214.jpg",
  "/photos/storefront/mb-7834.jpg",
  "/photos/wpg/100820.jpg",
  "/photos/wpg/1012.jpg",
  "/photos/wpg/101693.jpg",
  "/photos/wpg/101755.jpg",
  "/photos/wpg/102878.jpg",
  "/photos/wpg/102933.jpg",
  "/photos/wpg/102965.jpg",
  "/photos/wpg/103006.jpg",
  "/photos/wpg/103162.jpg",
  "/photos/wpg/1144.jpg",
  "/photos/wpg/2029.jpg",
  "/photos/wpg/2042.jpg",
  "/photos/wpg/2121.jpg",
  "/photos/wpg/2151.jpg",
  "/photos/wpg/2341.jpg",
  "/photos/wpg/7076.jpg",
  "/photos/wpg/9112.jpg",
  "/photos/wpg/9320.jpg",
];

const INTENTIONAL_HASH = new Set(INTENTIONAL_SHARED_PHOTO_SHA256);
const UNFLAGGED_HASH = new Set(UNFLAGGED_SHARED_FALLBACK_SHA256);
const UNFLAGGED_SRC = new Set(UNFLAGGED_SHARED_FALLBACK_SRCS);

export function isExplicitSharedPlaceholder(src: string) {
  return src.includes("storefront-placeholder");
}

export function isIntentionalSharedPhotoHash(sha256: string) {
  return INTENTIONAL_HASH.has(sha256);
}

export function isUnflaggedSharedFallbackHash(sha256: string) {
  return UNFLAGGED_HASH.has(sha256);
}

export function isUnflaggedSharedFallbackSrc(src: string) {
  if (!src || isExplicitSharedPlaceholder(src)) return false;
  return UNFLAGGED_SRC.has(src);
}

/**
 * /img uses the content hash so a unique R2 original wins even if Git still
 * has a copied street-view. Explicit placeholder paths stay shared.
 */
export function shouldReplaceWithPerListingPlaceholder(src: string, sha256: string) {
  if (isExplicitSharedPlaceholder(src)) return false;
  if (isIntentionalSharedPhotoHash(sha256)) return false;
  return isUnflaggedSharedFallbackHash(sha256);
}

export function listingStemFromSrc(src: string) {
  const base = String(src || "").split("/").pop() || "listing";
  return base.replace(/\.(jpe?g|png|webp|avif)$/i, "").slice(0, 40);
}
