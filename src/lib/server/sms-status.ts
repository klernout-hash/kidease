/**
 * Twilio delivery-status webhook helpers.
 *
 * Signature check matches twilio.validateRequest (HMAC-SHA1 of the public
 * URL + sorted POST params, keyed by TWILIO_AUTH_TOKEN — not an API key).
 * See https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * Production: set TWILIO_STATUS_CALLBACK_URL to the exact HTTPS URL Twilio
 * POSTs (https://www.kidease.ca/api/sms/status). Proxies must not change
 * the path or query string. This handler acknowledges only — it does not
 * persist delivery rows yet.
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
