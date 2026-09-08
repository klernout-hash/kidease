/**
 * Server-side product flags. Default OFF.
 * Do not use these for auth, payments, or Turnstile — those stay env-gated
 * helpers (stripeChargesLive, turnstileMode, authConfigured).
 */

type EnvMap = Record<string, string | undefined>;

function envMap(env?: EnvMap): EnvMap {
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

export function inAppChatEnabled(env?: EnvMap): boolean {
  return envFlagOn(envMap(env).FEATURE_INAPP_CHAT);
}

export function pushEnabled(env?: EnvMap): boolean {
  return envFlagOn(envMap(env).FEATURE_PUSH);
}

/** Transactional Twilio SMS (vacancy / claim / bill reminder). Default OFF. */
export function smsEnabled(env?: EnvMap): boolean {
  return envFlagOn(envMap(env).FEATURE_SMS);
}

/** Parent ↔ centre Twilio Video tours (Parent Plus). Default OFF. */
export function videoEnabled(env?: EnvMap): boolean {
  return envFlagOn(envMap(env).FEATURE_VIDEO);
}

/**
 * Daycare SaaS packages on the provider desk. LIVE by default.
 * Set FEATURE_PROVIDER_SUBSCRIPTIONS=0 only to hide the tab from directors
 * (admin can still preview — ghost).
 */
export function providerSubscriptionsEnabled(env?: EnvMap): boolean {
  const raw = envMap(env).FEATURE_PROVIDER_SUBSCRIPTIONS;
  if (raw == null || String(raw).trim() === "") return true;
  return envFlagOn(raw);
}

/**
 * Who may see the provider Subscription tab and page.
 * Directors (and anyone who owns a centre) when the feature is live.
 * Admin always, including kill-switch preview.
 */
export function canSeeProviderSubscriptions(
  role: string | null | undefined,
  env?: EnvMap,
  ownsCentre = false,
): boolean {
  const r = String(role || "")
    .trim()
    .toLowerCase();
  if (r === "admin") return true;
  if (r === "provider" || ownsCentre) return providerSubscriptionsEnabled(env);
  return false;
}
