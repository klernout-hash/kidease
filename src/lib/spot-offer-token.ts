/**
 * Signed spot-offer links. Server and Node tests only.
 * Uses BETTER_AUTH_SECRET. If that secret is missing, minting fails closed.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type SpotOfferTokenPayload = {
  offerId: string;
  userId: string;
  exp: number;
};

function hmac(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("base64url");
}

export function signSpotOfferToken(payload: SpotOfferTokenPayload, secret: string): string | null {
  if (!secret || !payload.offerId || !payload.userId || !Number.isFinite(payload.exp)) return null;
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${data}.${hmac(secret, data)}`;
}

export function verifySpotOfferToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): SpotOfferTokenPayload | null {
  const trimmed = String(token || "").trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 1 || !secret) return null;
  const data = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  const expected = hmac(secret, data);
  if (sig.length !== expected.length) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SpotOfferTokenPayload;
    if (!parsed.offerId || !parsed.userId) return null;
    if (!Number.isFinite(parsed.exp) || parsed.exp < nowMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function spotOfferTokenSecret(env: Record<string, string | undefined> = process.env): string {
  return String(env.BETTER_AUTH_SECRET || "").trim();
}
