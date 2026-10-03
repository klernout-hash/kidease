/**
 * Consent-gated sign-up funnel steps.
 * capturePostHogEvent already drops events when analytics consent is denied.
 * Payloads stay coarse: no email, name, child, or listing slug.
 */

export const SIGNUP_FUNNEL_EVENT = "signup_funnel";

export const SIGNUP_FUNNEL_STEPS = [
  "prompt_save",
  "prompt_waitlist",
  "prompt_alerts",
  "prompt_message",
  "email_continue",
  "google_continue",
  "shortlist_carried",
  "claim_cta",
  "claim_started",
  "claim_progress_view",
] as const;

export type SignupFunnelStep = (typeof SIGNUP_FUNNEL_STEPS)[number];

export const SIGNUP_WHYS = ["save", "waitlist", "alerts", "message"] as const;
export type SignupWhy = (typeof SIGNUP_WHYS)[number];

const STEP_SET = new Set<string>(SIGNUP_FUNNEL_STEPS);

export function isSignupFunnelStep(value: unknown): value is SignupFunnelStep {
  return typeof value === "string" && STEP_SET.has(value);
}

export function isSignupWhy(value: unknown): value is SignupWhy {
  return value === "save" || value === "waitlist" || value === "alerts" || value === "message";
}

export function signupPromptStep(why: SignupWhy): SignupFunnelStep {
  if (why === "save") return "prompt_save";
  if (why === "waitlist") return "prompt_waitlist";
  if (why === "alerts") return "prompt_alerts";
  return "prompt_message";
}

/** Coarse props only. Unknown keys are dropped. */
export function signupFunnelPayload(
  step: SignupFunnelStep,
  extra?: { carried?: number; source?: "card" | "listing" | "login" | "claim" | "desk" },
): Record<string, string | number> {
  const payload: Record<string, string | number> = { step };
  if (extra?.source) payload.source = extra.source;
  if (typeof extra?.carried === "number" && extra.carried > 0) {
    payload.carried = Math.min(20, Math.round(extra.carried));
  }
  return payload;
}
