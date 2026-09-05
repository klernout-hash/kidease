/**
 * Twilio SMS env names and client/server stubs.
 * Real Account SID / tokens come later — do not invent credentials.
 *
 * Canada: transactional vacancy, claim-status, and bill reminders only.
 * Not marketing blasts. CASL consent + STOP before FEATURE_SMS=1.
 * Prefer a Canadian sender or Messaging Service. Full CRTC / carrier
 * registration is Console / Dashboard ops later.
 *
 * No relative imports — scripts/sms.test.mjs loads this file in Node.
 */

type EnvMap = Record<string, string | undefined>;

export const SMS_ENV_NAMES = [
  "FEATURE_SMS",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_FROM_NUMBER",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_STATUS_CALLBACK_URL",
] as const;

export const SMS_SCAFFOLD_MESSAGE =
  "SMS is scaffolded only. FEATURE_SMS is off until Kyle adds Twilio credentials and a Canadian sender.";

export const SMS_CREDENTIALS_MESSAGE =
  "Twilio credentials are not configured. Set TWILIO_ACCOUNT_SID plus TWILIO_AUTH_TOKEN or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET, and TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.";

export type SmsAuthMode = "none" | "auth_token" | "api_key";

export type SmsEnvPresence = {
  accountSid: boolean;
  authToken: boolean;
  apiKey: boolean;
  fromNumber: boolean;
  messagingService: boolean;
  statusCallback: boolean;
  credentialsPresent: boolean;
  authMode: SmsAuthMode;
};

function envStr(env: EnvMap, key: string) {
  return env[key]?.trim() || "";
}

function flagOn(raw: string | undefined | null): boolean {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function smsEnabled(env: EnvMap = process.env): boolean {
  return flagOn(env.FEATURE_SMS);
}

/** ITU-T E.164: + then 8–15 digits, first digit 1–9. */
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/**
 * Normalize a typed phone toward E.164. Bare 10-digit NANP becomes +1
 * (Canada / US). Returns "" when nothing usable is left.
 */
export function normalizeE164(raw: string | null | undefined): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const kept = trimmed.replace(/[^\d+]/g, "");
  if (kept.startsWith("+")) {
    const rest = kept.slice(1).replace(/\D/g, "");
    return rest ? `+${rest}` : "";
  }
  const digits = kept.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return "";
}

export function smsEnvPresence(env: EnvMap = process.env): SmsEnvPresence {
  const accountSid = Boolean(envStr(env, "TWILIO_ACCOUNT_SID"));
  const authToken = Boolean(envStr(env, "TWILIO_AUTH_TOKEN"));
  const apiKey = Boolean(envStr(env, "TWILIO_API_KEY_SID") && envStr(env, "TWILIO_API_KEY_SECRET"));
  const fromNumber = Boolean(envStr(env, "TWILIO_FROM_NUMBER"));
  const messagingService = Boolean(envStr(env, "TWILIO_MESSAGING_SERVICE_SID"));
  const statusCallback = Boolean(envStr(env, "TWILIO_STATUS_CALLBACK_URL"));
  const authMode: SmsAuthMode = apiKey ? "api_key" : authToken ? "auth_token" : "none";
  return {
    accountSid,
    authToken,
    apiKey,
    fromNumber,
    messagingService,
    statusCallback,
    credentialsPresent: accountSid && (authToken || apiKey) && (fromNumber || messagingService),
    authMode,
  };
}

export function smsCredentialsPresent(env: EnvMap = process.env): boolean {
  return smsEnvPresence(env).credentialsPresent;
}

export function smsLive(env: EnvMap = process.env): boolean {
  return smsEnabled(env) && smsCredentialsPresent(env);
}
