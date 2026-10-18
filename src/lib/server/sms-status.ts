/**
 * Twilio delivery-status webhook helpers.
 *
 * Signature check matches twilio.validateRequest (HMAC-SHA1 of the public
 * URL + sorted POST params, keyed by TWILIO_AUTH_TOKEN — not an API key).
 * See https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * Production: set TWILIO_STATUS_CALLBACK_URL to the exact HTTPS URL Twilio
 * POSTs (https://www.kidease.ca/api/sms/status). Proxies must not change
 * the path or query string. The status route stores one row per MessageSid.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export class TwilioSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwilioSignatureError";
  }
}

export function parseTwilioForm(raw: string): Record<string, string> {
  const params = new URLSearchParams(raw);
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

/** Rebuild the public URL Twilio signed (HTTPS + forwarded host). */
export function publicRequestUrl(request: Request, configured?: string): string {
  const pinned = (configured || "").trim();
  if (pinned) return pinned.replace(/\/$/, "");
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || url.host;
  return `${proto}://${host}${url.pathname}${url.search}`;
}

/**
 * Primary auth token, then an optional TWILIO_AUTH_TOKEN_NEXT during a
 * rotation. Production inbound already validates with TWILIO_AUTH_TOKEN.
 * Neither value is logged.
 */
export function twilioAuthTokenCandidates(env: Record<string, string | undefined> = process.env): string[] {
  const primary = (env.TWILIO_AUTH_TOKEN || "").trim();
  const next = (env.TWILIO_AUTH_TOKEN_NEXT || "").trim();
  const tokens: string[] = [];
  if (primary) tokens.push(primary);
  if (next && next !== primary) tokens.push(next);
  return tokens;
}

/** True when any configured auth token matches. Missing token or header throws. */
export function twilioSignatureMatches(
  signatureHeader: string,
  url: string,
  params: Record<string, string>,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const tokens = twilioAuthTokenCandidates(env);
  if (!tokens.length) throw new TwilioSignatureError("TWILIO_AUTH_TOKEN missing");
  if (!signatureHeader.trim()) throw new TwilioSignatureError("X-Twilio-Signature missing");
  return tokens.some((token) => validateTwilioSignature(token, signatureHeader, url, params));
}

/** Fail closed. Missing token or a bad X-Twilio-Signature is 401. */
export async function authorizeTwilioPost(
  request: Request,
  configuredUrl?: string,
): Promise<{ ok: true; params: Record<string, string> } | { ok: false; response: Response }> {
  const raw = await request.text();
  const params = parseTwilioForm(raw);
  const url = publicRequestUrl(request, configuredUrl);
  const sig = request.headers.get("x-twilio-signature") || "";
  try {
    if (!twilioSignatureMatches(sig, url, params)) {
      return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
    }
  } catch {
    return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
  }
  return { ok: true, params };
}

export function validateTwilioSignature(
  authToken: string,
  signatureHeader: string,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!authToken.trim()) throw new TwilioSignatureError("TWILIO_AUTH_TOKEN missing");
  if (!signatureHeader.trim()) throw new TwilioSignatureError("X-Twilio-Signature missing");
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
  const got = Buffer.from(signatureHeader, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

export type SmsStatusAck = {
  ok: true;
  messageSid: string | null;
  messageStatus: string | null;
};

export function summarizeSmsStatus(params: Record<string, string>): SmsStatusAck {
  return {
    ok: true,
    messageSid: (params.MessageSid || params.SmsSid || "").trim() || null,
    messageStatus: (params.MessageStatus || params.SmsStatus || "").trim() || null,
  };
}

export type SmsDeliveryRecord = {
  messageSid: string | null;
  messageStatus: string;
  toE164: string | null;
  fromE164: string | null;
  errorCode: string | null;
  keyword: string | null;
};

/** Fields safe to store. Does not keep the message body. */
export function smsDeliveryRecord(params: Record<string, string>, keyword?: string | null): SmsDeliveryRecord {
  const summary = summarizeSmsStatus(params);
  const to = (params.To || params.to || "").trim();
  const from = (params.From || params.from || "").trim();
  const errorCode = (params.ErrorCode || params.errorCode || "").trim();
  return {
    messageSid: summary.messageSid,
    messageStatus: (summary.messageStatus || (keyword ? "received" : "unknown")).slice(0, 32),
    toE164: to ? to.slice(0, 20) : null,
    fromE164: from ? from.slice(0, 20) : null,
    errorCode: errorCode ? errorCode.slice(0, 16) : null,
    keyword: keyword ? keyword.slice(0, 16) : null,
  };
}
