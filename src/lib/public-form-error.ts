/** Honest public-form errors: never imply mail succeeded when Resend failed. */

export function publicFormErrorMessage(
  err: unknown,
  fallback: string,
  securityCheckMessage = "Please complete the security check, then try again.",
): string {
  const raw = (err instanceof Error ? err.message : String(err || "")).toLowerCase();
  if (
    raw.includes("turnstile") ||
    raw.includes("security check") ||
    raw.includes("captcha") ||
    raw.includes("challenge")
  ) {
    return securityCheckMessage;
  }
  return fallback;
}
