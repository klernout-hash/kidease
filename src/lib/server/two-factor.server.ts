/**
 * Cookie + staff 2FA reads. `.server` so `@tanstack/react-start/server` never
 * enters the client graph. `/verify-2fa` and TwoFactorGate import
 * `two-factor.ts` (createServerFn RPC only) — that file must not import
 * getCookie / setCookie / getRequest.
 */
import { createHmac } from "node:crypto";
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import {
  isKideasePublicHost,
  KIDEASE_COOKIE_DOMAIN,
  SHARED_TWO_FACTOR_COOKIE,
  TWO_FACTOR_COOKIE,
} from "@/lib/auth/cookies";
import { isTwoFactorVerified } from "@/lib/two-factor-cookie";

function secret() {
  return (process.env.BETTER_AUTH_SECRET || process.env.ADMIN_EMAIL || "kidease-preview").trim();
}

function twoFactorCookieRaw(): string | null {
  return getCookie(TWO_FACTOR_COOKIE) ?? getCookie(SHARED_TWO_FACTOR_COOKIE) ?? null;
}

export function isCurrentUserTwoFactorVerified(userId: string): boolean {
  return isTwoFactorVerified(userId, twoFactorCookieRaw(), secret());
}

/** Fail closed: missing/invalid cookie or a thrown status check blocks staff. */
export function assertTwoFactorVerified(userId: string) {
  try {
    if (!isCurrentUserTwoFactorVerified(userId)) {
      throw new Error("Two-factor verification required");
    }
  } catch (err) {
    if (err instanceof Error && err.message === "Two-factor verification required") throw err;
    throw new Error("Two-factor verification required");
  }
}

export function writeTwoFactorDeviceCookie(userId: string, ttlMs: number) {
  const exp = Date.now() + ttlMs;
  const body = `${userId}.${exp}`;
  const sig = createHmac("sha256", secret()).update(body).digest("hex");
  const value = `${body}.${sig}`;
  const expires = new Date(exp);
  setCookie(TWO_FACTOR_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires,
  });
  const host = getRequest()?.headers.get("x-forwarded-host") || getRequest()?.headers.get("host");
  if (isKideasePublicHost(host)) {
    setCookie(SHARED_TWO_FACTOR_COOKIE, value, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      domain: KIDEASE_COOKIE_DOMAIN,
      expires,
    });
  }
}
