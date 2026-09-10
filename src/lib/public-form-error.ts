/** Honest public-form errors: never imply mail succeeded when Resend failed. */

export function publicFormErrorMessage(err: unknown, fallback: string): string {
  const raw = (err instanceof Error ? err.message : String(err || "")).toLowerCase();
  if (
    raw.includes("turnstile") ||
    raw.includes("security check") ||
    raw.includes("captcha") ||
    raw.includes("challenge")
  ) {
    return "Please complete the security check, then try again.";
  }
  return fallback;
}
