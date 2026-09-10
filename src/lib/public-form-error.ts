/** Map public help/contact failures to an honest, user-visible message. */
export function publicFormErrorMessage(err: unknown, inbox: string): string {
  const raw = err instanceof Error ? err.message : String(err || "");
  const lower = raw.toLowerCase();
  if (
    lower.includes("security check") ||
    lower.includes("turnstile") ||
    lower.includes("captcha")
  ) {
    return raw || "Please complete the security check, then try again.";
  }
  if (raw.trim()) return raw;
  return `Could not send. Email ${inbox} directly.`;
}
