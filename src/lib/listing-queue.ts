/**
 * Admin waiting-queue eligibility for provider-created centres vs catalogue
 * master data. Kept free of DB / Start so unit tests can import it.
 *
 * createListing must write a queueable claim_status (waiting) so Admin
 * Waiting can see it. Catalogue upserts stay unclaimed and stay off the queue.
 */

import { isQueueableClaimStatus } from "./listing-status.ts";
import { isAdminOnlyListing, type ListingVisibilityInput } from "./listing-visibility.ts";

export const PROVIDER_CREATED_CLAIM_STATUS = "waiting" as const;

export const ADMIN_LIST_CLAIM_STATUSES = [
  "pending",
  "waiting",
  "verified",
  "approved",
  "declined",
] as const;

export type AdminListEligibilityInput = ListingVisibilityInput & {
  claimedAt?: string | Date | null;
  claimStatus?: string | null;
  hasListingClaim?: boolean;
  hasProviderLink?: boolean;
};

/** Mirrors listAdminCentres WHERE — catalogue unclaimed imports stay out. */
export function isAdminListEligible(row: AdminListEligibilityInput): boolean {
  if (row.claimedAt) return true;
  const status = (row.claimStatus || "").trim().toLowerCase();
  if ((ADMIN_LIST_CLAIM_STATUSES as readonly string[]).includes(status)) return true;
  if (row.hasListingClaim) return true;
  if (row.hasProviderLink) return true;
  return isAdminOnlyListing(row);
}

/**
 * Map stored claim tokens onto the Admin desk status.
 * Provider-created orphans (createListing left default unclaimed, but
 * provider_daycares is linked) join Waiting without becoming Live.
 */
export function normalizeAdminClaimStatus(input: {
  claimStatus?: string | null;
  claimedAt?: string | Date | null;
  claimRowStatus?: string | null;
  hasProviderLink?: boolean;
}): string {
  const claimStatus = (input.claimStatus || "").trim().toLowerCase() || null;
  const claimedAt = input.claimedAt;
  const claimRow = (input.claimRowStatus || "").trim().toLowerCase() || null;
  if (
    claimStatus === "approved" ||
    (claimedAt && claimStatus !== "declined" && claimStatus !== "waiting" && claimStatus !== "pending")
  ) {
    return "approved";
  }
  if (claimStatus === "declined" || claimRow === "declined") return "declined";
  if (claimStatus === "waiting" || claimRow === "waiting" || claimRow === "verified") return "waiting";
  if (claimStatus === "pending" || claimRow === "pending") return "pending";
  if (claimedAt) return "approved";
  if (input.hasProviderLink && (!claimStatus || claimStatus === "unclaimed")) return "waiting";
  return claimStatus || "unclaimed";
}

export function isWaitingOnAdminQueue(claimStatus: string | null | undefined) {
  return isQueueableClaimStatus(claimStatus);
}

/** Write-shape createListing / similar provider-created paths must persist. */
export function providerCreatedListingWrite() {
  return {
    claimStatus: PROVIDER_CREATED_CLAIM_STATUS,
    claimedAt: null,
    listingClaimStatus: PROVIDER_CREATED_CLAIM_STATUS,
    live: false,
  } as const;
}

/** Catalogue / master-data upserts must not flip into the Admin waiting queue. */
export function catalogImportWrite() {
  return {
    claimStatus: "unclaimed" as const,
    claimedAt: null,
  };
}
