/**
 * Product feature flags: env defaults + optional PostHog overlay.
 *
 * Why PostHog (not Vercel Flags, Flagsmith, or LaunchDarkly): KidEase
 * already ships posthog-js, legal copy lists feature flags, and
 * `isPostHogFlagEnabled` exists. A thin POST /flags HTTP call needs no extra
 * SDK and no personal API key. Unset POSTHOG_FLAGS_KEY → env-only, same as today.
 *
 * Do not use these for auth, payments, or Turnstile.
 * FEATURE_PUSH and FEATURE_SMS default off. Do not flip them here.
 *
 * No @/ imports — scripts/flags.test.mjs loads this file in Node.
 */

export type EnvMap = Record<string, string | undefined>;

export const FEATURE_FLAG_KEYS = [
  "FEATURE_INAPP_CHAT",
  "FEATURE_PUSH",
  "FEATURE_SMS",
  "FEATURE_VIDEO",
  "FEATURE_PROVIDER_SUBSCRIPTIONS",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export type FlagSource = "remote" | "env" | "default";

export type FlagDecision = {
  key: FeatureFlagKey;
  enabled: boolean;
  source: FlagSource;
  envEnabled: boolean;
  envSet: boolean;
  remoteValue: boolean | null;
  remoteConfigured: boolean;
};

export type RemoteFlagSnapshot = {
  flags: Partial<Record<FeatureFlagKey, boolean>>;
  fetchedAt: number;
  provider: "posthog" | "none";
  ok: boolean;
  error?: string;
};

export const POSTHOG_FLAGS_KEY_ENV = "POSTHOG_FLAGS_KEY";
export const POSTHOG_FLAGS_HOST_ENV = "POSTHOG_FLAGS_HOST";
export const SERVER_FLAGS_DISTINCT_ID = "kidease-server";
export const REMOTE_FLAGS_TTL_MS = 30_000;
export const REMOTE_FLAGS_TIMEOUT_MS = 1_200;
export const DEFAULT_POSTHOG_FLAGS_HOST = "https://us.i.posthog.com";

/** Defaults when env is unset and PostHog has not returned the key. */
export const FLAG_DEFAULTS: Record<FeatureFlagKey, boolean> = {
  FEATURE_INAPP_CHAT: false,
  FEATURE_PUSH: false,
  FEATURE_SMS: false,
  FEATURE_VIDEO: false,
  FEATURE_PROVIDER_SUBSCRIPTIONS: true,
};

/** Staff-facing catalog. Names match env / PostHog keys exactly. */
export type FeatureFlagCatalogRow = {
  key: FeatureFlagKey;
  defaultOn: boolean;
  docs: string;
  summary: string;
};

export const FEATURE_FLAG_CATALOG: readonly FeatureFlagCatalogRow[] = [
  {
    key: "FEATURE_INAPP_CHAT",
    defaultOn: false,
    docs: "docs/chat.md",
    summary: "Extra parent/admin chat kinds. Composer stays disabled. Live threads stay on /inbox.",
  },
  {
    key: "FEATURE_PUSH",
    defaultOn: false,
    docs: "docs/push.md",
    summary: "FCM HTTP v1 / APNs. Native-only. Production stays off without secrets. Preview may override.",
  },
  {
    key: "FEATURE_SMS",
    defaultOn: false,
    docs: "docs/sms.md",
    summary: "Transactional Twilio Programmable SMS (not Verify). Production stays off without secrets.",
  },
  {
    key: "FEATURE_VIDEO",
    defaultOn: false,
    docs: "docs/video.md",
    summary: "Parent Plus Twilio Video. Inbox hidden until SDK is wired. Production stays off without secrets.",
  },
  {
    key: "FEATURE_PROVIDER_SUBSCRIPTIONS",
    defaultOn: true,
    docs: "docs/flags.md",
    summary: "Director Subscription tab. Live by default. Checkout still needs Stripe live keys.",
  },
];

let cache: RemoteFlagSnapshot | null = null;
let inflight: Promise<RemoteFlagSnapshot> | null = null;

export function envMap(env?: EnvMap): EnvMap {
  if (env) return env;
  if (typeof process !== "undefined" && process.env) return process.env;
  return {};
}

export function envFlagOn(raw: string | undefined | null): boolean {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function envFlagSet(raw: string | undefined | null): boolean {
  return raw != null && String(raw).trim() !== "";
}

export function remoteFlagsKey(env?: EnvMap): string {
  return String(envMap(env)[POSTHOG_FLAGS_KEY_ENV] || "").trim();
}

export function remoteFlagsConfigured(env?: EnvMap): boolean {
  return Boolean(remoteFlagsKey(env));
}

export function flagsHost(env?: EnvMap): string {
  const mapped = envMap(env);
  const host = String(mapped[POSTHOG_FLAGS_HOST_ENV] || mapped.POSTHOG_HOST || DEFAULT_POSTHOG_FLAGS_HOST)
    .trim()
    .replace(/\/$/, "");
  return host || DEFAULT_POSTHOG_FLAGS_HOST;
}

export function parseRemoteFlagValue(raw: unknown): boolean | undefined {
  if (raw === true) return true;
  if (raw === false) return false;
  if (typeof raw === "number") return raw === 1;
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  if (!v || v === "false" || v === "0" || v === "off" || v === "no") return false;
  if (v === "true" || v === "1" || v === "on" || v === "yes") return true;
  // Multivariate variant name means the flag is on for this distinct id.
  return true;
}

/**
 * Merge policy: a boolean from PostHog wins when that key was returned.
 * Missing remote key / no provider / fetch failure → env, then FLAG_DEFAULTS.
 */
export function resolveFlag(input: {
  envRaw: string | undefined | null;
  remoteValue?: boolean | null;
  defaultWhenUnset?: boolean;
}): { enabled: boolean; source: FlagSource } {
  if (input.remoteValue === true || input.remoteValue === false) {
    return { enabled: input.remoteValue, source: "remote" };
  }
  if (envFlagSet(input.envRaw)) {
    return { enabled: envFlagOn(input.envRaw), source: "env" };
  }
  return { enabled: input.defaultWhenUnset ?? false, source: "default" };
}

function isProcessEnv(env?: EnvMap): boolean {
  return !env || (typeof process !== "undefined" && env === process.env);
}

export function peekRemoteFlag(key: FeatureFlagKey): boolean | undefined {
  if (!cache || !Object.prototype.hasOwnProperty.call(cache.flags, key)) return undefined;
  return cache.flags[key];
}

export function peekRemoteSnapshot(): RemoteFlagSnapshot | null {
  return cache;
}

export function describeFeatureFlag(
  key: FeatureFlagKey,
  env?: EnvMap,
  options?: { remote?: Partial<Record<string, boolean>> | null },
): FlagDecision {
  const mapped = envMap(env);
  const envRaw = mapped[key];
  const useCache = options?.remote === undefined && isProcessEnv(env);
  if (useCache) scheduleRemoteRefresh();
  const remoteMap = options?.remote !== undefined ? options.remote : useCache ? (cache?.flags ?? null) : null;
  const remoteValue =
    remoteMap && Object.prototype.hasOwnProperty.call(remoteMap, key) ? remoteMap[key] : null;
  const resolved = resolveFlag({
    envRaw,
    remoteValue: typeof remoteValue === "boolean" ? remoteValue : null,
    defaultWhenUnset: FLAG_DEFAULTS[key],
  });
  return {
    key,
    enabled: resolved.enabled,
    source: resolved.source,
    envEnabled: envFlagSet(envRaw) ? envFlagOn(envRaw) : FLAG_DEFAULTS[key],
    envSet: envFlagSet(envRaw),
    remoteValue: typeof remoteValue === "boolean" ? remoteValue : null,
    remoteConfigured: remoteFlagsConfigured(mapped),
  };
}

export function evaluateFeatureFlag(
  key: FeatureFlagKey,
  env?: EnvMap,
  options?: { remote?: Partial<Record<string, boolean>> | null },
): boolean {
  return describeFeatureFlag(key, env, options).enabled;
}

export function listFeatureFlagDecisions(env?: EnvMap): FlagDecision[] {
  return FEATURE_FLAG_KEYS.map((key) => describeFeatureFlag(key, env));
}

export function parsePostHogFlagsResponse(body: unknown): Partial<Record<FeatureFlagKey, boolean>> {
  const out: Partial<Record<FeatureFlagKey, boolean>> = {};
  if (!body || typeof body !== "object") return out;
  const rec = body as Record<string, unknown>;
  const flags = rec.featureFlags ?? rec.flags;
  if (!flags || typeof flags !== "object") return out;
  const map = flags as Record<string, unknown>;
  for (const key of FEATURE_FLAG_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
    const parsed = parseRemoteFlagValue(map[key]);
    if (typeof parsed === "boolean") out[key] = parsed;
  }
  return out;
}

export async function fetchPostHogFlags(input: {
  apiKey: string;
  host?: string;
  distinctId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<Partial<Record<FeatureFlagKey, boolean>>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const host = (input.host || DEFAULT_POSTHOG_FLAGS_HOST).replace(/\/$/, "");
  const timeoutMs = input.timeoutMs ?? REMOTE_FLAGS_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${host}/flags?v=2`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: input.apiKey,
        distinct_id: input.distinctId || SERVER_FLAGS_DISTINCT_ID,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`PostHog flags HTTP ${res.status}`);
    }
    return parsePostHogFlagsResponse(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshRemoteFlags(
  env?: EnvMap,
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteFlagSnapshot> {
  const mapped = envMap(env);
  const key = remoteFlagsKey(mapped);
  if (!key) {
    const snap: RemoteFlagSnapshot = {
      flags: {},
      fetchedAt: Date.now(),
      provider: "none",
      ok: true,
    };
    if (isProcessEnv(env)) cache = snap;
    return snap;
  }
  try {
    const flags = await fetchPostHogFlags({
      apiKey: key,
      host: flagsHost(mapped),
      fetchImpl,
    });
    const snap: RemoteFlagSnapshot = {
      flags,
      fetchedAt: Date.now(),
      provider: "posthog",
      ok: true,
    };
    if (isProcessEnv(env)) cache = snap;
    return snap;
  } catch (err) {
    return {
      flags: cache?.flags ?? {},
      fetchedAt: cache?.fetchedAt ?? 0,
      provider: "posthog",
      ok: false,
      error: err instanceof Error ? err.message : "flags fetch failed",
    };
  }
}

function scheduleRemoteRefresh(): void {
  if (typeof process === "undefined" || !process.env) return;
  if (!remoteFlagsKey(process.env)) return;
  if (cache && cache.ok && Date.now() - cache.fetchedAt < REMOTE_FLAGS_TTL_MS) return;
  if (inflight) return;
  inflight = refreshRemoteFlags(process.env).finally(() => {
    inflight = null;
  });
}

/** Test-only: drop the in-process overlay so cases stay isolated. */
export function resetRemoteFlagsForTests(): void {
  cache = null;
  inflight = null;
}

/** Test-only: seed the process.env overlay. */
export function setRemoteFlagCacheForTests(flags: Partial<Record<FeatureFlagKey, boolean>> | null): void {
  if (flags == null) {
    cache = null;
    return;
  }
  cache = { flags, fetchedAt: Date.now(), provider: "posthog", ok: true };
}
