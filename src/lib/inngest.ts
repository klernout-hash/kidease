/**
 * Inngest env helpers. The SDK client can be constructed without keys so
 * the app boots when INNGEST_* is unset. Cloud sync and event send need
 * both keys on Vercel (Production + Preview).
 *
 * Never invent secret values. Kyle pastes Event + Signing keys from
 * Inngest Cloud (or the Vercel integration) into the kidease-git project.
 */
type EnvMap = Record<string, string | undefined>;

export const INNGEST_ENV_NAMES = ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"] as const;

export const INNGEST_APP_ID = "kidease";

/** Hourly :20 — same cadence as vercel.json `/api/search-alerts`. */
export const SEARCH_ALERTS_CRON = "TZ=America/Winnipeg 20 * * * *";

export const SEARCH_ALERTS_EVENT = "kidease/search-alerts.run";

/** Director / capacity "spot open" — one event per pulse row (idempotent). */
export const WAITLIST_PULSE_EVENT = "kidease/waitlist.pulse";

export function inngestEventKey(env: EnvMap = process.env): string {
  return String(env.INNGEST_EVENT_KEY || "").trim();
}

export function inngestSigningKey(env: EnvMap = process.env): string {
  return String(env.INNGEST_SIGNING_KEY || "").trim();
}

/** True only when both Cloud keys are present. Absent env = off. */
export function inngestConfigured(env: EnvMap = process.env): boolean {
  return Boolean(inngestEventKey(env) && inngestSigningKey(env));
}

/**
 * When Inngest Cloud owns the hourly schedule, the Vercel cron endpoint
 * should no-op so the job does not run twice. `?dryRun=1` and `?force=1`
 * still run locally (ops / fallback).
 */
export function shouldDeferSearchAlertsToInngest(
  request: Request,
  env: EnvMap = process.env,
): boolean {
  if (!inngestConfigured(env)) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("dryRun") === "1") return false;
  if (url.searchParams.get("force") === "1") return false;
  return true;
}
