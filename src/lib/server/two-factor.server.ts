/**
 * Cookie + staff 2FA reads. `.server` so `@tanstack/react-start/server` never
 * enters the client graph. `/verify-2fa` and TwoFactorGate import
 * `two-factor.ts` (createServerFn RPC only) — that file must not import
 * getCookie / setCookie / getRequest.
 */
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import {
  isKideasePublicHost,
  KIDEASE_COOKIE_DOMAIN,
  SHARED_TWO_FACTOR_COOKIE,
  SHARED_TWO_FACTOR_DEVICE_COOKIE,
  TWO_FACTOR_COOKIE,
  TWO_FACTOR_DEVICE_COOKIE,
} from "@/lib/auth/cookies";
import {
  isTwoFactorVerifiedAny,
  signTwoFactorCookie,
  TWO_FACTOR_SESSION_TTL_MS,
} from "@/lib/two-factor-cookie";

function secret() {
  return (process.env.BETTER_AUTH_SECRET || process.env.ADMIN_EMAIL || "kidease-preview").trim();
}

function twoFactorCookieCandidates(): Array<string | null | undefined> {
  return [
    getCookie(TWO_FACTOR_COOKIE),
    getCookie(SHARED_TWO_FACTOR_COOKIE),
    getCookie(TWO_FACTOR_DEVICE_COOKIE),
    getCookie(SHARED_TWO_FACTOR_DEVICE_COOKIE),
  ];
}

export function isCurrentUserTwoFactorVerified(userId: string): boolean {
  return isTwoFactorVerifiedAny(userId, twoFactorCookieCandidates(), secret());
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

function writePair(
  hostName: string,
  sharedName: string,
  value: string,
  expires?: Date,
) {
  const base = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    ...(expires ? { expires } : {}),
  };
  setCookie(hostName, value, base);
  const host = getRequest()?.headers.get("x-forwarded-host") || getRequest()?.headers.get("host");
  if (isKideasePublicHost(host)) {
    setCookie(sharedName, value, { ...base, domain: KIDEASE_COOKIE_DOMAIN });
  }
}

/** This-login 2FA. Session cookie — expired on sign-out. */
export function writeTwoFactorSessionCookie(userId: string) {
  const exp = Date.now() + TWO_FACTOR_SESSION_TTL_MS;
  writePair(TWO_FACTOR_COOKIE, SHARED_TWO_FACTOR_COOKIE, signTwoFactorCookie(userId, exp, secret()));
}

/** 30-day trusted device. Survives sign-out. Only when the user opts in. */
export function writeTwoFactorDeviceCookie(userId: string, ttlMs: number) {
  const exp = Date.now() + ttlMs;
  const expires = new Date(exp);
  writePair(
    TWO_FACTOR_DEVICE_COOKIE,
    SHARED_TWO_FACTOR_DEVICE_COOKIE,
    signTwoFactorCookie(userId, exp, secret()),
    expires,
  );
}
