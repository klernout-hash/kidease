/**
 * Admin claim / licence / photo review helpers.
 * Waiting claims stay on the queue. Licence and photo review is a separate
 * verify slice so operators can see the uploaded documents.
 */

import { isQueueableClaimStatus } from "@/lib/listing-status";
import { isRealListingPhoto } from "@/lib/listing-readiness";
import { hasStoredPrivateDoc } from "@/lib/private-docs";
import { normalizeLicenseStatus, normalizeMatchState } from "@/lib/trust";

export type VerifyCentre = {
  claimStatus?: string | null;
  licenseStatus?: string | null;
  registryMatchState?: string | null;
  licensePhoto?: string | null;
  storefrontPhoto?: string | null;
  mergedInto?: string | null;
  importFault?: string | null;
};

function hiddenCatalogueRow(item: VerifyCentre) {
  return Boolean((item.mergedInto || "").trim() || (item.importFault || "").trim());
}

export function hasReviewablePhoto(src?: string | null) {
  const p = (src || "").trim();
  if (!p) return false;
  if (p === "on-file" || p === "data:image" || p === "data:application/pdf") return true;
  if (hasStoredPrivateDoc(p)) return true;
  if (p.startsWith("data:image")) return true;
  return isRealListingPhoto(p);
}

export function needsClaimReview(item: VerifyCentre) {
  return isQueueableClaimStatus(item.claimStatus);
}

export function needsLicenseReview(item: VerifyCentre) {
  if (hiddenCatalogueRow(item)) return false;
  const license = normalizeLicenseStatus(item.licenseStatus);
  const match = normalizeMatchState(item.registryMatchState);
  if (license === "expired" || license === "suspended") return true;
  if (license === "matched" && match === "matched") return false;
  return needsClaimReview(item) || hasReviewablePhoto(item.licensePhoto);
}

export function needsPhotoReview(item: VerifyCentre) {
  if (hiddenCatalogueRow(item)) return false;
  if (hasReviewablePhoto(item.licensePhoto) && normalizeLicenseStatus(item.licenseStatus) !== "matched") {
    return true;
  }
  return needsClaimReview(item) && hasReviewablePhoto(item.storefrontPhoto);
}

export function needsVerification(item: VerifyCentre) {
  if (hiddenCatalogueRow(item)) return false;
  return needsClaimReview(item) || needsLicenseReview(item) || needsPhotoReview(item);
}
