/**
 * Server-side product flags. Default OFF (except provider subscriptions).
 * Env is the safe fallback. Optional PostHog overlay: see src/lib/flags.ts
 * and docs/flags.md. Do not use these for auth, payments, or Turnstile —
 * those stay env-gated helpers (stripeChargesLive, turnstileMode, authConfigured).
 *
 * FEATURE_PUSH and FEATURE_SMS stay off unless env or PostHog explicitly enables them.
 */

import { evaluateFeatureFlag, type EnvMap } from "./flags.ts";

export { envFlagOn, evaluateFeatureFlag, describeFeatureFlag } from "./flags.ts";
export type { EnvMap, FeatureFlagKey, FlagDecision, FlagSource } from "./flags.ts";
export {
  describeChannelReadiness,
  isVercelProduction,
  pushArmed,
  smsArmed,
  smsSendEnabled,
  videoArmed,
  videoSurfaceEnabled,
} from "./channel-readiness.ts";

export function inAppChatEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_INAPP_CHAT", env);
}

export function pushEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_PUSH", env);
}

/** Transactional Twilio SMS (vacancy / claim / bill reminder). Default OFF. */
export function smsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_SMS", env);
}

/** Parent ↔ centre Twilio Video tours (Parent Plus). Default OFF. */
export function videoEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_VIDEO", env);
}

/**
 * Daycare SaaS packages on the provider desk. LIVE by default.
 * Set FEATURE_PROVIDER_SUBSCRIPTIONS=0 only to hide the tab from directors
 * (admin can still preview — ghost).
 */
export function providerSubscriptionsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_PROVIDER_SUBSCRIPTIONS", env);
}

/** Honest copy when SHOW_PAY_CTAS is off. Stripe / plan code stays compiled. */
export const PLANS_NOT_OFFERED_YET =
  "Plans are not offered on this site yet. Listing and claim stay free.";

/**
 * Parent- and director-facing Upgrade / Subscribe / plan-price chrome.
 * Default OFF. Does not delete Stripe, webhooks, or plan tables.
 * Set SHOW_PAY_CTAS=1 to restore CTAs once SUBSCRIPTIONS_ENABLED is on.
 * Admin Stripe screens stay available.
 *
 * Master switch for paid plans. Default off (free founding period).
 * Env `SUBSCRIPTIONS_ENABLED=1` or the same PostHog flag turns checkout back on.
 * While off, showPayCtas and canUsePayCheckout stay false for every role.
 */
export function subscriptionsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("SUBSCRIPTIONS_ENABLED", env);
}

/** Public Founding member badge. Default on. Does not clear the database marker. */
export function foundingBadgeEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FOUNDING_BADGE_ENABLED", env);
}

export function showPayCtas(env?: EnvMap): boolean {
  if (!subscriptionsEnabled(env)) return false;
  return evaluateFeatureFlag("SHOW_PAY_CTAS", env);
}

/** Email when a saved search matches a newly posted open spot. Default off. */
export function openSpotAlertsEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_OPEN_SPOT_ALERTS", env);
}

/** Live checkout for KidEase plans. Refuses everyone while subscriptions are off. */
export function canUsePayCheckout(role?: string | null, env?: EnvMap): boolean {
  if (!subscriptionsEnabled(env)) return false;
  if (showPayCtas(env)) return true;
  const r = String(role || "")
    .trim()
    .toLowerCase();
  return r === "admin";
}

export function assertPayCheckoutAllowed(role?: string | null, env?: EnvMap): void {
  if (!canUsePayCheckout(role, env)) {
    throw new Error(PLANS_NOT_OFFERED_YET);
  }
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
