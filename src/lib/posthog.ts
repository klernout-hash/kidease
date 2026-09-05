import type { CapturedNetworkRequest, PostHog, PostHogConfig } from "posthog-js";

/** Public project key — set on Vercel as `VITE_PUBLIC_POSTHOG_KEY`. Not a secret. */
export const POSTHOG_KEY_ENV = "VITE_PUBLIC_POSTHOG_KEY";
/** Ingest host — set on Vercel as `POSTHOG_HOST`. Public URL, not a secret. */
export const POSTHOG_HOST_ENV = "POSTHOG_HOST";
export const POSTHOG_PUBLIC_HOST_ENV = "VITE_PUBLIC_POSTHOG_HOST";

export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
export const POSTHOG_US_INGEST = "https://us.i.posthog.com";
export const POSTHOG_US_ASSETS = "https://us-assets.i.posthog.com";

const SENSITIVE_PROP = /password|passwd|secret|authorization|api[_-]?key|otp|one[_-]?time/i;

let client: PostHog | null = null;
let started = false;
let identifiedId = "";
let pendingIdentify: string | null = null;

function envString(name: string): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return String(env?.[name] ?? "").trim();
}

export function posthogProjectKey(): string {
  return envString(POSTHOG_KEY_ENV);
}

export function posthogApiHost(): string {
  const host =
    envString(POSTHOG_PUBLIC_HOST_ENV) || envString(POSTHOG_HOST_ENV) || DEFAULT_POSTHOG_HOST;
  return host.replace(/\/$/, "");
}

export function posthogEnabled(): boolean {
  return Boolean(posthogProjectKey());
}

export function sanitizePostHogProperties(
  properties: Record<string, unknown>,
  _eventName?: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...properties };
  for (const key of Object.keys(next)) {
    if (SENSITIVE_PROP.test(key)) delete next[key];
  }
  return next;
}

export function maskCapturedNetworkRequest(
  request: CapturedNetworkRequest,
): CapturedNetworkRequest {
  return {
    ...request,
    requestBody: undefined,
    responseBody: undefined,
    requestHeaders: undefined,
    responseHeaders: undefined,
  };
}

/** Init options shared with tests — session replay is on, with total text/input masking. */
export function posthogInitOptions(): Partial<PostHogConfig> {
  return {
    api_host: posthogApiHost(),
    defaults: "2026-05-30",
    autocapture: true,
    capture_pageview: "history_change",
    capture_pageleave: "if_capture_pageview",
    person_profiles: "identified_only",
    disable_session_recording: false,
    advanced_disable_feature_flags: false,
    mask_all_text: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      maskInputOptions: { password: true },
      recordCrossOriginIframes: false,
      recordHeaders: false,
      recordBody: false,
      maskCapturedNetworkRequestFn: maskCapturedNetworkRequest,
    },
    sanitize_properties: sanitizePostHogProperties,
    loaded: (ph) => {
      client = ph as PostHog;
      if (pendingIdentify) {
        ph.identify(pendingIdentify);
        pendingIdentify = null;
      }
    },
  };
}

export function getPostHog(): PostHog | null {
  return client;
}

/** Feature-flag helper for later use. `undefined` until the client is live. */
export function isPostHogFlagEnabled(flag: string): boolean | undefined {
  return client?.isFeatureEnabled(flag);
}

/**
 * Identify with the Better Auth user id only — no email, name, or other PII.
 * Skip the sandbox `dev-user` so preview traffic is not pooled.
 */
export function identifyPostHogUser(distinctId: string): void {
  const id = distinctId.trim();
  if (!id || id === "dev-user") return;
  identifiedId = id;
  if (!client) {
    pendingIdentify = id;
    return;
  }
  if (client.get_distinct_id() === id) return;
  client.identify(id);
}

export function resetPostHogIdentity(): void {
  if (!identifiedId && !pendingIdentify) return;
  identifiedId = "";
  pendingIdentify = null;
  client?.reset();
}

/** SHA-256 hex of a normalized email — available if a stable user id is missing. */
export async function hashIdentifier(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Start PostHog once in the browser when the public key is set. No-op on the server. */
export function startPostHog(): void {
  if (started || typeof window === "undefined") return;
  const key = posthogProjectKey();
  if (!key) return;
  started = true;
  void import("posthog-js").then(({ default: posthog }) => {
    posthog.init(key, posthogInitOptions());
    client = posthog;
    if (pendingIdentify) {
      posthog.identify(pendingIdentify);
      pendingIdentify = null;
    }
  });
}

/** Test-only: clear the singleton so cases can re-run. */
export function resetPostHogClientForTests(): void {
  client = null;
  started = false;
  identifiedId = "";
  pendingIdentify = null;
}
