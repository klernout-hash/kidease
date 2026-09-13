/** Honest wait copy for OTP / login / forgot-password soft caps. Never silent. */

export const AUTH_LOGIN_WINDOW_S = 60;
export const AUTH_LOGIN_MAX = 30;
export const AUTH_SIGNUP_MAX = 15;
export const AUTH_FORGOT_MAX = 8;

/** Hourly OTP send cap. 15s resend cooldown (#187) still applies first. */
export const TWO_FACTOR_HOURLY_MAX = 20;
export const TWO_FACTOR_HOURLY_MS = 60 * 60 * 1000;

export function parseRetryAfterSeconds(raw?: string | null, fallback = 60): number {
  const text = String(raw ?? "").trim();
  if (!text) return Math.max(1, Math.ceil(fallback));
  const asNumber = Number(text);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.max(1, Math.ceil(asNumber));
  }
  const when = Date.parse(text);
  if (Number.isFinite(when)) {
    return Math.max(1, Math.ceil((when - Date.now()) / 1000));
  }
  return Math.max(1, Math.ceil(fallback));
}

export function rateLimitWaitCopy(seconds: number): string {
  const n = Math.max(1, Math.ceil(seconds));
  if (n < 60) return `Too many tries. Try again in ${n}s.`;
  const min = Math.ceil(n / 60);
  return min === 1 ? "Too many tries. Try again in 1 min." : `Too many tries. Try again in ${min} min.`;
}

export function hourlyOtpWaitCopy(seconds: number): string {
  const n = Math.max(1, Math.ceil(seconds));
  if (n < 60) return `Try again in ${n}s.`;
  const min = Math.ceil(n / 60);
  return min === 1 ? "Try again in 1 min." : `Try again in ${min} min.`;
}

export function looksLikeRateLimit(message?: string | null): boolean {
  const raw = (message || "").toLowerCase();
  return (
    raw.includes("too many") ||
    raw.includes("rate limit") ||
    raw.includes("try again in") ||
    raw.includes("429")
  );
}
