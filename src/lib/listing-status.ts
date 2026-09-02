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
  if (LIVE.has(raw) || extras?.live) return "live";
  if (WAITING.has(raw)) return "waiting";
  if (extras?.claimedAt && raw !== "declined") return "live";
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
