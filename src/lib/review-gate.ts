/**
 * Gated parent micro-reviews (PR F).
 *
 * KidEase shows Airbnb-style social proof only from parents with a real
 * relationship to the centre. There is no open public write path.
 *
 * Write gate (server-side, see src/lib/server/reviews.ts):
 *   1. Enrolment — bookings.status in ('accepted', 'active') for this parent + centre
 *   2. Confirmed relationship — attendance.parent_user_id for this parent + centre
 *   3. Admin grant — reviewer_grants row (tour completed offline, or manual)
 *
 * A centre account (provider_daycares) cannot review its own listing.
 * Spot requests, waitlist, and tour_requests (0028) are not enrolment.
 *
 * Public display uses status = published only. Admin hide → hidden.
 * Legacy rows may still say approved / rejected; treat those as published / hidden.
 */

export const REVIEW_STATUSES = ["pending", "published", "hidden"] as const;
export type ReviewModerationStatus = (typeof REVIEW_STATUSES)[number];

export const LEGACY_PUBLISHED = "approved";
export const LEGACY_HIDDEN = "rejected";

export const ENROLLED_BOOKING_STATUSES = ["accepted", "active"] as const;

export type ReviewGateReason = "enrolment" | "attendance" | "grant";
export type ReviewWriteDenial = "centre_owner" | "none";

export type ReviewWriteAccess =
  | { canWrite: true; reason: ReviewGateReason }
  | { canWrite: false; reason: ReviewWriteDenial };

export function normalizeReviewStatus(raw: string | null | undefined): ReviewModerationStatus {
  if (raw === "published" || raw === LEGACY_PUBLISHED) return "published";
  if (raw === "hidden" || raw === LEGACY_HIDDEN) return "hidden";
  return "pending";
}

export function isPublicReviewStatus(raw: string | null | undefined): boolean {
  return normalizeReviewStatus(raw) === "published";
}

export function isPendingReviewStatus(raw: string | null | undefined): boolean {
  return normalizeReviewStatus(raw) === "pending";
}

export function publicReviewStatuses(): readonly string[] {
  return ["published", LEGACY_PUBLISHED];
}

export function resolveReviewWriteAccess(input: {
  ownsCentre: boolean;
  enrolled: boolean;
  attended: boolean;
  granted: boolean;
}): ReviewWriteAccess {
  if (input.ownsCentre) return { canWrite: false, reason: "centre_owner" };
  if (input.enrolled) return { canWrite: true, reason: "enrolment" };
  if (input.attended) return { canWrite: true, reason: "attendance" };
  if (input.granted) return { canWrite: true, reason: "grant" };
  return { canWrite: false, reason: "none" };
}

export function parentReviewSummary(reviews: Array<{ rating: number }>): {
  ratingX10: number;
  count: number;
} {
  if (!reviews.length) return { ratingX10: 0, count: 0 };
  const sum = reviews.reduce((acc, r) => acc + Number(r.rating), 0);
  const avg = sum / reviews.length;
  if (!Number.isFinite(avg)) return { ratingX10: 0, count: 0 };
  return { ratingX10: Math.round(avg * 10), count: reviews.length };
}
