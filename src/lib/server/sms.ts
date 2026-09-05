/**
 * Server-only Twilio SMS send. Import from other server modules (notify,
 * admin-centres, API routes). Do not put this in a `*.server.*` file that
 * the client imports — createServerFn lab status lives in chat-scaffold.ts.
 *
 * Canada transactional channel only (vacancy, claim status, bill reminder).
 * Not marketing. Send only after CASL consent. Honour STOP (Messaging Service
 * Advanced Opt-Out). Prefer TWILIO_MESSAGING_SERVICE_SID with a Canadian
 * sender. CRTC / Canadian carrier registration is Dashboard ops later.
 *
 * Secrets stay in env. Never log TWILIO_AUTH_TOKEN or API key secret.
 */

import {
  isE164,
  normalizeE164,
  SMS_CREDENTIALS_MESSAGE,
  SMS_SCAFFOLD_MESSAGE,
  smsEnabled,
  smsEnvPresence,
} from "@/lib/sms";

type EnvMap = Record<string, string | undefined>;

export type SendSmsInput = {
  to: string;
  body: string;
};

export type SendSmsResult =
  | { ok: true; sid: string; status: string }
  | { ok: false; skipped: true; error: string }
  | { ok: false; skipped: false; error: string };

export type SendSmsOptions = {
  env?: EnvMap;
  fetchImpl?: typeof fetch;
};

const TWILIO_MESSAGES = (accountSid: string) =>
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

function envStr(env: EnvMap, key: string) {
  return env[key]?.trim() || "";
}

export function claimStatusSmsBody(centreName: string, status: string): string {
  const name = centreName.replace(/\s+/g, " ").trim().slice(0, 80) || "your listing";
  const label =
    status === "approved" ? "approved and live" : status === "declined" ? "not approved" : "in review";
  // CASL: transactional notice to a claimant. Include STOP. Do not market.
  return `KidEase: ${name} is ${label}. https://kidease.ca/provider Reply STOP to opt out.`;
}

export function vacancySmsBody(centreName: string, spotsLabel: string): string {
  const name = centreName.replace(/\s+/g, " ").trim().slice(0, 80) || "a centre";
  const spots = spotsLabel.replace(/\s+/g, " ").trim().slice(0, 40) || "open spots";
  return `KidEase: ${name} posted ${spots}. https://kidease.ca/search Reply STOP to opt out.`;
}

/** Helper only — billing.ts / Stripe paths must not import this module yet. */
export function billReminderSmsBody(amountLabel: string, payUrl: string): string {
  const amount = amountLabel.replace(/\s+/g, " ").trim().slice(0, 32) || "a bill";
  const url = payUrl.trim().slice(0, 120);
  return `KidEase: reminder for ${amount}. ${url} Reply STOP to opt out.`;
}

function resolveAuth(env: EnvMap): { username: string; password: string } | { error: string } {
  const accountSid = envStr(env, "TWILIO_ACCOUNT_SID");
  const apiKeySid = envStr(env, "TWILIO_API_KEY_SID");
  const apiKeySecret = envStr(env, "TWILIO_API_KEY_SECRET");
  const authToken = envStr(env, "TWILIO_AUTH_TOKEN");
  if (apiKeySid && apiKeySecret) {
    return { username: apiKeySid, password: apiKeySecret };
  }
  if (accountSid && authToken) {
    return { username: accountSid, password: authToken };
  }
  return { error: SMS_CREDENTIALS_MESSAGE };
}

function resolveSender(env: EnvMap): { messagingServiceSid?: string; from?: string } | { error: string } {
  const messagingServiceSid = envStr(env, "TWILIO_MESSAGING_SERVICE_SID");
  if (messagingServiceSid) return { messagingServiceSid };
  const from = envStr(env, "TWILIO_FROM_NUMBER");
  if (from && isE164(normalizeE164(from) || from)) return { from: normalizeE164(from) || from };
  if (from) return { error: "TWILIO_FROM_NUMBER must be E.164 (e.g. +1…). Prefer a Canadian sender." };
  return { error: SMS_CREDENTIALS_MESSAGE };
}

/**
 * Send one transactional SMS. No-ops with an honest error when FEATURE_SMS
 * is off or credentials are missing. Never throws on skip.
 */
export async function sendSms(input: SendSmsInput, options: SendSmsOptions = {}): Promise<SendSmsResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const to = normalizeE164(input.to);
  if (!isE164(to)) {
    return { ok: false, skipped: false, error: "Recipient must be an E.164 number (e.g. +12045550100)." };
  }
  if (!smsEnabled(env)) {
    return { ok: false, skipped: true, error: SMS_SCAFFOLD_MESSAGE };
  }
  const presence = smsEnvPresence(env);
  if (!presence.credentialsPresent) {
    return { ok: false, skipped: true, error: SMS_CREDENTIALS_MESSAGE };
  }
  const accountSid = envStr(env, "TWILIO_ACCOUNT_SID");
  const auth = resolveAuth(env);
  if ("error" in auth) return { ok: false, skipped: true, error: auth.error };
  const sender = resolveSender(env);
  if ("error" in sender) return { ok: false, skipped: true, error: sender.error };

  const body = String(input.body || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1600);
  if (!body) return { ok: false, skipped: false, error: "SMS body is empty." };

  const params = new URLSearchParams({ To: to, Body: body });
  if (sender.messagingServiceSid) params.set("MessagingServiceSid", sender.messagingServiceSid);
  if (sender.from) params.set("From", sender.from);
  const statusCallback = envStr(env, "TWILIO_STATUS_CALLBACK_URL");
  if (statusCallback) params.set("StatusCallback", statusCallback);

  const credentials = `${auth.username}:${auth.password}`;
  let encoded: string;
  try {
    encoded = btoa(credentials);
  } catch {
    return { ok: false, skipped: false, error: "Twilio auth could not be encoded." };
  }

  let res: Response;
  try {
    res = await fetchImpl(TWILIO_MESSAGES(accountSid), {
      method: "POST",
      headers: {
        Authorization: `Basic ${encoded}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
  } catch {
    return { ok: false, skipped: false, error: "Twilio request failed." };
  }

  let payload: { sid?: string; status?: string; code?: number; message?: string } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    payload = {};
  }

  if (!res.ok) {
    const code = typeof payload.code === "number" ? payload.code : res.status;
    return { ok: false, skipped: false, error: `Twilio send failed (${code}).` };
  }

  const sid = typeof payload.sid === "string" ? payload.sid : "";
  const status = typeof payload.status === "string" ? payload.status : "queued";
  console.info("[kidease-sms]", { ok: true, sid: sid ? `${sid.slice(0, 2)}…` : "SM…", status });
  return { ok: true, sid, status };
}

/** Claim-status parallel to email. Skip when no mobile. Never throws. */
export async function notifyClaimStatusSms(input: {
  to?: string | null;
  centreName: string;
  status: string;
  env?: EnvMap;
  fetchImpl?: typeof fetch;
}): Promise<SendSmsResult> {
  const to = normalizeE164(input.to);
  if (!to) {
    return { ok: false, skipped: true, error: "No E.164 mobile on the provider profile." };
  }
  try {
    return await sendSms(
      { to, body: claimStatusSmsBody(input.centreName, input.status) },
      { env: input.env, fetchImpl: input.fetchImpl },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "SMS send failed";
    console.error("[kidease-sms]", message);
    return { ok: false, skipped: false, error: "SMS send failed." };
  }
}
