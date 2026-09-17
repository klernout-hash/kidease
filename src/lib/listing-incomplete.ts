/**
 * Admin Incomplete / Needs-complete queue.
 * Provider-linked or claim-started centres that are not Live/approved.
 * Catalogue master-data (no provider_daycares, no claim) stays off this list.
 * missing[] is structured for a later CRM hook — this module does not send webhooks.
 *
 * Checklist rules match listing-readiness (fees / ages / hours / real storefront photo)
 * plus licence-photo and screening-on-file. Kept free of @/ aliases so unit tests can import it.
 */

import { listingStatusFromClaim, isQueueableClaimStatus, type ListingStatus } from "./listing-status.ts";
import { splitPhotoList } from "./listing-photo.ts";
import { isUnflaggedSharedFallbackSrc } from "./photo-honesty.ts";
import { normalizeAdminClaimStatus } from "./listing-queue.ts";

export const INCOMPLETE_MISSING_FIELDS = [
  "license_photo",
  "screening",
  "photo",
  "fees",
  "ages",
  "hours",
] as const;

export type IncompleteMissingField = (typeof INCOMPLETE_MISSING_FIELDS)[number];

export type IncompleteEligibilityInput = {
  claimedAt?: string | Date | null;
  claimStatus?: string | null;
  claimRowStatus?: string | null;
  hasListingClaim?: boolean;
  hasProviderLink?: boolean;
  live?: boolean;
};

export type IncompleteChecklistInput = IncompleteEligibilityInput & {
  licensePhoto?: string | null;
  screeningOnFile?: boolean | null;
  photos?: string | string[] | null;
  storefrontPhoto?: string | null;
  province?: string | null;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  agesKnown?: boolean | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  hours?: string | null;
};

export type IncompleteCrmPayload = {
  daycareId: string;
  name: string;
  slug: string;
  providerName: string | null;
  providerEmail: string | null;
  claimStatus: string;
  listingStatus: ListingStatus;
  live: boolean;
  missing: IncompleteMissingField[];
  submittedAt: string | null;
  updatedAt: string | null;
};

/** Same jurisdictions as feeProgramBadgeKey — a fee program counts as fees listed. */
const FEE_PROGRAM_PROVINCES = new Set(["MB", "SK", "PE", "NL", "YT", "NT", "NU", "QC", "AB"]);

function claimToken(row: IncompleteEligibilityInput) {
  return normalizeAdminClaimStatus({
    claimStatus: row.claimStatus,
    claimedAt: row.claimedAt,
    claimRowStatus: row.claimRowStatus,
    hasProviderLink: row.hasProviderLink,
  });
}

function claimStarted(row: IncompleteEligibilityInput) {
  if (row.hasListingClaim) return true;
  if (isQueueableClaimStatus(row.claimStatus) || isQueueableClaimStatus(row.claimRowStatus)) return true;
  const status = claimToken(row);
  return status === "waiting" || status === "pending";
}

function hasListedFees(row: IncompleteChecklistInput) {
  return [row.infantMonthly, row.toddlerMonthly, row.preschoolMonthly, row.partTimeMonthly].some(
    (n) => n != null && n > 0,
  );
}

function hasFeeOrProgram(row: IncompleteChecklistInput) {
  const province = (row.province || "").trim().toUpperCase();
  return FEE_PROGRAM_PROVINCES.has(province) || hasListedFees(row);
}

function hasConfirmedAges(row: IncompleteChecklistInput) {
  if (row.agesKnown === false) return false;
  if (row.agesKnown) return true;
  const min = row.ageMinMonths ?? 0;
  const max = row.ageMaxMonths ?? 0;
  return max > min && max > 0;
}

function hasListedHours(hours?: string | null) {
  const v = (hours || "").trim();
  if (!v || v === "—" || v === "-") return false;
  if (/^hours not/i.test(v) || /^see (the )?centre/i.test(v) || /^tbd$/i.test(v)) return false;
  return v.length >= 4;
}

/** Same honesty as listing-readiness isRealListingPhoto. */
function isRealListingPhoto(src?: string | null) {
  const p = (src || "").trim();
  if (!p) return false;
  if (p.includes("placeholder")) return false;
  if (p.includes("-logo")) return false;
  if (isUnflaggedSharedFallbackSrc(p)) return false;
  if (p.includes("/photos/wpg/")) return false;
  if (p.startsWith("data:image")) return true;
  if (p.startsWith("/photos/buildings/")) return true;
  if (p.startsWith("/img/")) return true;
  if (/^https?:\/\//i.test(p)) return true;
  if (p.startsWith("/") && !p.startsWith("/photos/")) return true;
  return false;
}

/** Provider-linked and/or claim-started, and not Live/approved (or declined). */
export function isIncompleteQueueEligible(row: IncompleteEligibilityInput): boolean {
  if (row.live) return false;
  const status = claimToken(row);
  if (status === "approved" || status === "declined") return false;
  if (row.hasProviderLink) return true;
  return claimStarted(row);
}

export function incompleteMissing(row: IncompleteChecklistInput): IncompleteMissingField[] {
  const missing: IncompleteMissingField[] = [];
  if (!(row.licensePhoto || "").trim()) missing.push("license_photo");
  if (!row.screeningOnFile) missing.push("screening");
  const photos = splitPhotoList(row.photos);
  const hasPhoto = photos.some((p) => isRealListingPhoto(p)) || isRealListingPhoto(row.storefrontPhoto);
  if (!hasPhoto) missing.push("photo");
  if (!hasFeeOrProgram(row)) missing.push("fees");
  if (!hasConfirmedAges(row)) missing.push("ages");
  if (!hasListedHours(row.hours)) missing.push("hours");
  return missing;
}

/** Eligible centre that still has listing/upload gaps for a CRM completion nudge. */
export function belongsOnIncompleteQueue(row: IncompleteChecklistInput): boolean {
  return isIncompleteQueueEligible(row) && incompleteMissing(row).length > 0;
}

export function selectIncompleteRows<T extends IncompleteChecklistInput>(rows: T[]): T[] {
  return rows.filter((row) => belongsOnIncompleteQueue(row));
}

export function incompleteCrmPayload(input: {
  daycareId: string;
  name: string;
  slug: string;
  providerName?: string | null;
  providerEmail?: string | null;
  contactEmail?: string | null;
  claimStatus: string;
  claimedAt?: string | null;
  live?: boolean;
  missing: IncompleteMissingField[];
  submittedAt?: string | null;
  updatedAt?: string | null;
}): IncompleteCrmPayload {
  const listingStatus = listingStatusFromClaim(input.claimStatus, {
    live: input.live,
    claimedAt: input.claimedAt,
  });
  return {
    daycareId: input.daycareId,
    name: input.name,
    slug: input.slug,
    providerName: input.providerName || null,
    providerEmail: input.providerEmail || input.contactEmail || null,
    claimStatus: input.claimStatus,
    listingStatus,
    live: Boolean(input.live) || listingStatus === "live",
    missing: [...input.missing],
    submittedAt: input.submittedAt || null,
    updatedAt: input.updatedAt || input.submittedAt || null,
  };
}
