/** Map Better Auth / mail failures to copy we can show on the reset forms. */
export function friendlyResetMailError(message?: string | null) {
  const raw = (message || "").toLowerCase();
  if (
    raw.includes("security filter blocked") ||
    raw.includes("attention required") ||
    raw.includes("you have been blocked") ||
    (raw.includes("cloudflare") && raw.includes("blocked"))
  ) {
    return "Security filter blocked sign-in — try again or contact support";
  }
  if (
    raw.includes("not configured") ||
    raw.includes("resend_api_key") ||
    raw.includes("sendgrid_api_key") ||
    raw.includes("titan_app_password") ||
    raw.includes("reset password isn't enabled") ||
    raw.includes("reset_password_disabled")
  ) {
    return "We can’t email a reset link until mail is configured (RESEND_API_KEY or SENDGRID_API_KEY).";
  }
  if (
    raw.includes("could not send") ||
    raw.includes("email could not be sent") ||
    raw.includes("resend") ||
    raw.includes("sendgrid") ||
    raw.includes("titan")
  ) {
    return "The reset email could not be sent. Try again in a few minutes, or email support@kidease.ca. We did not treat this as sent.";
  }
  if (raw.includes("too many") || raw.includes("rate limit") || raw.includes("429") || raw.includes("try again in")) {
    const seconds = message?.match(/(\d+)\s*(s|sec|second|min)/i);
    if (seconds && /min/i.test(seconds[2] || "")) {
      const n = Number(seconds[1]);
      return n === 1 ? "Too many tries. Try again in 1 min." : `Too many tries. Try again in ${n} min.`;
    }
    if (seconds) return `Too many tries. Try again in ${Number(seconds[1])}s.`;
    if (raw.includes("try again in")) return message || "Too many tries. Try again in 1 min.";
    return "Too many tries. Try again in 1 min.";
  }
  if (raw.includes("security check")) {
    return message || "Please complete the security check.";
  }
  if (raw.includes("invalid origin") || raw.includes("invalid_origin")) {
    return "This page needs a refresh — try again.";
  }
  return message || "Could not send a reset email.";
}
