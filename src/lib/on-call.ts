/**
 * On-call webhook for a failed health check.
 * FEATURE_ONCALL_HOOK defaults off. Distinct from error-tracking alerts.
 * The payload has no database URL and no secrets.
 */

export const ONCALL_FLAG = "FEATURE_ONCALL_HOOK";
export const ONCALL_URL_ENV = "ONCALL_WEBHOOK_URL";

export type OnCallEnv = Record<string, string | undefined>;

function flagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function onCallEnabled(env?: OnCallEnv): boolean {
  const bag = env ?? (typeof process !== "undefined" ? process.env : {});
  return flagOn(bag[ONCALL_FLAG]);
}

export function onCallWebhook(env: OnCallEnv = {}): string | null {
  if (!onCallEnabled(env)) return null;
  const raw = String(env[ONCALL_URL_ENV] || "").trim();
  if (!raw.startsWith("https://")) return null;
  return raw;
}

export function onCallPayload(input: { ok: boolean; checkedAt: string }): { text: string } | null {
  if (input.ok) return null;
  return { text: `KidEase health is not ok at ${input.checkedAt}` };
}

export async function maybeNotifyOnCall(
  env: OnCallEnv,
  health: { ok: boolean; checkedAt: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: boolean; reason: string }> {
  const url = onCallWebhook(env);
  const payload = onCallPayload(health);
  if (!url || !payload) return { sent: false, reason: url ? "healthy" : "off" };
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { sent: response.ok, reason: response.ok ? "sent" : "webhook_error" };
}
