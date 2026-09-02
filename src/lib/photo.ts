export const PHOTO_WIDTHS = [320, 480, 768, 1200] as const;
export const CARD_SIZES = "(max-width: 767px) 172px, (max-width: 1023px) 44vw, 320px";
export const HERO_SIZES = "(max-width: 767px) 100vw, 560px";
export const DETAIL_SIZES = "(max-width: 767px) 100vw, 720px";

export function isLocalPhoto(src: string) {
  return src.startsWith("/photos/") && !src.includes("..");
}

function nearestWidth(width: number) {
  return PHOTO_WIDTHS.find((n) => n >= width) ?? 1200;
}

export function photoUrl(src: string, width: number) {
  if (!src) return "/photos/storefront-placeholder-480.webp";
  if (!isLocalPhoto(src)) return src;
  if (src.includes("storefront-placeholder")) return "/photos/storefront-placeholder-480.webp";
  return `/img?src=${encodeURIComponent(src)}&w=${nearestWidth(width)}`;
}

export function photoSrcSet(src: string, widths: readonly number[] = PHOTO_WIDTHS) {
  if (!isLocalPhoto(src) || src.includes("storefront-placeholder")) return undefined;
  return widths.map((w) => `${photoUrl(src, w)} ${w}w`).join(", ");
}

export { listingThumb, LISTING_PLACEHOLDER } from "./listing-photo";
