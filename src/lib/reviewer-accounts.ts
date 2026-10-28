/** App Store / Play reviewer mailboxes. These addresses are not secrets. */

export const STORE_REVIEWER_PARENT_EMAIL = "reviewer.parent@kidease.ca";
export const STORE_REVIEWER_DAYCARE_EMAIL = "reviewer.daycare@kidease.ca";
export const STORE_REVIEWER_PARENT_EMAIL_HYPHEN = "reviewer-parent@kidease.ca";
export const STORE_REVIEWER_PROVIDER_EMAIL_HYPHEN = "reviewer-provider@kidease.ca";

const STORE_REVIEWER_EMAILS = new Set([
  STORE_REVIEWER_PARENT_EMAIL,
  STORE_REVIEWER_DAYCARE_EMAIL,
  STORE_REVIEWER_PARENT_EMAIL_HYPHEN,
  STORE_REVIEWER_PROVIDER_EMAIL_HYPHEN,
]);

export function isStoreReviewerEmail(email: string | null | undefined): boolean {
  return STORE_REVIEWER_EMAILS.has(String(email || "").trim().toLowerCase());
}

/** John Doe and Jonny Doey stay untouched. Names and emails both count. */
export function isProtectedQaIdentity(value: string | null | undefined): boolean {
  return /john[\s._-]*doe|jonn?y[\s._-]*doey/i.test(String(value || ""));
}
