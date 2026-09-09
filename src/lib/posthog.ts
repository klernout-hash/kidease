import type { CapturedNetworkRequest, PostHog, PostHogConfig } from "posthog-js";
import {
  analyticsConsentAllowsReplay,
  readAnalyticsConsent,
  shouldStartPostHog,
  type AnalyticsConsent,
} from "./analytics-consent.ts";
import { envFlagOn, envFlagSet } from "./flags.ts";
import { isNative } from "./native.ts";
import { POSTHOG_PROXY_PATH, POSTHOG_UI_HOST } from "./posthog-proxy.ts";

export { POSTHOG_PROXY_PATH, POSTHOG_UI_HOST } from "./posthog-proxy.ts";

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
/** Production website origin. Used when the WebView origin is not http(s) or is empty. */
export const POSTHOG_FIRST_PARTY_ORIGIN = "https://www.kidease.ca";
const PH_QUEUE_KEY = "kidease-ph-queue";
const PH_QUEUE_MAX = 24;
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

function isDefaultUsIngest(host: string): boolean {
  const cleaned = host.replace(/\/$/, "");
  return (
    !cleaned ||
    cleaned === DEFAULT_POSTHOG_HOST ||
    cleaned === POSTHOG_US_INGEST ||
    cleaned === "https://us.posthog.com" ||
    cleaned.endsWith(".i.posthog.com")
  );
}

/**
 * Browser ingest URL. Default is the first-party `/ingest` reverse proxy so
 * ad blockers that filter us.i.posthog.com do not drop events.
 * `POSTHOG_HOST` / `VITE_PUBLIC_POSTHOG_HOST` stay the *upstream* (US ingest)
 * unless they point at a non-default host (managed proxy, EU).
 * Capacitor's production WebView is `https://www.kidease.ca` — use the same
 * first-party proxy so `$lib_custom_api_host` is set and the reverse_proxy
 * health warning can clear. Never return a bare `/ingest` path (PostHog
 * health does not count a relative host).
 */
export function posthogApiHost(
  env: EnvMap = viteEnv(),
  _native?: boolean,
  origin?: string,
): string {
  const host =
    envString(POSTHOG_PUBLIC_HOST_ENV, env) || envString(POSTHOG_HOST_ENV, env) || "";
  const cleaned = host.replace(/\/$/, "");
  if (cleaned && !isDefaultUsIngest(cleaned)) return cleaned;
  const loc =
    origin ??
    (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "");
  const base = String(loc).replace(/\/$/, "");
  if (base && /^https?:\/\//i.test(base)) return `${base}${POSTHOG_PROXY_PATH}`;
  return `${POSTHOG_FIRST_PARTY_ORIGIN}${POSTHOG_PROXY_PATH}`;
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
 * Default on for web when the project key is set and the visitor allowed
 * analytics. Off when consent is unset or denied, the env kill switch is 0,
 * or we are in Capacitor (unless native replay is on).
 */
export function sessionReplayEnabled(input: SessionReplayGateInput = {}): boolean {
  const env = input.env ?? viteEnv();
  if (envFlagSet(env[POSTHOG_REPLAY_ENV]) && !envFlagOn(env[POSTHOG_REPLAY_ENV])) {
    return false;
  }
  const native = input.native ?? (typeof window !== "undefined" && isNative());
  if (native && !envFlagOn(env[POSTHOG_REPLAY_NATIVE_ENV])) return false;
  if (native) return true;
  const consent = input.consent ?? readAnalyticsConsent();
  return analyticsConsentAllowsReplay(consent);
}

export function sanitizePostHogProperties(
  properties: Record<string, unknown>,
  _eventName?: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...properties };
  for (const key of Object.keys(next)) {
    if (key.startsWith("$lib_")) continue;
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
 * Essential (denied) opts out of capture on the website. A missing PostHog
 * flag does not block sampled replay once the visitor has allowed analytics.
 */
export function applyPostHogRecordingGate(ph?: PostHog | null): void {
  const consent = readAnalyticsConsent();
  if (consent === "denied") clearQueuedPostHogEvents();
  const clientPh = ph ?? client;
  if (!clientPh) return;
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
    api_host: posthogApiHost(env, input.native),
    ui_host: POSTHOG_UI_HOST,
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
      flushQueuedPostHogEvents(ph as PostHog);
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

type QueuedPostHogEvent = { event: string; properties: Record<string, unknown> };

function readQueuedPostHogEvents(): QueuedPostHogEvent[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(PH_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedPostHogEvent[]).slice(0, PH_QUEUE_MAX) : [];
  } catch {
    return [];
  }
}

function writeQueuedPostHogEvents(items: QueuedPostHogEvent[]): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (!items.length) sessionStorage.removeItem(PH_QUEUE_KEY);
    else sessionStorage.setItem(PH_QUEUE_KEY, JSON.stringify(items.slice(0, PH_QUEUE_MAX)));
  } catch {
    /* private mode */
  }
}

export function clearQueuedPostHogEvents(): void {
  writeQueuedPostHogEvents([]);
}

function enqueuePostHogEvent(event: string, properties: Record<string, unknown>): void {
  const next = [...readQueuedPostHogEvents(), { event, properties }];
  writeQueuedPostHogEvents(next.slice(-PH_QUEUE_MAX));
}

export function flushQueuedPostHogEvents(ph?: PostHog | null): void {
  const clientPh = ph ?? client;
  if (!clientPh) return;
  const items = readQueuedPostHogEvents();
  writeQueuedPostHogEvents([]);
  for (const item of items) {
    if (!item?.event) continue;
    clientPh.capture(item.event, item.properties ?? {});
  }
}

/** Capture a product event. Queues across hard navigations until the client is live. */
export function capturePostHogEvent(event: string, properties: Record<string, unknown> = {}): void {
  const name = event.trim();
  if (!name) return;
  if (readAnalyticsConsent() === "denied") return;
  const props = sanitizePostHogProperties(properties, name);
  if (client) {
    client.capture(name, props);
    return;
  }
  enqueuePostHogEvent(name, props);
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
  if (!shouldStartPostHog()) return;
  started = true;
  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key, posthogInitOptions());
      client = posthog;
      flushQueuedPostHogEvents(posthog);
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
  clearQueuedPostHogEvents();
}
