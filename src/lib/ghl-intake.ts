/**
 * Site → GoHighLevel CRM intake (Path B).
 * Env-gated: unset URLs no-op. Never throws. Independent of Resend / SMS.
 *
 * GHL_WEBHOOK_DAYCARE_SIGNUP_URL — provider signup, claim verify, Enroll Now
 * GHL_WEBHOOK_PARENT_ONBOARD_URL — parent signup
 * If only one URL is set, every intake event POSTs to that router URL.
 * FEATURE_GHL_INTAKE=0 disables POSTs without removing URLs.
 *
 * Reads live Node env (not a Vite `process.env` snapshot) so Vercel secrets
 * are visible after deploy. One retry on network / 5xx. 4xx is final.
 */

import { runtimeProcessEnv, type EnvMap } from "./runtime-env.ts";

export const GHL_DAYCARE_SIGNUP_URL_ENV = "GHL_WEBHOOK_DAYCARE_SIGNUP_URL";
export const GHL_PARENT_ONBOARD_URL_ENV = "GHL_WEBHOOK_PARENT_ONBOARD_URL";
export const GHL_INTAKE_FLAG_ENV = "FEATURE_GHL_INTAKE";
/** Per attempt. Two attempts so a blip still lands before the signup response returns. */
export const GHL_WEBHOOK_TIMEOUT_MS = 2500;
const GHL_ATTEMPTS = 2;

export type GhlIntakeAudience = "daycare" | "parent";
export type GhlIntakeTrigger = "parent_signup" | "provider_signup" | "claim_verify" | "enroll";

export type GhlSignupPayload = {
  email: string;
  name: string;
  phone: string;
  company: string;
  tags: string[];
  kidease_event_id: string;
};

export type GhlIntakeResult =
  | { ok: true; skipped: true; reason: "flag-off" | "no-webhook-url" }
  | { ok: true; skipped: false; status: number }
  | { ok: false; error: string };

function readEnv(env?: EnvMap): EnvMap {
  return env ?? runtimeProcessEnv();
}

export function ghlIntakeEnabled(env?: EnvMap): boolean {
  const raw = (readEnv(env)[GHL_INTAKE_FLAG_ENV] || "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}

export function ghlAudienceForTrigger(trigger: GhlIntakeTrigger): GhlIntakeAudience {
  return trigger === "parent_signup" ? "parent" : "daycare";
}

/**
 * Canonical tags for every intake. Claim verify adds `claim:claimed` so the
 * CRM workflow can flip `claim:unclaimed` → `claim:claimed`. Enroll Now adds
 * `form:enroll` and still keeps `form:signup`.
 */
export function ghlIntakeTags(audience: GhlIntakeAudience, trigger?: GhlIntakeTrigger): string[] {
  const tags = ["source:website", `type:${audience}`, "form:signup"];
  if (trigger === "claim_verify") tags.push("claim:claimed");
  if (trigger === "enroll") tags.push("form:enroll");
  return tags;
}

function trimUrl(raw?: string | null): string {
  return (raw || "").trim();
}

/** Prefer the audience URL; fall back to the other so one pasted router URL still works. */
export function resolveGhlWebhookUrl(audience: GhlIntakeAudience, env?: EnvMap): string | null {
  const source = readEnv(env);
  const daycare = trimUrl(source[GHL_DAYCARE_SIGNUP_URL_ENV]);
  const parent = trimUrl(source[GHL_PARENT_ONBOARD_URL_ENV]);
  const picked = audience === "parent" ? parent || daycare : daycare || parent;
  return picked || null;
}

export function shouldPostGhlIntake(audience: GhlIntakeAudience, env?: EnvMap): boolean {
  return ghlIntakeEnabled(env) && Boolean(resolveGhlWebhookUrl(audience, env));
}

export function buildGhlSignupPayload(input: {
  trigger: GhlIntakeTrigger;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  eventId?: string | null;
}): GhlSignupPayload {
  return {
    email: (input.email || "").trim(),
    name: (input.name || "").trim(),
    phone: (input.phone || "").trim(),
    company: (input.company || "").trim(),
    tags: ghlIntakeTags(ghlAudienceForTrigger(input.trigger), input.trigger),
    kidease_event_id: (input.eventId || "").trim(),
  };
}

function retryableStatus(status: number): boolean {
  return status >= 500;
}

/**
 * Best-effort POST. Missing env / flag-off / network errors never throw.
 * Callers must not gate signup, claim verify, enroll, or Admin notify on this result.
 */
export async function postGhlSignupIntake(input: {
  trigger: GhlIntakeTrigger;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  eventId?: string | null;
  fetchImpl?: typeof fetch;
  env?: EnvMap;
  onSkip?: (reason: "flag-off" | "no-webhook-url") => void;
  onError?: (err: unknown) => void;
}): Promise<GhlIntakeResult> {
  const env = readEnv(input.env);
  if (!ghlIntakeEnabled(env)) {
    input.onSkip?.("flag-off");
    return { ok: true, skipped: true, reason: "flag-off" };
  }
  const audience = ghlAudienceForTrigger(input.trigger);
  const url = resolveGhlWebhookUrl(audience, env);
  if (!url) {
    input.onSkip?.("no-webhook-url");
    return { ok: true, skipped: true, reason: "no-webhook-url" };
  }
  const payload = buildGhlSignupPayload(input);
  const body = JSON.stringify(payload);
  const fetchImpl = input.fetchImpl ?? fetch;
  let lastError = "ghl-failed";
  for (let attempt = 1; attempt <= GHL_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
        signal: AbortSignal.timeout(GHL_WEBHOOK_TIMEOUT_MS),
      });
      if (res.ok) return { ok: true, skipped: false, status: res.status };
      lastError = `GHL ${res.status}`;
      if (!retryableStatus(res.status)) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "ghl-failed";
    }
  }
  const error = new Error(lastError);
  input.onError?.(error);
  return { ok: false, error: lastError };
}
