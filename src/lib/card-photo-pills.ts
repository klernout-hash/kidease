/**
 * Photo-overlay pills on search and directory listing cards.
 *
 * Live uses the same two facts already on the card: the live flag that
 * includes a centre in Live search, and publicApprovalEligible (the
 * “KidEase approved” line). Either one alone is not enough.
 *
 * $10 / Day uses confirmedFeeProgramBadge — the centre confirmed ten-a-day.
 * The search chip “$10-a-day / reduced fee” also keeps every centre in
 * provinces where a reduced fee is typical. That would stamp $10 on
 * unconfirmed listings, so the photo pill does not follow the chip’s
 * province-wide branch. $15-a-day and Québec reduced-contribution keep
 * their own labels when that confirmed program is the one on file.
 */

export function showCardLivePill(live: boolean, kideaseApproved: boolean): boolean {
  return live && kideaseApproved;
}

export type ConfirmedFeeProgram = "badgeTen" | "badgeFifteen" | "badgeReducedQc";

export function cardFeePillLabelKey(
  program: ConfirmedFeeProgram | null,
): "cardTenPerDay" | "badgeFifteen" | "badgeReducedQc" | null {
  if (program === "badgeTen") return "cardTenPerDay";
  if (program === "badgeFifteen") return "badgeFifteen";
  if (program === "badgeReducedQc") return "badgeReducedQc";
  return null;
}

/** Registry-checked stays off the photo. Expired and suspended still warn. */
export function cardPhotoLicenseWarning(id: string | null | undefined): boolean {
  return id === "license_expired" || id === "license_suspended";
}
