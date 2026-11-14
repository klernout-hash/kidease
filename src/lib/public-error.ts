/** Keep service setup and provider diagnostics out of user-facing errors. */
const INTERNAL_DETAIL = /\b(?:FEATURE|TWILIO|R2|STRIPE|FCM|APNS|VAPID)_[A-Z0-9_]+\b|\bVercel\b|\binternal ledger\b|\bscaffold(?:ed)?\b|\blive keys?\b|\bprice IDs?\b|^Twilio\b|^R2\b|\bFCM\b|\bAPNs\b|\bStripe (?:is not configured|did not return)\b|\bNo Stripe (?:customer|subscription)\b|^Calling is not open yet\.$/i;

/** Preserve actionable validation and access errors; use the caller's localized fallback for diagnostics. */
export function publicErrorMessage(error: unknown, fallback: string): string {
  const message = (typeof error === "string" ? error : error instanceof Error ? error.message : "").trim();
  return !message || INTERNAL_DETAIL.test(message) ? fallback : message;
}
