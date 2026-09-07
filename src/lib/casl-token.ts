/**
 * CASL unsubscribe tokens. Server / Node tests only — uses node:crypto.
 * Do not import this from client components.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  isCaslChannel,
  isCaslPurpose,
  type CaslUnsubPayload,
} from "./casl.ts";

function hmacSha256(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("base64url");
}

export function signCaslUnsubToken(payload: CaslUnsubPayload, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${data}.${hmacSha256(secret, data)}`;
}

export function verifyCaslUnsubToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): CaslUnsubPayload | null {
  const trimmed = String(token || "").trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 1 || !secret) return null;
  const data = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  const expected = hmacSha256(secret, data);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as CaslUnsubPayload;
    if (!isCaslChannel(parsed.channel)) return null;
    if (parsed.purpose !== "all" && !isCaslPurpose(parsed.purpose)) return null;
    if (!Number.isFinite(parsed.exp) || parsed.exp < nowMs) return null;
    return parsed;
  } catch {
    return null;
  }
}
