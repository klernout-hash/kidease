/**
 * Transactional SMS copy and the consent gate for parent ↔ daycare texts.
 * Pure: no database. scripts/comms.test.mjs loads this in Node.
 */

import { CASL_ADDRESS_BLOCKED_MESSAGE, CASL_NO_CONSENT_MESSAGE, type InboundOpt } from "./casl.ts";
import { xmlEscape } from "./xml.ts";

/**
 * Paste these into Twilio Console → Messaging → Services → KidEase SMS →
 * Opt-out management, after Enable advanced opt-out. One message each.
 * Stay under 160 characters so the reply is a single text.
 * Toll-free numbers may still show the carrier STOP / START line. HELP uses ours.
 */
export const SMS_HELP_REPLY =
  "KidEase: texts about daycare requests and your account. Reply STOP to opt out. Email support@kidease.ca or call 1-877-502-7728.";

export const SMS_STOP_REPLY =
  "KidEase: you are opted out. We will not text this number. Reply START to opt back in. Help: support@kidease.ca";

export const SMS_START_REPLY =
  "KidEase: you are opted in again for daycare request texts. Reply STOP to opt out. Help: support@kidease.ca";

export const SMS_HELP_REPLY_FR =
  "KidEase : textos sur vos demandes de garderie. Répondez STOP pour arrêter. Aide : support@kidease.ca ou 1-877-502-7728.";

export const SMS_STOP_REPLY_FR =
  "KidEase : vous êtes désabonné. Plus de textos à ce numéro. Répondez START pour revenir. Aide : support@kidease.ca";

export const SMS_START_REPLY_FR =
  "KidEase : vous recevez de nouveau les textos KidEase. Répondez STOP pour arrêter. Aide : support@kidease.ca";

const SMS_OPT_OUT_FOOTERS = [
  "Reply STOP to opt out.",
  "Reply STOP to opt out",
  "Répondez STOP pour arrêter.",
  "Répondez STOP pour arrêter",
  "Répondez STOP pour vous désabonner.",
];

/**
 * Inbound SMS never becomes an in-app message. The body is not stored.
 * Keyword replies are Twilio Advanced Opt-Out (or one TwiML message), not chat.
 */
export function inboundSmsChatDecision(_body: string): {
  insertIntoThread: boolean;
  persistBody: boolean;
} {
  return { insertIntoThread: false, persistBody: false };
}

/** Drop an SMS opt-out footer if it was ever copied into a chat box. */
export function chatBodyWithoutSmsFooter(body: string): string {
  let text = String(body || "")
    .replace(/\s+/g, " ")
    .trim();
  let trimmed = true;
  while (trimmed && text) {
    trimmed = false;
    for (const footer of SMS_OPT_OUT_FOOTERS) {
      if (text.toLowerCase().endsWith(footer.toLowerCase())) {
        text = text.slice(0, text.length - footer.length).trim();
        trimmed = true;
      }
    }
  }
  return text;
}

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
function frenchKeywordBody(params: Record<string, string>): boolean {
  const body = String(params.Body || params.body || "")
    .trim()
    .toLowerCase();
  return body === "arret" || body === "arrêt" || body === "aide";
}

export function inboundKeywordTwiml(params: Record<string, string>, opt: InboundOpt): string {
  const typed = String(params.OptOutType || params.optOutType || "").trim();
  if (!opt || typed) return twimlEmpty();
  const fr = frenchKeywordBody(params);
  if (opt === "help") return twimlMessage(fr ? SMS_HELP_REPLY_FR : SMS_HELP_REPLY);
  if (opt === "stop") return twimlMessage(fr ? SMS_STOP_REPLY_FR : SMS_STOP_REPLY);
  if (opt === "start") return twimlMessage(SMS_START_REPLY);
  return twimlEmpty();
}
