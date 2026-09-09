/**
 * Parent-facing licence badge rules. Honest: only “Licensed” when we already
 * know. Never invent a licence number. Never treat “in the catalogue” as a
 * green check by itself.
 */

import {
  isCatalogueMatchedBadge,
  isHonestLicenseMatch,
  licenseBadge,
  normalizeLicenseStatus,
  type TrustBadge,
  type TrustListing,
} from "@/lib/trust";

/** True when KidEase has a positive licence match (not expired / suspended). */
export function isVerifiedLicensed(item: TrustListing): boolean {
  const status = normalizeLicenseStatus(item.licenseStatus);
  if (status === "expired" || status === "suspended") return false;
  return isHonestLicenseMatch(item);
}

/**
 * Compact public badge: registry-checked, expired, or suspended only.
 * Catalogue-matched is operator jargon — keep it off guest/parent surfaces.
 * Unverified stays off the card — absence is not a claim that the centre is unlicensed.
 */
export function publicLicenseBadge(item: TrustListing): TrustBadge | null {
  const badge = licenseBadge(item);
  if (badge.id === "license_unverified") return null;
  if (isCatalogueMatchedBadge(badge)) return null;
  return badge;
}
