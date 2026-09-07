/** Map Better Auth / mail failures to copy we can show on the reset forms. */
export function friendlyResetMailError(message?: string | null) {
  const raw = (message || "").toLowerCase();
  if (
    raw.includes("not configured") ||
    raw.includes("resend_api_key") ||
    raw.includes("sendgrid_api_key") ||
    raw.includes("reset password isn't enabled") ||
    raw.includes("reset_password_disabled")
  ) {
    return "We can’t email a reset link until mail is configured (RESEND_API_KEY or SENDGRID_API_KEY).";
  }
  if (
    raw.includes("could not send") ||
    raw.includes("email could not be sent") ||
    raw.includes("resend") ||
    raw.includes("sendgrid")
  ) {
    return "The reset email could not be sent. Try again in a few minutes.";
  }
  if (raw.includes("security check")) {
    return message || "Please complete the security check.";
  }
  if (raw.includes("invalid origin") || raw.includes("invalid_origin")) {
    return "This page needs a refresh — try again.";
  }
  return message || "Could not send a reset email.";
}
