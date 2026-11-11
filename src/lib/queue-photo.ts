/**
 * Storefront shown on the admin queue. A missing catalogue file must not
 * request /photos/buildings/*.jpg on the website origin.
 */
import { isMissingCatalogueBuilding } from "./catalogue-buildings.ts";
import { isRejectedStorefrontSrc, LISTING_PLACEHOLDER } from "./listing-photo.ts";
import { photoUrl, publicPhotoUrl } from "./photo.ts";

export function queueStorefrontSrc(src?: string | null): string {
  const path = String(src || "").trim().split("?")[0] ?? "";
  if (!path || path.includes("..")) return "";
  if (isMissingCatalogueBuilding(path) || isRejectedStorefrontSrc(path)) return LISTING_PLACEHOLDER;
  if (path.startsWith("/photos/")) {
    const published = publicPhotoUrl(path);
    if (published.startsWith("https://")) return published;
    return photoUrl(path, 320);
  }
  return path;
}
