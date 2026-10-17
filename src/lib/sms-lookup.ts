/**
 * Twilio Lookup v2 line type. Landlines and non-fixed VoIP cannot get texts.
 * A Lookup error, missing token, or unknown type fails open so a real mobile
 * is not blocked when Twilio is down. Never log the auth token.
 *
 * scripts/sms-lookup.test.mjs loads this file in Node.
 */

import { isE164, normalizeE164 } from "./sms.ts";

export const SMS_BLOCKED_LINE_TYPES = ["landline", "nonFixedVoip"] as const;

export type SmsBlockedLineType = (typeof SMS_BLOCKED_LINE_TYPES)[number];

export type SmsLookupDecision = {
  phone: string;
  block: boolean;
  lineType: string | null;
  failOpen: boolean;
};

type EnvMap = Record<string, string | undefined>;

export function lineTypeBlocksSms(type: string | null | undefined): type is SmsBlockedLineType {
  return type === "landline" || type === "nonFixedVoip";
}

/** Pull the line type. A missing package or error_code means Lookup did not answer. */
export function lineTypeFromLookupBody(body: unknown): { type: string | null; failed: boolean } {
  if (!body || typeof body !== "object") return { type: null, failed: true };
  const intel = (body as { line_type_intelligence?: unknown }).line_type_intelligence;
  if (!intel || typeof intel !== "object") return { type: null, failed: true };
  const row = intel as { type?: unknown; error_code?: unknown };
  if (row.error_code != null && row.error_code !== "") return { type: null, failed: true };
  const type = typeof row.type === "string" ? row.type.trim() : "";
  if (!type) return { type: null, failed: true };
  return { type, failed: false };
}

function allow(phone: string, extra: Partial<SmsLookupDecision> = {}): SmsLookupDecision {
  return { phone, block: false, lineType: null, failOpen: true, ...extra };
}

/**
 * Normalize to E.164, then ask Lookup v2 for line_type_intelligence.
 * Blocks only landline and nonFixedVoip. Anything else, including errors, allows SMS.
 */
export async function decideSmsLookup(
  raw: string,
  options: { env?: EnvMap; fetchImpl?: typeof fetch } = {},
): Promise<SmsLookupDecision> {
  const env = options.env ?? process.env;
  const phone = normalizeE164(raw);
  if (!isE164(phone)) return allow(phone);
  const sid = env.TWILIO_ACCOUNT_SID?.trim() || "";
  const token = env.TWILIO_AUTH_TOKEN?.trim() || "";
  if (!sid || !token) return allow(phone);
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phone)}?Fields=line_type_intelligence`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}` },
    });
  } catch {
    return allow(phone);
  }
  if (!res.ok) return allow(phone);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return allow(phone);
  }
  const parsed = lineTypeFromLookupBody(body);
  if (parsed.failed || !parsed.type) return allow(phone);
  if (lineTypeBlocksSms(parsed.type)) {
    return { phone, block: true, lineType: parsed.type, failOpen: false };
  }
  return { phone, block: false, lineType: parsed.type, failOpen: false };
}
