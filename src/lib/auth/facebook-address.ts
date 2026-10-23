/**
 * Client-safe Facebook email checks. No app id, no secret, no database.
 * The real address stays on the server in facebook-idp.ts.
 */

/** Reserved domain. Mail must never be sent here. Account is keyed on the Facebook id. */
export const FACEBOOK_PLACEHOLDER_DOMAIN = "facebook.invalid";

/** Thrown when a Facebook account still has no confirmed email. */
export const FACEBOOK_EMAIL_REQUIRED_MESSAGE =
  "Add and confirm an email before you message a centre or book a tour.";

export function isFacebookPlaceholderEmail(email: string | null | undefined): boolean {
  const value = String(email || "")
    .trim()
    .toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0) return false;
  return value.slice(at + 1) === FACEBOOK_PLACEHOLDER_DOMAIN;
}

export function facebookPlaceholderEmail(facebookId: string): string | null {
  const id = facebookId.trim().replace(/[^a-zA-Z0-9]/g, "");
  if (!id) return null;
  return `${id}@${FACEBOOK_PLACEHOLDER_DOMAIN}`;
}

/**
 * A placeholder always blocks. After they add an address, messaging and
 * booking stay closed until that address is confirmed. A real Facebook
 * email is not blocked only because it is unverified.
 */
export function facebookContactBlocksAction(input: {
  email?: string | null;
  emailVerified?: boolean | null;
  facebookEmailRequired?: boolean | null;
}): boolean {
  if (isFacebookPlaceholderEmail(input.email) || !String(input.email || "").includes("@")) return true;
  return Boolean(input.facebookEmailRequired) && input.emailVerified !== true;
}
