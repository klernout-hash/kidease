/**
 * Admin claim / licence / photo review helpers.
 * Waiting claims stay on the queue. Licence and photo review is a separate
 * verify slice so operators can see the uploaded documents.
 */

import { isWaitingClaim } from "@/lib/listing-status";
import { isRealListingPhoto } from "@/lib/listing-readiness";
import { normalizeLicenseStatus, normalizeMatchState } from "@/lib/trust";

export type VerifyCentre = {
  claimStatus?: string | null;
  licenseStatus?: string | null;
  registryMatchState?: string | null;
  licensePhoto?: string | null;
  storefrontPhoto?: string | null;
};

export function hasReviewablePhoto(src?: string | null) {
  const p = (src || "").trim();
  if (!p) return false;
  if (p.startsWith("data:image")) return true;
  return isRealListingPhoto(p);
}

export function needsClaimReview(item: VerifyCentre) {
  return isWaitingClaim(item.claimStatus);
}

export function needsLicenseReview(item: VerifyCentre) {
  const license = normalizeLicenseStatus(item.licenseStatus);
  const match = normalizeMatchState(item.registryMatchState);
  if (license === "expired" || license === "suspended") return true;
  if (license === "matched" && match === "matched") return false;
  return needsClaimReview(item) || hasReviewablePhoto(item.licensePhoto);
}

export function needsPhotoReview(item: VerifyCentre) {
  if (hasReviewablePhoto(item.licensePhoto) && normalizeLicenseStatus(item.licenseStatus) !== "matched") {
    return true;
  }
  return needsClaimReview(item) && hasReviewablePhoto(item.storefrontPhoto);
}

export function needsVerification(item: VerifyCentre) {
  return needsClaimReview(item) || needsLicenseReview(item) || needsPhotoReview(item);
}
