/**
 * Government data calls need a second step. A password session is not enough.
 * The email code and a verified passkey both set the same 2FA cookie.
 */

export class GovSecondFactorError extends Error {
  readonly status = 401;
  constructor() {
    super("Two-factor verification required");
    this.name = "GovSecondFactorError";
  }
}

export function govCallAllowed(secondFactorVerified: boolean): boolean {
  return secondFactorVerified === true;
}

export function assertGovSecondFactorVerified(secondFactorVerified: boolean): void {
  if (!govCallAllowed(secondFactorVerified)) throw new GovSecondFactorError();
}

export function govVerifyPath(locale: "en" | "fr", nextPath: string): string {
  const page = locale === "fr" ? "/fr/verify-2fa" : "/verify-2fa";
  return `${page}?next=${encodeURIComponent(nextPath)}`;
}
