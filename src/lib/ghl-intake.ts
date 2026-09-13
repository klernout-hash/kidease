/**
 * Site → GoHighLevel CRM intake (Path B).
 * Env-gated: unset URLs no-op. Never throws. Independent of Resend / SMS.
 *
 * GHL_WEBHOOK_DAYCARE_SIGNUP_URL — provider signup + claim verify
 * GHL_WEBHOOK_PARENT_ONBOARD_URL — parent signup
 * If only one URL is set, every intake event POSTs to that router URL.
 * FEATURE_GHL_INTAKE=0 disables POSTs without removing URLs.
 */

export const GHL_DAYCARE_SIGNUP_URL_ENV = "GHL_WEBHOOK_DAYCARE_SIGNUP_URL";
export const GHL_PARENT_ONBOARD_URL_ENV = "GHL_WEBHOOK_PARENT_ONBOARD_URL";
export const GHL_INTAKE_FLAG_ENV = "FEATURE_GHL_INTAKE";

export type GhlIntakeAudience = "daycare" | "parent";
export type GhlIntakeTrigger = "parent_signup" | "provider_signup" | "claim_verify";

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

export function ghlIntakeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = (env[GHL_INTAKE_FLAG_ENV] || "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}

export function ghlAudienceForTrigger(trigger: GhlIntakeTrigger): GhlIntakeAudience {
  return trigger === "parent_signup" ? "parent" : "daycare";
}

export function ghlIntakeTags(audience: GhlIntakeAudience): string[] {
  return ["source:website", `type:${audience}`, "form:signup"];
}

function trimUrl(raw?: string | null): string {
  return (raw || "").trim();
}

/** Prefer the audience URL; fall back to the other so one pasted router URL still works. */
export function resolveGhlWebhookUrl(
  audience: GhlIntakeAudience,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const daycare = trimUrl(env[GHL_DAYCARE_SIGNUP_URL_ENV]);
  const parent = trimUrl(env[GHL_PARENT_ONBOARD_URL_ENV]);
  const picked = audience === "parent" ? parent || daycare : daycare || parent;
  return picked || null;
}

export function shouldPostGhlIntake(
  audience: GhlIntakeAudience,
  env: Record<string, string | undefined> = process.env,
): boolean {
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
    tags: ghlIntakeTags(ghlAudienceForTrigger(input.trigger)),
    kidease_event_id: (input.eventId || "").trim(),
  };
}

/**
 * Best-effort POST. Missing env / flag-off / network errors never throw.
 * Callers must not gate signup, claim verify, or Admin notify on this result.
 */
export async function postGhlSignupIntake(input: {
  trigger: GhlIntakeTrigger;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  eventId?: string | null;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  onSkip?: (reason: "flag-off" | "no-webhook-url") => void;
  onError?: (err: unknown) => void;
}): Promise<GhlIntakeResult> {
  const env = input.env ?? process.env;
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
  try {
    const fetchImpl = input.fetchImpl ?? fetch;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const error = `GHL ${res.status}`;
      input.onError?.(new Error(error));
      return { ok: false, error };
    }
    return { ok: true, skipped: false, status: res.status };
  } catch (err) {
    input.onError?.(err);
    return { ok: false, error: err instanceof Error ? err.message : "ghl-failed" };
  }
}
