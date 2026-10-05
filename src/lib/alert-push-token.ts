/**
 * Signed unsubscribe tokens for one alert category.
 * Server / Node tests only. Do not import this from client components.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { isAlertCategory, type AlertCategory } from "./alert-push.ts";

export const ALERT_UNSUB_PREFIX = "ka.";
export const ALERT_UNSUB_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type AlertUnsubPayload = {
  userId: string;
  category: AlertCategory | "all";
  exp: number;
};

function hmacSha256(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("base64url");
}

export function signAlertUnsubToken(payload: AlertUnsubPayload, secret: string): string | null {
  if (!secret || !payload.userId) return null;
  if (payload.category !== "all" && !isAlertCategory(payload.category)) return null;
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${ALERT_UNSUB_PREFIX}${data}.${hmacSha256(secret, data)}`;
}

export function verifyAlertUnsubToken(token: string, secret: string, nowMs = Date.now()): AlertUnsubPayload | null {
  const trimmed = String(token || "").trim();
  if (!trimmed.startsWith(ALERT_UNSUB_PREFIX) || !secret) return null;
  const body = trimmed.slice(ALERT_UNSUB_PREFIX.length);
  const dot = body.lastIndexOf(".");
  if (dot < 1) return null;
  const data = body.slice(0, dot);
  const sig = body.slice(dot + 1);
  const expected = hmacSha256(secret, data);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as AlertUnsubPayload;
    if (!parsed.userId || typeof parsed.userId !== "string") return null;
    if (parsed.category !== "all" && !isAlertCategory(parsed.category)) return null;
    if (!Number.isFinite(parsed.exp) || parsed.exp < nowMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isAlertUnsubToken(token: string | null | undefined): boolean {
  return String(token || "").trim().startsWith(ALERT_UNSUB_PREFIX);
}
