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
