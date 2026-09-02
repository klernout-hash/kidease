/**
 * Precise location is when-in-use only. Never request background location
 * (no always-on permission, no background geolocation plugin).
 */
export type LocationConsent = "unset" | "granted" | "denied";

export const LOCATION_CONSENT_KEY = "kidease-location-consent";

export function readLocationConsent(): LocationConsent {
  if (typeof window === "undefined") return "unset";
  try {
    const saved = window.localStorage.getItem(LOCATION_CONSENT_KEY);
    if (saved === "granted" || saved === "denied") return saved;
  } catch {
    /* ignore */
  }
  return "unset";
}

export function writeLocationConsent(value: LocationConsent) {
  if (typeof window === "undefined") return;
  try {
    if (value === "unset") window.localStorage.removeItem(LOCATION_CONSENT_KEY);
    else window.localStorage.setItem(LOCATION_CONSENT_KEY, value);
  } catch {
    /* ignore */
  }
}

export function isBackgroundLocationRequested(source: string) {
  return /always|background/i.test(source);
}
