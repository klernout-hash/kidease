/**
 * Photo-overlay pills on search and directory listing cards.
 *
 * Live uses the same two facts already on the card: the live flag that
 * includes a centre in Live search, and publicApprovalEligible (the
 * “KidEase approved” line). Either one alone is not enough.
 *
 * $10 / Day, $9.65 / Day, and Reduced fees use confirmedFeeProgramBadge.
 * The pill follows the sourced rule for this centre, not a province-wide guess
 * and not a harvested ten-a-day amenity. Ontario, Alberta, New Brunswick, and
 * Nova Scotia never get a daily-fee pill.
 */

export function showCardLivePill(live: boolean, kideaseApproved: boolean): boolean {
  return live && kideaseApproved;
}

export type ConfirmedFeeProgram = "badgeTen" | "badgeFifteen" | "badgeReducedQc" | "badgeQc965" | "badgeReduced";

export function cardFeePillLabelKey(
  program: ConfirmedFeeProgram | null,
): "cardTenPerDay" | "badgeFifteen" | "badgeReducedQc" | "cardQcPerDay" | "cardReducedFees" | null {
  if (program === "badgeTen") return "cardTenPerDay";
  if (program === "badgeFifteen") return "badgeFifteen";
  if (program === "badgeReducedQc") return "badgeReducedQc";
  if (program === "badgeQc965") return "cardQcPerDay";
  if (program === "badgeReduced") return "cardReducedFees";
  return null;
}

/** Registry-checked stays off the photo. Expired and suspended still warn. */
export function cardPhotoLicenseWarning(id: string | null | undefined): boolean {
  return id === "license_expired" || id === "license_suspended";
}
