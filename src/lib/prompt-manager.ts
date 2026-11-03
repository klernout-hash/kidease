/**
 * One bottom prompt at a time. Priority: cookie consent first, then Get alerts.
 * The push explainer waits for a consent answer AND sign-up or first save, and is asked once ever.
 * Email + in-app alerts are on by default; SMS stays CASL opt-in only.
 * Snooze/decline helpers stay for the native explainer.
 */
export const MEANINGFUL_ACTION_EVENT = "kidease:meaningful-action";
export const OPEN_COOKIE_SETTINGS_EVENT = "kidease:open-cookie-settings";
export const ALERT_SNOOZE_KEY = "ke-web-alert-snooze-until";
export const ALERT_DECLINES_KEY = "ke-web-alert-declines";
export const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_DECLINES = 2;
/** Nothing pops in the first seconds of a visit. */
export const FIRST_VISIT_QUIET_MS = 8000;

export type MeaningfulAction = "save" | "message" | "tour" | "signup";

export function markMeaningfulAction(kind: MeaningfulAction): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MEANINGFUL_ACTION_EVENT, { detail: { kind } }));
}

export function openCookieSettings(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}

export function alertPromptAllowed(input: {
  consent: "granted" | "denied" | "unset";
  cookieBannerOpen: boolean;
  acted: boolean;
  now: number;
  snoozeUntil: number;
  declines: number;
  choice: string | null;
  msSinceLoad: number;
}): boolean {
  if (input.consent === "unset" || input.cookieBannerOpen) return false;
  if (!input.acted) return false;
  if (input.choice === "yes" || input.choice === "never") return false;
  if (input.declines >= MAX_DECLINES) return false;
  if (input.now < input.snoozeUntil) return false;
  if (input.msSinceLoad < FIRST_VISIT_QUIET_MS) return false;
  return true;
}

export function recordDecline(store: Pick<Storage, "getItem" | "setItem">, now: number): number {
  const declines = (Number(store.getItem(ALERT_DECLINES_KEY)) || 0) + 1;
  store.setItem(ALERT_DECLINES_KEY, String(declines));
  store.setItem(ALERT_SNOOZE_KEY, String(now + SNOOZE_MS));
  return declines;
}
