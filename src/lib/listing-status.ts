/** Listing / claim / approval words — same on admin, provider, and parent. */
export const LISTING_STATUS = {
  waiting: "Waiting",
  live: "Live",
  declined: "Declined",
} as const;

export type ListingStatus = keyof typeof LISTING_STATUS;

const WAITING = new Set(["waiting", "pending", "verified", "submitted", "review", "queued"]);
const LIVE = new Set(["approved", "live", "active", "published"]);
const DECLINED = new Set(["declined", "rejected", "denied"]);

/** Map any stored claim/approval token onto Waiting / Live / Declined. */
export function listingStatusFromClaim(
  claimStatus: string | null | undefined,
  extras?: { live?: boolean; claimedAt?: string | null },
): ListingStatus {
  const raw = (claimStatus || "").trim().toLowerCase();
  if (DECLINED.has(raw)) return "declined";
  // An approved token is Live only when the caller says the listing is Live.
  // Public Live is licence evidence; extras.live === false keeps Admin Waiting.
  if (LIVE.has(raw)) {
    if (extras?.live === false) return "waiting";
    return "live";
  }
  if (extras?.live) return "live";
  if (WAITING.has(raw)) return "waiting";
  if (extras?.claimedAt && extras.live !== false) return "live";
  if (!raw || raw === "unclaimed") return "waiting";
  return "waiting";
}

export function listingStatusLabel(
  claimStatus: string | null | undefined,
  extras?: { live?: boolean; claimedAt?: string | null },
): (typeof LISTING_STATUS)[ListingStatus] {
  return LISTING_STATUS[listingStatusFromClaim(claimStatus, extras)];
}

export function isWaitingClaim(status: string | null | undefined) {
  return listingStatusFromClaim(status) === "waiting";
}

/**
 * Tokens Admin Waiting / verify treat as an in-review claim.
 * Unclaimed catalogue master data is not queueable — createListing must
 * write waiting (or pending/verified) so Daycare → Admin is not a silent orphan.
 */
export function isQueueableClaimStatus(status: string | null | undefined) {
  return WAITING.has((status || "").trim().toLowerCase());
}
