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

export function verifyOpenSpotsToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): OpenSpotsTokenPayload | null {
  const trimmed = String(token || "").trim();
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
