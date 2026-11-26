/**
 * Signed check-in links. Server only. Fail closed when the secret is missing.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type OpenSpotsTokenPayload = {
  daycareId: string;
  exp: number;
};

function hmacSha256(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("base64url");
}

export function openSpotsTokenSecret(env: Record<string, string | undefined> = process.env): string {
  return String(env.BETTER_AUTH_SECRET || "").trim();
}

export function signOpenSpotsToken(payload: OpenSpotsTokenPayload, secret: string): string | null {
  const daycareId = String(payload.daycareId || "").trim();
  if (!secret || !daycareId || !Number.isFinite(payload.exp)) return null;
  const data = Buffer.from(JSON.stringify({ daycareId, exp: payload.exp }), "utf8").toString("base64url");
  return `${data}.${hmacSha256(secret, data)}`;
}

const SHORT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SHORT_SIG_LEN = 16;

function shortSig(secret: string, id: string, exp36: string): string {
  return hmacSha256(secret, `os2|${id}|${exp36}`).slice(0, SHORT_SIG_LEN);
}

/**
 * Short form for text messages: "<daycareId>.<exp seconds, base36>.<16-char HMAC>".
 * Same secret and expiry rules as the long token; keeps the SMS to one segment.
 * Returns null when the id has characters the short form cannot carry.
 */
export function signOpenSpotsShortToken(payload: OpenSpotsTokenPayload, secret: string): string | null {
  const id = String(payload.daycareId || "").trim();
  if (!secret || !SHORT_ID.test(id) || !Number.isFinite(payload.exp)) return null;
  const exp36 = Math.ceil(payload.exp / 1000).toString(36);
  return `${id}.${exp36}.${shortSig(secret, id, exp36)}`;
}

function verifyShort(token: string, secret: string, nowMs: number): OpenSpotsTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, exp36, sig] = parts;
  if (!SHORT_ID.test(id) || !/^[0-9a-z]{1,10}$/.test(exp36) || sig.length !== SHORT_SIG_LEN) return null;
  const expected = shortSig(secret, id, exp36);
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const exp = parseInt(exp36, 36) * 1000;
  if (!Number.isFinite(exp) || exp < nowMs) return null;
  return { daycareId: id, exp };
}

export function verifyOpenSpotsToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): OpenSpotsTokenPayload | null {
  const trimmed = String(token || "").trim();
  if (secret && trimmed.split(".").length === 3) return verifyShort(trimmed, secret, nowMs);
  const dot = trimmed.lastIndexOf(".");
  if (dot < 1 || !secret) return null;
  const data = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  const expected = hmacSha256(secret, data);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as OpenSpotsTokenPayload;
    if (!parsed.daycareId || typeof parsed.daycareId !== "string") return null;
    if (!Number.isFinite(parsed.exp) || parsed.exp < nowMs) return null;
    return { daycareId: parsed.daycareId, exp: parsed.exp };
  } catch {
    return null;
  }
}
