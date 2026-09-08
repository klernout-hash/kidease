/**
 * Production uptime wiring (Better Stack). No SDK — HTTP monitors live in the
 * Better Stack dashboard. Heartbeat URL is optional; the app boots without it.
 */

import { SENTRY_DSN_ENV, SENTRY_PUBLIC_DSN_ENV } from "./sentry-shared.ts";

export const HEALTH_PATH = "/api/health";
export const UPTIME_ORIGIN = "https://www.kidease.ca";
export const UPTIME_HOME_URL = `${UPTIME_ORIGIN}/`;
export const UPTIME_HEALTH_URL = `${UPTIME_ORIGIN}${HEALTH_PATH}`;
export const UPTIME_ALERT_EMAIL = "kyle@kidease.ca";

/** Optional. Paste the Heartbeat URL from Better Stack. Never commit a value. */
export const BETTERSTACK_HEARTBEAT_ENV = "BETTERSTACK_HEARTBEAT_URL";

/** Dashboard-only. Not read by the app. Paste in Better Stack, not Vercel. */
export const BETTERSTACK_UPTIME_TOKEN_ENV = "BETTERSTACK_UPTIME_API_TOKEN";

const HEARTBEAT_HOSTS = new Set(["uptime.betterstack.com", "betteruptime.com"]);

export type HealthCheckState = "ok" | "skipped" | "error";

export type HealthChecks = {
  app: HealthCheckState;
  database: HealthCheckState;
};

export const PRODUCTION_HEALTH_SIGNAL = "production_health";
/** Distinct from GitHub Actions fail-rate. Better Stack 503 after a Production deploy. */
export const PRODUCTION_CFR_SIGNAL = "production_change_failure";

export type HealthSentryState = "configured" | "unset";

export type HealthCfr = {
  signal: typeof PRODUCTION_CFR_SIGNAL;
  /** True when this probe itself is a failed production change (503). */
  candidate: boolean;
  /** Whether Sentry ingest is configured. Never includes the DSN. */
  sentry: HealthSentryState;
  /** Stable Better Stack keyword. Present only when `candidate` is true. */
  alert?: "cfr_candidate";
};

export type HealthRuntime = "vercel" | "local";

export type HealthPayload = {
  ok: boolean;
  status: "ok" | "degraded";
  service: "kidease";
  /** Distinct from GitHub Actions fail-rate. Better Stack should key on this. */
  signal: typeof PRODUCTION_HEALTH_SIGNAL;
  checks: HealthChecks;
  /** Short git SHA when Vercel inlines it. Never a secret. */
  revision?: string;
  runtime?: HealthRuntime;
  /** Production change-failure / crash signal for Better Stack + Sentry. */
  cfr: HealthCfr;
};

export function healthHeaders(): Headers {
  return new Headers({
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow",
    "content-type": "application/json; charset=utf-8",
  });
}

export function healthHttpStatus(checks: HealthChecks): number {
  return checks.app === "ok" && checks.database !== "error" ? 200 : 503;
}

export function healthRevision(env: NodeJS.ProcessEnv = process.env): string {
  const sha = String(env.VERCEL_GIT_COMMIT_SHA ?? "").trim();
  return sha ? sha.slice(0, 7) : "";
}

export function healthRuntime(env: NodeJS.ProcessEnv = process.env): HealthRuntime {
  return String(env.VERCEL ?? "").trim() ? "vercel" : "local";
}

export function healthSentryState(env: NodeJS.ProcessEnv = process.env): HealthSentryState {
  const dsn = String(env[SENTRY_DSN_ENV] ?? env[SENTRY_PUBLIC_DSN_ENV] ?? "").trim();
  return dsn ? "configured" : "unset";
}

export function buildHealthCfr(
  checks: HealthChecks,
  env: NodeJS.ProcessEnv = process.env,
): HealthCfr {
  const candidate = healthHttpStatus(checks) !== 200;
  return {
    signal: PRODUCTION_CFR_SIGNAL,
    candidate,
    sentry: healthSentryState(env),
    ...(candidate ? { alert: "cfr_candidate" as const } : {}),
  };
}

export function buildHealthPayload(
  checks: HealthChecks,
  env: NodeJS.ProcessEnv = process.env,
): HealthPayload {
  const ok = healthHttpStatus(checks) === 200;
  const revision = healthRevision(env);
  const runtime = healthRuntime(env);
  return {
    ok,
    status: ok ? "ok" : "degraded",
    service: "kidease",
    signal: PRODUCTION_HEALTH_SIGNAL,
    checks,
    ...(revision ? { revision } : {}),
    runtime,
    cfr: buildHealthCfr(checks, env),
  };
}

export function betterStackHeartbeatUrl(env: NodeJS.ProcessEnv = process.env): string {
  return String(env[BETTERSTACK_HEARTBEAT_ENV] ?? "").trim();
}

/** True only for Better Stack heartbeat hosts — refuse arbitrary URLs. */
export function isAllowedHeartbeatUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && HEARTBEAT_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Optional Better Stack heartbeat. No-ops when the URL is unset so local
 * and Vercel boot without monitor keys. Refuses non-Better-Stack hosts.
 */
export async function pingBetterStackHeartbeat(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: true; skipped: true } | { ok: boolean; skipped: false }> {
  const url = betterStackHeartbeatUrl(env);
  if (!url) return { ok: true, skipped: true };
  if (!isAllowedHeartbeatUrl(url)) return { ok: false, skipped: false };
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual" });
    return { ok: res.ok, skipped: false };
  } catch {
    return { ok: false, skipped: false };
  }
}

export function classifyPublicHealth({
  status = 0,
  bodyText = "",
}: {
  status?: number;
  bodyText?: string;
} = {}): { ok: boolean; kind: string; reason?: string } {
  if (status !== 200) {
    return { ok: false, kind: "down", reason: `health HTTP ${status}` };
  }
  let json: { ok?: unknown; service?: unknown } | null = null;
  try {
    json = bodyText ? (JSON.parse(bodyText) as { ok?: unknown; service?: unknown }) : null;
  } catch {
    return { ok: false, kind: "invalid", reason: "health body is not JSON" };
  }
  if (json?.ok === true && json.service === "kidease") {
    return { ok: true, kind: "ok" };
  }
  return { ok: false, kind: "invalid", reason: "health JSON missing ok/service" };
}
