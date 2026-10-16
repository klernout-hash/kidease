/**
 * Transactional SMS copy and the consent gate for parent ↔ daycare texts.
 * Pure: no database. scripts/comms.test.mjs loads this in Node.
 */

import { CASL_ADDRESS_BLOCKED_MESSAGE, CASL_NO_CONSENT_MESSAGE, type InboundOpt } from "./casl.ts";
import { xmlEscape } from "./xml.ts";

export const SMS_HELP_REPLY =
  "KidEase: texts about daycare requests and your account. Reply STOP to opt out. Help: support@kidease.ca";

export const SMS_STOP_REPLY =
  "KidEase: you are opted out. We will not text this number. Reply START to opt back in.";

export const SMS_START_REPLY =
  "KidEase: you are opted in again for daycare request texts. Reply STOP to opt out.";

function clipName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 80) || "your daycare";
}

/** Every parent-request text names KidEase and offers STOP. */
export function parentRequestSms(centreName: string): string {
  return `KidEase: New parent request for ${clipName(centreName)}. Open messages at https://www.kidease.ca/inbox Reply STOP to opt out.`;
}

export function parentMessageSms(centreName: string): string {
  return `KidEase: New parent message about ${clipName(centreName)}. https://www.kidease.ca/inbox Reply STOP to opt out.`;
}

export function daycareReplySms(centreName: string): string {
  return `KidEase: ${clipName(centreName)} replied. Read it at https://www.kidease.ca/inbox Reply STOP to opt out.`;
}

/**
 * Fail closed. A profile checkbox or a stored CASL grant is consent.
 * An address block (STOP) always wins.
 */
export function smsConsentAllows(input: {
  smsConsent: boolean;
  caslGranted: boolean;
  addressBlocked: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (input.addressBlocked) return { ok: false, reason: CASL_ADDRESS_BLOCKED_MESSAGE };
  if (!input.smsConsent && !input.caslGranted) return { ok: false, reason: CASL_NO_CONSENT_MESSAGE };
  return { ok: true };
}

/** Prefix KidEase when a caller forgot. Existing branded bodies stay as written. */
export function brandKidEaseSms(body: string): string {
  const trimmed = String(body || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) return "";
  if (/^kidease\b/i.test(trimmed)) return trimmed.slice(0, 1600);
  return `KidEase: ${trimmed}`.slice(0, 1600);
}

export function twimlEmpty(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}

export function twimlMessage(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(body)}</Message></Response>`;
}

/**
 * Reply in TwiML only when Twilio did not already set OptOutType.
 * Advanced Opt-Out sends its own STOP / START / HELP text. A second Message would double-send.
 */
export function inboundKeywordTwiml(params: Record<string, string>, opt: InboundOpt): string {
  const typed = String(params.OptOutType || params.optOutType || "").trim();
  if (!opt || typed) return twimlEmpty();
  if (opt === "help") return twimlMessage(SMS_HELP_REPLY);
  if (opt === "stop") return twimlMessage(SMS_STOP_REPLY);
  if (opt === "start") return twimlMessage(SMS_START_REPLY);
  return twimlEmpty();
}
