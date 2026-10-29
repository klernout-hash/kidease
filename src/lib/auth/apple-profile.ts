/**
 * Apple sends the person's name only on the first consent. Later sign-ins
 * omit it. Hide My Email uses a private relay address. Neither may block login.
 */

export type AppleProfileInput = {
  email?: string | null;
  name?: string | null;
  is_private_email?: boolean | string | null;
};

export function isApplePrivateRelay(email: string | null | undefined): boolean {
  return String(email || "")
    .trim()
    .toLowerCase()
    .endsWith("@privaterelay.appleid.com");
}

/** Name is optional. A relay address is a real sign-in email. */
export function mapAppleProfileToUser(profile: AppleProfileInput): {
  email?: string;
  emailVerified: boolean;
  name?: string;
} {
  const email = String(profile.email || "").trim();
  const name = String(profile.name || "").trim();
  return {
    ...(email ? { email } : {}),
    emailVerified: true,
    ...(name ? { name } : {}),
  };
}
