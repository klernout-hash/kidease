import type { CapturedNetworkRequest, PostHog, PostHogConfig } from "posthog-js";
import {
  analyticsConsentAllowsReplay,
  readAnalyticsConsent,
  type AnalyticsConsent,
} from "./analytics-consent.ts";
import { envFlagOn, envFlagSet } from "./flags.ts";
import { isNative } from "./native.ts";

/** Public project key — set on Vercel as `VITE_PUBLIC_POSTHOG_KEY`. Not a secret. */
export const POSTHOG_KEY_ENV = "VITE_PUBLIC_POSTHOG_KEY";
/** Ingest host — set on Vercel as `POSTHOG_HOST`. Public URL, not a secret. */
export const POSTHOG_HOST_ENV = "POSTHOG_HOST";
export const POSTHOG_PUBLIC_HOST_ENV = "VITE_PUBLIC_POSTHOG_HOST";
/** Client kill switch for session replay. Unset = on (web) when the project key is set. */
export const POSTHOG_REPLAY_ENV = "VITE_PUBLIC_POSTHOG_REPLAY";
/** Sample rate 0–1 (or 0–100). Default 0.2 so replay cost stays bounded. */
export const POSTHOG_REPLAY_SAMPLE_ENV = "VITE_PUBLIC_POSTHOG_REPLAY_SAMPLE";
/** Capacitor iOS/Android replay. Default off — web is the supported surface. */
export const POSTHOG_REPLAY_NATIVE_ENV = "VITE_PUBLIC_POSTHOG_REPLAY_NATIVE";

export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
export const POSTHOG_US_INGEST = "https://us.i.posthog.com";
export const POSTHOG_US_ASSETS = "https://us-assets.i.posthog.com";
export const DEFAULT_REPLAY_SAMPLE_RATE = 0.2;
/** Client kill switch in PostHog. Missing flag still records (sampled). Off stops recordings. */
export const POSTHOG_REPLAY_FLAG = "session-replay-web";

const SENSITIVE_PROP =
  /password|passwd|secret|authorization|api[_-]?key|otp|one[_-]?time|email|e-mail|phone|child[_-]?name|first[_-]?name|last[_-]?name|full[_-]?name|preferred[_-]?name|allerg|medical|medication|birthdate|date[_-]?of[_-]?birth|ssn|health|emergency/i;

let client: PostHog | null = null;
let started = false;
let identifiedId = "";
let pendingIdentify: string | null = null;

type EnvMap = Record<string, string | undefined>;

function viteEnv(): EnvMap {
  const env = (import.meta as ImportMeta & { env?: EnvMap }).env;
  return env ?? {};
}

function envString(name: string, env: EnvMap = viteEnv()): string {
  return String(env[name] ?? "").trim();
}

export function posthogProjectKey(env: EnvMap = viteEnv()): string {
  return envString(POSTHOG_KEY_ENV, env);
}

export function posthogApiHost(env: EnvMap = viteEnv()): string {
  const host =
    envString(POSTHOG_PUBLIC_HOST_ENV, env) || envString(POSTHOG_HOST_ENV, env) || DEFAULT_POSTHOG_HOST;
  return host.replace(/\/$/, "");
}

export function posthogEnabled(env: EnvMap = viteEnv()): boolean {
  return Boolean(posthogProjectKey(env));
}

export function parseReplaySampleRate(raw?: string | null): number {
  const s = String(raw ?? "").trim();
  if (!s) return DEFAULT_REPLAY_SAMPLE_RATE;
  const n = Number(s);
  if (!Number.isFinite(n)) return DEFAULT_REPLAY_SAMPLE_RATE;
  if (n > 1 && n <= 100) return Math.min(1, n / 100);
  return Math.min(1, Math.max(0, n));
}

export function replaySampleRate(env: EnvMap = viteEnv()): number {
  return parseReplaySampleRate(envString(POSTHOG_REPLAY_SAMPLE_ENV, env));
}

export type SessionReplayGateInput = {
  native?: boolean;
  consent?: AnalyticsConsent;
  env?: EnvMap;
};

/**
 * Whether this browser may start a recording.
 * Default on for web when the project key is set. Off when consent is denied,
 * the env kill switch is 0, or we are in Capacitor (unless native replay is on).
 */
export function sessionReplayEnabled(input: SessionReplayGateInput = {}): boolean {
  const env = input.env ?? viteEnv();
  if (envFlagSet(env[POSTHOG_REPLAY_ENV]) && !envFlagOn(env[POSTHOG_REPLAY_ENV])) {
    return false;
  }
  const native = input.native ?? (typeof window !== "undefined" && isNative());
  if (native && !envFlagOn(env[POSTHOG_REPLAY_NATIVE_ENV])) return false;
  const consent = input.consent ?? readAnalyticsConsent();
  return analyticsConsentAllowsReplay(consent);
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

/**
 * Apply consent + env + `session-replay-web` after init or flag reload.
 * Denied consent opts out of capture. A missing PostHog flag does not block
 * sampled replay (fully on by default).
 */
export function applyPostHogRecordingGate(ph?: PostHog | null): void {
  const clientPh = ph ?? client;
  if (!clientPh) return;
  const consent = readAnalyticsConsent();
  if (consent === "denied") {
    clientPh.stopSessionRecording();
    clientPh.opt_out_capturing();
    return;
  }
  if (!sessionReplayEnabled({ consent })) {
    clientPh.stopSessionRecording();
    return;
  }
  if (clientPh.isFeatureEnabled(POSTHOG_REPLAY_FLAG) === false) {
    clientPh.stopSessionRecording();
    return;
  }
  clientPh.startSessionRecording();
}

/** Init options shared with tests — web replay on, sampled, PII-safe masking. */
export function posthogInitOptions(input: SessionReplayGateInput = {}): Partial<PostHogConfig> {
  const env = input.env ?? viteEnv();
  const replayOn = sessionReplayEnabled(input);
  return {
    api_host: posthogApiHost(env),
    defaults: "2026-05-30",
    autocapture: true,
    capture_pageview: "history_change",
    capture_pageleave: "if_capture_pageview",
    person_profiles: "identified_only",
    disable_session_recording: !replayOn,
    advanced_disable_feature_flags: false,
    mask_all_text: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      maskInputOptions: { password: true, email: true, tel: true },
      recordCrossOriginIframes: false,
      recordHeaders: false,
      recordBody: false,
      sampleRate: replaySampleRate(env),
      maskCapturedNetworkRequestFn: maskCapturedNetworkRequest,
    },
    sanitize_properties: sanitizePostHogProperties,
    loaded: (ph) => {
      client = ph as PostHog;
      if (pendingIdentify) {
        ph.identify(pendingIdentify);
        pendingIdentify = null;
      }
      ph.onFeatureFlags(() => applyPostHogRecordingGate(ph as PostHog));
      applyPostHogRecordingGate(ph as PostHog);
    },
  };
}

export function getPostHog(): PostHog | null {
  return client;
}

/**
 * Client-side PostHog flag read. `undefined` until the browser client is live.
 * Send gates (SMS / push / video) use `src/lib/flags.ts` on the server — env
 * fallback plus optional POSTHOG_FLAGS_KEY. Do not treat this helper as the
 * source of truth for those rollouts.
 */
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
  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key, posthogInitOptions());
      client = posthog;
      if (pendingIdentify) {
        posthog.identify(pendingIdentify);
        pendingIdentify = null;
      }
    })
    .catch(() => {
      client = null;
    });
}

/** Test-only: clear the singleton so cases can re-run. */
export function resetPostHogClientForTests(): void {
  client = null;
  started = false;
  identifiedId = "";
  pendingIdentify = null;
}
