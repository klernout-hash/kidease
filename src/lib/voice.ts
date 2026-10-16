/**
 * Twilio Voice helpers: identities, TwiML, and env names.
 * Calls stay on Twilio clients. Personal numbers are never put in TwiML.
 * Pure: scripts/comms.test.mjs loads this in Node. No secrets in source.
 */

import { xmlEscape } from "./xml.ts";

export const VOICE_ENV_NAMES = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_TWIML_APP_SID",
  "TWILIO_PHONE_NUMBER",
  "TWILIO_VOICE_INCOMING_URL",
  "TWILIO_VOICE_CONNECT_URL",
  "TWILIO_VOICE_RECORDING_URL",
] as const;

export const VOICE_TOKEN_TTL_SECONDS = 900;

export const VOICE_CREDENTIALS_MESSAGE =
  "Calling is not set up. Set TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, and TWILIO_TWIML_APP_SID.";

const GREETING =
  "Hello. You have reached KidEase. Bonjour. Vous avez joint KidEase. If we can reach your daycare in KidEase, we will connect you. Otherwise, leave a message after the tone. We do not share your number.";

const NO_ANSWER = "No one answered. Leave a short message after the tone. Thank you.";

const THANKS = "Thank you. Goodbye.";

const CANNOT_CONNECT = "This KidEase call cannot be connected.";

type EnvMap = Record<string, string | undefined>;

function envStr(env: EnvMap, key: string) {
  return env[key]?.trim() || "";
}

export function voiceEnvPresence(env: EnvMap = process.env) {
  const accountSid = Boolean(envStr(env, "TWILIO_ACCOUNT_SID"));
  const apiKey = Boolean(envStr(env, "TWILIO_API_KEY_SID") && envStr(env, "TWILIO_API_KEY_SECRET"));
  const twimlApp = Boolean(envStr(env, "TWILIO_TWIML_APP_SID"));
  const authToken = Boolean(envStr(env, "TWILIO_AUTH_TOKEN"));
  const phoneNumber = Boolean(envStr(env, "TWILIO_PHONE_NUMBER") || envStr(env, "TWILIO_FROM_NUMBER"));
  return {
    accountSid,
    apiKey,
    twimlApp,
    authToken,
    phoneNumber,
    credentialsPresent: accountSid && apiKey && twimlApp,
  };
}

export function voiceCredentialsPresent(env: EnvMap = process.env): boolean {
  return voiceEnvPresence(env).credentialsPresent;
}

function utf8ToHex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

function hexToUtf8(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/** Twilio client identity. Alphanumeric and underscore only. Not a phone number. */
export function voiceIdentityForUser(userId: string, kind: "user" | "admin" = "user"): string {
  const id = String(userId || "").trim();
  if (!id) return "";
  const prefix = kind === "admin" ? "kea_" : "keu_";
  return `${prefix}${utf8ToHex(id)}`.slice(0, 121);
}

export function userIdFromVoiceIdentity(identity: string): { userId: string; kind: "user" | "admin" } | null {
  const raw = String(identity || "")
    .trim()
    .replace(/^client:/i, "");
  const kind = raw.startsWith("kea_") ? "admin" : raw.startsWith("keu_") ? "user" : null;
  if (!kind) return null;
  const hex = raw.slice(4);
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 2 || hex.length % 2 !== 0) return null;
  const userId = hexToUtf8(hex);
  if (!userId || userId.includes("\u0000")) return null;
  return { userId, kind };
}

function say(text: string): string {
  return `<Say language="en-CA">${xmlEscape(text)}</Say>`;
}

function clientNouns(identities: string[]): string {
  const safe = identities
    .map((id) => String(id || "").trim())
    .filter((id) => /^ke[ua]_[0-9a-f]+$/i.test(id))
    .slice(0, 10);
  return safe.map((id) => `<Client>${xmlEscape(id)}</Client>`).join("");
}

/** In-app call. Dials Twilio clients only. Never a <Number>. */
export function clientDialTwiml(identities: string[]): string {
  const clients = clientNouns(identities);
  if (!clients) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${say(CANNOT_CONNECT)}<Hangup/></Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="25" answerOnBridge="true">${clients}</Dial>${say("No one answered this KidEase call.")}</Response>`;
}

/** Toll-free inbound. Greeting names KidEase, then a client dial or voicemail. */
export function incomingVoiceTwiml(input: { identities: string[]; recordingCallback: string }): string {
  const clients = clientNouns(input.identities);
  const callback = xmlEscape(input.recordingCallback);
  const record = `<Record maxLength="90" playBeep="true" trim="trim-silence" recordingStatusCallback="${callback}" recordingStatusCallbackMethod="POST"/>`;
  const dial = clients ? `<Dial timeout="20" answerOnBridge="true">${clients}</Dial>${say(NO_ANSWER)}` : say(NO_ANSWER);
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${say(GREETING)}${dial}${record}${say(THANKS)}</Response>`;
}

export function voiceRecordingCallbackUrl(env: EnvMap = process.env, origin = "https://www.kidease.ca"): string {
  const pinned = envStr(env, "TWILIO_VOICE_RECORDING_URL");
  if (pinned) return pinned;
  return `${origin.replace(/\/$/, "")}/api/voice/recording`;
}
