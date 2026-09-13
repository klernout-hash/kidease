import { createHmac, timingSafeEqual } from "node:crypto";

/** Recent step-up window after OTP or password confirm. */
export const REAUTH_WINDOW_MS = 10 * 60 * 1000;
export const ADMIN_IDLE_TTL_MS = 30 * 60 * 1000;

export const REAUTH_REQUIRED_MESSAGE = "Confirm it's you to continue.";
export const REAUTH_COOKIE = "__Host-kidease.reauth";
export const SHARED_REAUTH_COOKIE = "__Secure-kidease.reauth";
export const ADMIN_IDLE_COOKIE = "__Host-kidease.admin.seen";
export const SHARED_ADMIN_IDLE_COOKIE = "__Secure-kidease.admin.seen";

export function isReauthRequiredMessage(message?: string | null): boolean {
  const raw = String(message || "").trim();
  return raw === REAUTH_REQUIRED_MESSAGE || raw.toLowerCase().includes("confirm it's you");
}

export function signReauthCookie(userId: string, exp: number, secret: string): string {
  const body = `${userId}.${exp}`;
  const sig = createHmac("sha256", secret).update(`reauth:${body}`).digest("hex");
  return `${body}.${sig}`;
}

export function parseReauthCookie(
  raw: string | null | undefined,
  secret: string,
): { userId: string; exp: number } | null {
  if (!raw || !secret) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = createHmac("sha256", secret).update(`reauth:${userId}.${exp}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { userId, exp };
}

export function isRecentReauth(
  userId: string,
  raw: string | null | undefined,
  secret: string,
): boolean {
  const parsed = parseReauthCookie(raw, secret);
  return Boolean(parsed && parsed.userId === userId && parsed.exp > Date.now());
}

export function reauthRemainingMs(raw: string | null | undefined, secret: string, nowMs = Date.now()): number {
  const parsed = parseReauthCookie(raw, secret);
  if (!parsed) return 0;
  return Math.max(0, parsed.exp - nowMs);
}
