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

/** Wait for `load` this long, then idle-arm so `/search` content can win LCP. */
export const ANALYTICS_CONSENT_BANNER_LOAD_CAP_MS = 2500;
/** Idle timeout after first paint / load before we listen for first input. */
export const ANALYTICS_CONSENT_BANNER_IDLE_TIMEOUT_MS = 2000;
/**
 * First input finalizes LCP. Reveal on a later task so `/menu` LCP stays the
 * heading and `/parent` + `/verify-2fa` INP do not include banner paint.
 */
export const ANALYTICS_CONSENT_BANNER_REVEAL_YIELD_MS = 0;
export const ANALYTICS_CONSENT_BANNER_INTERACTION_EVENTS = [
  "pointerdown",
  "keydown",
  "touchstart",
  "scroll",
  "focusin",
] as const;

type IdleCallback = (deadline?: { didTimeout: boolean; timeRemaining: () => number }) => void;

export type ConsentBannerScheduleEnv = {
  readyState?: DocumentReadyState;
  requestIdleCallback?: (cb: IdleCallback, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
  setTimeout?: (cb: () => void, ms: number) => number;
  clearTimeout?: (id: number) => void;
  addLoadListener?: (cb: () => void) => () => void;
  addInteractionListener?: (cb: () => void) => () => void;
  /** After first input, run `show` on a later task (default: setTimeout 0). */
  yieldReveal?: (cb: () => void) => () => void;
};

/**
 * Mount the cookie banner after first contentful paint / load idle.
 * Analytics stay off until Allow — only the chrome is deferred.
 */
export function scheduleAnalyticsConsentBannerReveal(
  show: () => void,
  env: ConsentBannerScheduleEnv = {},
): () => void {
  let cancelled = false;
  let revealed = false;
  let idleId = 0;
  let fallbackId = 0;
  let capId = 0;
  let removeLoad: (() => void) | undefined;
  let removeInteraction: (() => void) | undefined;
  let cancelYield: (() => void) | undefined;

  const setT = env.setTimeout ?? ((cb: () => void, ms: number) => globalThis.setTimeout(cb, ms) as unknown as number);
  const clearT = env.clearTimeout ?? ((id: number) => globalThis.clearTimeout(id));
  const ric =
    env.requestIdleCallback ??
    (typeof globalThis.requestIdleCallback === "function"
      ? globalThis.requestIdleCallback.bind(globalThis)
      : undefined);
  const cancelRic =
    env.cancelIdleCallback ??
    (typeof globalThis.cancelIdleCallback === "function"
      ? globalThis.cancelIdleCallback.bind(globalThis)
      : undefined);

  const reveal = () => {
    if (cancelled || revealed) return;
    revealed = true;
    removeInteraction?.();
    removeInteraction = undefined;
    cancelYield?.();
    cancelYield = undefined;
    show();
  };

  const defaultYieldReveal = (cb: () => void) => {
    const id = setT(cb, ANALYTICS_CONSENT_BANNER_REVEAL_YIELD_MS);
    return () => clearT(id);
  };

  const scheduleReveal = () => {
    if (cancelled || revealed) return;
    cancelYield?.();
    const yielder = env.yieldReveal ?? defaultYieldReveal;
    cancelYield = yielder(reveal);
  };

  const defaultInteractionListen = (cb: () => void) => {
    if (typeof window === "undefined") return () => undefined;
    const opts = { once: true, passive: true, capture: true } as const;
    const onEvent = () => cb();
    for (const name of ANALYTICS_CONSENT_BANNER_INTERACTION_EVENTS) {
      window.addEventListener(name, onEvent, opts);
    }
    return () => {
      for (const name of ANALYTICS_CONSENT_BANNER_INTERACTION_EVENTS) {
        window.removeEventListener(name, onEvent, opts);
      }
    };
  };

  const armInteraction = () => {
    if (cancelled || revealed) return;
    const listen = env.addInteractionListener ?? defaultInteractionListen;
    removeInteraction = listen(scheduleReveal);
  };

  const armIdle = () => {
    if (cancelled || revealed) return;
    clearT(capId);
    capId = 0;
    if (ric) {
      idleId = ric(armInteraction, { timeout: ANALYTICS_CONSENT_BANNER_IDLE_TIMEOUT_MS });
      return;
    }
    fallbackId = setT(armInteraction, ANALYTICS_CONSENT_BANNER_IDLE_TIMEOUT_MS);
  };

  const ready = env.readyState ?? (typeof document !== "undefined" ? document.readyState : "loading");
  if (ready === "complete") {
    armIdle();
  } else {
    if (env.addLoadListener) {
      removeLoad = env.addLoadListener(armIdle);
    } else if (typeof window !== "undefined") {
      window.addEventListener("load", armIdle, { once: true });
      removeLoad = () => window.removeEventListener("load", armIdle);
    }
    capId = setT(armIdle, ANALYTICS_CONSENT_BANNER_LOAD_CAP_MS);
  }

  return () => {
    cancelled = true;
    removeLoad?.();
    removeInteraction?.();
    cancelYield?.();
    if (idleId && cancelRic) cancelRic(idleId);
    clearT(fallbackId);
    clearT(capId);
  };
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
