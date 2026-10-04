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

/** Hourly :50 — expire overdue tour soft-holds and free the seat. */
export const TOUR_HOLDS_CRON = "TZ=America/Winnipeg 50 * * * *";

export const TOUR_HOLDS_EVENT = "kidease/tour-holds.expire";

/** Nightly 02:15 America/Winnipeg — demand vs supply snapshot. No PII. */
export const RANKING_MARKET_CRON = "TZ=America/Winnipeg 15 2 * * *";

export const RANKING_MARKET_EVENT = "kidease/ranking-market.run";

/** Nightly 03:15 America/Winnipeg — official MB and NB opening import. */
export const PROVINCIAL_VACANCY_CRON = "TZ=America/Winnipeg 15 3 * * *";

export const PROVINCIAL_VACANCY_EVENT = "kidease/provincial-vacancy.run";

/** Nightly 04:15 America/Winnipeg — compare websites on file. No-ops when the flag is off. */
export const TRUTH_CHECK_CRON = "TZ=America/Winnipeg 15 4 * * *";

export const TRUTH_CHECK_EVENT = "kidease/truth-check.run";

/** Hourly :40 America/Winnipeg. Expire 48-hour spot offers and offer the next family. */
export const SPOT_OFFERS_CRON = "TZ=America/Winnipeg 40 * * * *";

export const SPOT_OFFERS_EVENT = "kidease/spot-offers.expire";

/** Monday 09:15 America/Winnipeg. No-ops while check-in flags stay off. */
export const OPEN_SPOTS_CHECKIN_CRON = "TZ=America/Winnipeg 15 9 * * 1";

export const OPEN_SPOTS_CHECKIN_EVENT = "kidease/open-spots-checkin.run";

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
  return shouldDeferCronToInngest(request, env);
}

export function shouldDeferTourHoldsToInngest(
  request: Request,
  env: EnvMap = process.env,
): boolean {
  return shouldDeferCronToInngest(request, env);
}

export function shouldDeferOpenSpotsCheckinToInngest(
  request: Request,
  env: EnvMap = process.env,
): boolean {
  return shouldDeferCronToInngest(request, env);
}

export function shouldDeferRankingMarketToInngest(
  request: Request,
  env: EnvMap = process.env,
): boolean {
  return shouldDeferCronToInngest(request, env);
}

export function shouldDeferProvincialVacancyToInngest(
  request: Request,
  env: EnvMap = process.env,
): boolean {
  return shouldDeferCronToInngest(request, env);
}

export function shouldDeferSpotOffersToInngest(
  request: Request,
  env: EnvMap = process.env,
): boolean {
  return shouldDeferCronToInngest(request, env);
}

function shouldDeferCronToInngest(request: Request, env: EnvMap): boolean {
  if (!inngestConfigured(env)) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("dryRun") === "1") return false;
  if (url.searchParams.get("force") === "1") return false;
  return true;
}
