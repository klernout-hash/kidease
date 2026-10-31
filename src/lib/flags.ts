/**
 * Product feature flags: env defaults + optional PostHog overlay.
 *
 * Why PostHog (not Vercel Flags, Flagsmith, or LaunchDarkly): KidEase
 * already ships posthog-js, legal copy lists feature flags, and
 * `isPostHogFlagEnabled` exists. A thin POST /flags HTTP call needs no extra
 * SDK and no personal API key. Unset POSTHOG_FLAGS_KEY → env-only, same as today.
 *
 * Do not use these for auth or Turnstile.
 * SUBSCRIPTIONS_ENABLED is the one payments gate: it only decides whether
 * checkout is offered. Stripe secrets stay in their own env helpers.
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
  "SHOW_PAY_CTAS",
  "SUBSCRIPTIONS_ENABLED",
  "FOUNDING_BADGE_ENABLED",
  "FEATURE_OPEN_SPOT_ALERTS",
  "FEATURE_SPOT_OFFER_MAIL",
  "FEATURE_OPEN_SPOTS_CHECKIN_MAIL",
  "FEATURE_OPEN_SPOTS_CHECKIN_SMS",
  "FEATURE_QC_HOME_DAYCARES",
  "FEATURE_AREA_WAITLIST_ALERTS",
  "FEATURE_POSTHOG_ERRORS",
  "FEATURE_OPS_ALERTS",
  "FEATURE_CRON_HEARTBEATS",
  "FEATURE_INVOICE_REMINDERS",
  "FEATURE_PAYMENT_DUNNING",
  "FEATURE_MISSING_INFO_REMINDERS",
  "FEATURE_DAYCARE_ONBOARDING",
  "FEATURE_CLAIM_LISTING_REMINDERS",
  "FEATURE_STALE_OPEN_SPOTS",
  "FEATURE_POST_TOUR_FOLLOWUP",
  "FEATURE_ENROLMENT_REVIEW",
  "FEATURE_NEON_BACKUP",
  "FEATURE_INSPECTION_HISTORY",
  "FEATURE_PROVINCIAL_VACANCY_INDEX",
  "FEATURE_REVIEW_REPORTS",
  "FEATURE_TOUR_PIPELINE",
  "FEATURE_NEED_CARE_FAST",
  "FEATURE_INCLUSIVE_FILTERS",
  "FEATURE_ECE_JOBS",
  "FEATURE_DIGITAL_ATTENDANCE",
  "FEATURE_STAFF_SCHEDULING",
  "FEATURE_LEARNING_PORTFOLIOS",
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
  SHOW_PAY_CTAS: false,
  /** Paid daycare and parent plans. Off during the free founding period. */
  SUBSCRIPTIONS_ENABLED: false,
  /** Founding member badge on claimed listings. The marker stays either way. */
  FOUNDING_BADGE_ENABLED: true,
  FEATURE_OPEN_SPOT_ALERTS: false,
  FEATURE_SPOT_OFFER_MAIL: false,
  FEATURE_OPEN_SPOTS_CHECKIN_MAIL: false,
  FEATURE_OPEN_SPOTS_CHECKIN_SMS: false,
  /** Quebec recognized home daycares. Off until Kyle publishes them. */
  FEATURE_QC_HOME_DAYCARES: false,
  /** Area waitlist email. Off until Kyle approves the wording. */
  FEATURE_AREA_WAITLIST_ALERTS: false,
  /** Browser and server exception capture in PostHog. Off. Bots and WebDriver are filtered. */
  FEATURE_POSTHOG_ERRORS: false,
  /** Email kyle@kidease.ca on error spikes and failed crons. Off. Dry-run until _LIVE. */
  FEATURE_OPS_ALERTS: false,
  /** Better Stack heartbeat after each successful cron. Off. */
  FEATURE_CRON_HEARTBEATS: false,
  /** Bill reminders: 3 days before, due date, 3 and 7 days late. Off. */
  FEATURE_INVOICE_REMINDERS: false,
  /** Follow-ups after a failed payment. Off. Stops when the bill is paid. */
  FEATURE_PAYMENT_DUNNING: false,
  /** Weekly mail for missing listing facts and a missing child profile. Off. */
  FEATURE_MISSING_INFO_REMINDERS: false,
  /** Daycare emails on day 0, 2, and 7 after claim. Off. */
  FEATURE_DAYCARE_ONBOARDING: false,
  /** Claim reminders to unclaimed centres with a public business email. Off. Dry-run until _LIVE. */
  FEATURE_CLAIM_LISTING_REMINDERS: false,
  /** Hide open spots not updated in 30 days, with a reminder at day 21. Off. */
  FEATURE_STALE_OPEN_SPOTS: false,
  /** Email 24 hours after a tour. Off. */
  FEATURE_POST_TOUR_FOLLOWUP: false,
  /** Optional review invite about 30 days after enrolment. Off. No review gating. */
  FEATURE_ENROLMENT_REVIEW: false,
  /** Weekly Neon backup to R2 plus a restore-list check. Off. */
  FEATURE_NEON_BACKUP: false,
  /** Cached public inspection rows on a listing. Off until Kyle turns it on. */
  FEATURE_INSPECTION_HISTORY: false,
  /** Per-province vacancy index, confirm history, and freshness bands. */
  FEATURE_PROVINCIAL_VACANCY_INDEX: false,
  /** Report a published parent review, and show a rating from the first review. */
  FEATURE_REVIEW_REPORTS: false,
  /** No-show stage, reminder moves, and a calendar file in the tour email. */
  FEATURE_TOUR_PIPELINE: false,
  /** Need care fast sorts by open spots, then distance. OpenStreetMap pins only. */
  FEATURE_NEED_CARE_FAST: false,
  /** Diet and extra-support fields on the centre profile. */
  FEATURE_INCLUSIVE_FILTERS: false,
  /** Post, apply, and review ECE applicants. No charge. */
  FEATURE_ECE_JOBS: false,
  /** Door check-in and check-out without a camera. */
  FEATURE_DIGITAL_ATTENDANCE: false,
  /** Staff shifts, ECE certificates, and room ratios. Off until Kyle turns it on. */
  FEATURE_STAFF_SCHEDULING: false,
  /** Private learning stories for enrolled families. Off until Kyle turns it on. */
  FEATURE_LEARNING_PORTFOLIOS: false,
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
    summary: "One push path for website (VAPID) and phones (FCM / APNs). Default off. Production stays disarmed without secrets.",
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
  {
    key: "SHOW_PAY_CTAS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Parent and director Upgrade / Subscribe / plan-price chrome. Default off. Stripe code stays. Admin catalog stays. Ignored while SUBSCRIPTIONS_ENABLED is off.",
  },
  {
    key: "SUBSCRIPTIONS_ENABLED",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Paid plans and checkout. Default off: free founding period, no charges, daycare tools unlocked, signed-in parents get Parent Plus tools with no upgrade button. Set 1 to restore the current subscription flow. Env or PostHog. No redeploy when PostHog is already connected.",
  },
  {
    key: "FOUNDING_BADGE_ENABLED",
    defaultOn: true,
    docs: "docs/flags.md",
    summary:
      "Founding member badge. Default on. Turning it off hides the badge. The founding_member marker on the listing stays.",
  },
  {
    key: "FEATURE_OPEN_SPOT_ALERTS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Email when a saved search matches a newly posted open spot. Default off. Saving a search still works. Needs CASL.",
  },
  {
    key: "FEATURE_SPOT_OFFER_MAIL",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Email when a daycare sends a 48-hour spot offer. Default off. The offer still shows in the parent account.",
  },
  {
    key: "FEATURE_OPEN_SPOTS_CHECKIN_MAIL",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Weekly open-spots email to claimed daycares. Default off. No send until this is on.",
  },
  {
    key: "FEATURE_OPEN_SPOTS_CHECKIN_SMS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary: "Weekly open-spots SMS. Default off. Also needs FEATURE_SMS and consent. The toll-free sender is approved.",
  },
  {
    key: "FEATURE_QC_HOME_DAYCARES",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Quebec recognized home daycares. Default off. Area only, no street pin, no email or text to those providers.",
  },
  {
    key: "FEATURE_AREA_WAITLIST_ALERTS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Email when an area waitlist matches a posted spot. Default off. Kyle approved the wording. In-app notices still save.",
  },
  {
    key: "FEATURE_POSTHOG_ERRORS",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "PostHog exception capture on the website and server. Default off. Bots and WebDriver are dropped. Needs _LIVE to send.",
  },
  {
    key: "FEATURE_OPS_ALERTS",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Email kyle@kidease.ca for a daily digest and an immediate note when a cron fails or errors spike. Default off.",
  },
  {
    key: "FEATURE_CRON_HEARTBEATS",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Ping a Better Stack heartbeat after each successful cron. Default off. Unset URL is a no-op.",
  },
  {
    key: "FEATURE_INVOICE_REMINDERS",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Email a parent 3 days before a bill is due, on the due date, and 3 and 7 days later. Stops when paid. Default off.",
  },
  {
    key: "FEATURE_PAYMENT_DUNNING",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Email after a failed payment, then 3 and 7 days later. Stops when paid. Does not replace the Stripe webhook. Default off.",
  },
  {
    key: "FEATURE_MISSING_INFO_REMINDERS",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Weekly email listing exactly which licence, photo, fee, hours, contact, or ages are missing. Also a parent missing a child profile. Default off.",
  },
  {
    key: "FEATURE_DAYCARE_ONBOARDING",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Three emails after a centre is claimed: the same day, day 2, and day 7. Default off.",
  },
  {
    key: "FEATURE_CLAIM_LISTING_REMINDERS",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Email unclaimed centres at their published business address. CASL implied consent, unsubscribe, daily cap. Default off and dry-run until _LIVE.",
  },
  {
    key: "FEATURE_STALE_OPEN_SPOTS",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Remind at day 21 and hide open spots that were not updated for 30 days. Default off.",
  },
  {
    key: "FEATURE_POST_TOUR_FOLLOWUP",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "One email about 24 hours after a tour. Default off.",
  },
  {
    key: "FEATURE_ENROLMENT_REVIEW",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "One optional review invite about 30 days after enrolment. Every enrolled parent gets it. No star gate. Default off.",
  },
  {
    key: "FEATURE_NEON_BACKUP",
    defaultOn: false,
    docs: "docs/automations.md",
    summary: "Weekly pg_dump to R2 and a pg_restore list check. Alerts on failure. Default off.",
  },
  {
    key: "FEATURE_INSPECTION_HISTORY",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Show cached Ontario, British Columbia, and Alberta inspection rows on a listing. Default off. Rows must cite a public government page. KidEase does not invent a violation.",
  },
  {
    key: "FEATURE_PROVINCIAL_VACANCY_INDEX",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Per-province open-spot pages, confirm history, and freshness bands. Default off. The national vacancy index stays either way.",
  },
  {
    key: "FEATURE_REVIEW_REPORTS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Report a published parent review, and show a parent rating from the first review. Default off. Three-review summaries stay.",
  },
  {
    key: "FEATURE_TOUR_PIPELINE",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Tour no-show, moved reminders, and a calendar file in the booking email. Default off. Booking a tour still works.",
  },
  {
    key: "FEATURE_NEED_CARE_FAST",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Need care fast lists more open spots first, then closer centres. Default off. Closest-first stays. No Google Maps.",
  },
  {
    key: "FEATURE_INCLUSIVE_FILTERS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Halal, kosher, nut-free, vegetarian, and extra support on the centre profile. Default off. Search chips stay.",
  },
  {
    key: "FEATURE_ECE_JOBS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Post an ECE role, apply, and see applicants. Default off. Does not charge and does not turn subscriptions on.",
  },
  {
    key: "FEATURE_DIGITAL_ATTENDANCE",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Check-in page records arrival and pickup for an enrolled child. Default off. The old camera preview stays. No photo of a child.",
  },
  {
    key: "FEATURE_STAFF_SCHEDULING",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Staff shifts, ECE certificate expiry reminders, and room ratios on the daycare desk. Default off. Not payroll. Email only, no SMS.",
  },
  {
    key: "FEATURE_LEARNING_PORTFOLIOS",
    defaultOn: false,
    docs: "docs/flags.md",
    summary:
      "Private learning stories for enrolled parents. Default off. No photos. Not shown on the public listing.",
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
