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
