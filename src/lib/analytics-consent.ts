/**
 * Analytics / session-replay consent.
 *
 * KidEase does not ship a cookie banner today (no advertising cookies).
 * Unset therefore means “allowed” — first-party product analytics already
 * disclosed on /privacy and /cookies.
 *
 * When a banner lands, write `granted` or `denied` here and call
 * `applyPostHogRecordingGate()` so replay (and capture, if denied) follow it.
 */

export type AnalyticsConsent = "unset" | "granted" | "denied";

export const ANALYTICS_CONSENT_KEY = "kidease-analytics-consent";

export function readAnalyticsConsent(storage?: Pick<Storage, "getItem"> | null): AnalyticsConsent {
  const store = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!store) return "unset";
  try {
    const saved = store.getItem(ANALYTICS_CONSENT_KEY);
    if (saved === "granted" || saved === "denied") return saved;
    const lower = String(saved || "")
      .trim()
      .toLowerCase();
    if (lower === "0" || lower === "false" || lower === "opt-out") return "denied";
    if (lower === "1" || lower === "true" || lower === "opt-in") return "granted";
  } catch {
    /* private mode / blocked storage */
  }
  return "unset";
}

export function writeAnalyticsConsent(
  value: AnalyticsConsent,
  storage?: Pick<Storage, "setItem" | "removeItem"> | null,
): void {
  const store = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!store) return;
  try {
    if (value === "unset") store.removeItem(ANALYTICS_CONSENT_KEY);
    else store.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch {
    /* ignore */
  }
}

/** Replay may start when there is no banner decision, or the user granted it. */
export function analyticsConsentAllowsReplay(consent: AnalyticsConsent = readAnalyticsConsent()): boolean {
  return consent !== "denied";
}
