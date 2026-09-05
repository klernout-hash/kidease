/**
 * Server-side product flags. Default OFF.
 * Do not use these for auth, payments, or Turnstile — those stay env-gated
 * helpers (stripeChargesLive, turnstileMode, authConfigured).
 */

type EnvMap = Record<string, string | undefined>;

export function envFlagOn(raw: string | undefined | null): boolean {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function inAppChatEnabled(env: EnvMap = process.env): boolean {
  return envFlagOn(env.FEATURE_INAPP_CHAT);
}

export function pushEnabled(env: EnvMap = process.env): boolean {
  return envFlagOn(env.FEATURE_PUSH);
}

/** Transactional Twilio SMS (vacancy / claim / bill reminder). Default OFF. */
export function smsEnabled(env: EnvMap = process.env): boolean {
  return envFlagOn(env.FEATURE_SMS);
}

/** Daycare SaaS packages on the provider desk. Default OFF — admin still previews (ghost). */
export function providerSubscriptionsEnabled(env: EnvMap = process.env): boolean {
  return envFlagOn(env.FEATURE_PROVIDER_SUBSCRIPTIONS);
}

/**
 * Who may see the provider Subscription tab and page.
 * Admin always (ghost preview). Providers only when the flag is on.
 */
export function canSeeProviderSubscriptions(
  role: string | null | undefined,
  env: EnvMap = process.env,
): boolean {
  const r = String(role || "")
    .trim()
    .toLowerCase();
  if (r === "admin") return true;
  if (r === "provider") return providerSubscriptionsEnabled(env);
  return false;
}
