/**
 * Website analytics / session-replay consent (PIPEDA-friendly).
 *
 * Stored in localStorage as `granted` or `denied` under ANALYTICS_CONSENT_KEY
 * (same key the PostHog replay gate already reads — do not invent another).
 *
 * - unset: no choice yet → do not load PostHog on the website; show the banner
 * - granted: visitor tapped Allow analytics
 * - denied: visitor tapped Essential (required cookies only)
 *
 * Capacitor does not use this banner. Native init stays on the existing
 * website-vs-native replay gates in `src/lib/posthog.ts`.
 */

import { isNative } from "./native.ts";

export type AnalyticsConsent = "unset" | "granted" | "denied";

export const ANALYTICS_CONSENT_KEY = "kidease-analytics-consent";

function normalizeConsent(raw: string | null): AnalyticsConsent {
  const saved = String(raw ?? "").trim();
  if (saved === "granted" || saved === "denied") return saved;
  const lower = saved.toLowerCase();
  if (lower === "allow" || lower === "allowed" || lower === "1" || lower === "true" || lower === "opt-in") {
    return "granted";
  }
  if (
    lower === "essential" ||
    lower === "required" ||
    lower === "0" ||
    lower === "false" ||
    lower === "opt-out"
  ) {
    return "denied";
  }
  return "unset";
}

export function readAnalyticsConsent(storage?: Pick<Storage, "getItem"> | null): AnalyticsConsent {
  const store = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!store) return "unset";
  try {
    return normalizeConsent(store.getItem(ANALYTICS_CONSENT_KEY));
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

/** PostHog (pageviews, autocapture, replay) only after Allow. */
export function analyticsConsentAllowsCapture(
  consent: AnalyticsConsent = readAnalyticsConsent(),
): boolean {
  return consent === "granted";
}

/** Replay follows the same Allow decision. Unset is not a yes. */
export function analyticsConsentAllowsReplay(
  consent: AnalyticsConsent = readAnalyticsConsent(),
): boolean {
  return analyticsConsentAllowsCapture(consent);
}

export type AnalyticsConsentSurfaceInput = {
  native?: boolean;
  consent?: AnalyticsConsent;
};

function resolveNative(input?: AnalyticsConsentSurfaceInput): boolean {
  if (typeof input?.native === "boolean") return input.native;
  return typeof window !== "undefined" && isNative();
}

/** Website (including mobile web chrome). Not the Capacitor shell. */
export function analyticsConsentApplies(input: AnalyticsConsentSurfaceInput = {}): boolean {
  return !resolveNative(input);
}

/** Show Essential vs Allow until a stored choice exists — website only. */
export function shouldShowAnalyticsConsentBanner(
  input: AnalyticsConsentSurfaceInput = {},
): boolean {
  if (!analyticsConsentApplies(input)) return false;
  const consent = input.consent ?? readAnalyticsConsent();
  return consent === "unset";
}

/**
 * Website: start PostHog only after Allow.
 * Capacitor: this cookie banner does not apply — existing native replay env
 * still keeps session recording off unless explicitly enabled.
 */
export function shouldStartPostHog(input: AnalyticsConsentSurfaceInput = {}): boolean {
  if (!analyticsConsentApplies(input)) return true;
  return analyticsConsentAllowsCapture(input.consent ?? readAnalyticsConsent());
}
