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
  SESSION_TOKEN_COOKIE,
  SHARED_SESSION_TOKEN_COOKIE,
  SHARED_TWO_FACTOR_COOKIE,
  SHARED_TWO_FACTOR_DEVICE_COOKIE,
  TWO_FACTOR_COOKIE,
  TWO_FACTOR_DEVICE_COOKIE,
} from "@/lib/auth/cookies";
import { REAUTH_COOKIE, SHARED_REAUTH_COOKIE } from "@/lib/reauth";
import { nid } from "@/lib/utils";
import {
  isTwoFactorVerifiedAny,
  parseTwoFactorDevice,
  signTwoFactorCookie,
  signTwoFactorDeviceCookie,
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

export function requestDeviceHints() {
  const req = getRequest();
  const headers = req?.headers;
  return {
    userAgent: headers?.get("user-agent") || "",
    ip:
      headers?.get("cf-connecting-ip") ||
      headers?.get("x-real-ip") ||
      headers?.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "",
  };
}

export function parseCurrentTrustedDevice(userId: string) {
  const device =
    parseTwoFactorDevice(getCookie(TWO_FACTOR_DEVICE_COOKIE), secret()) ||
    parseTwoFactorDevice(getCookie(SHARED_TWO_FACTOR_DEVICE_COOKIE), secret());
  if (!device || device.userId !== userId) return null;
  return device;
}

export async function assertTrustedDeviceActive(userId: string) {
  const device = parseCurrentTrustedDevice(userId);
  if (!device?.deviceId) return;
  const { isTrustedDeviceRevoked } = await import("./trusted-devices");
  if (await isTrustedDeviceRevoked(userId, device.deviceId)) {
    throw new Error("Two-factor verification required");
  }
}

function expirePair(hostName: string, sharedName: string) {
  const base = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 0 };
  setCookie(hostName, "", base);
  const host = getRequest()?.headers.get("x-forwarded-host") || getRequest()?.headers.get("host");
  if (isKideasePublicHost(host)) {
    setCookie(sharedName, "", { ...base, domain: KIDEASE_COOKIE_DOMAIN });
  }
}

export function expireTrustedDeviceCookies() {
  expirePair(TWO_FACTOR_DEVICE_COOKIE, SHARED_TWO_FACTOR_DEVICE_COOKIE);
}

export function expireThisSessionCookies() {
  expirePair(TWO_FACTOR_COOKIE, SHARED_TWO_FACTOR_COOKIE);
  expirePair(SESSION_TOKEN_COOKIE, SHARED_SESSION_TOKEN_COOKIE);
  expirePair(REAUTH_COOKIE, SHARED_REAUTH_COOKIE);
}

export { assertAdminIdleFresh } from "./reauth.server";

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
  const exp = Date.now() + Math.max(60_000, ttlMs);
  const deviceId = nid("dev");
  const expires = new Date(exp);
  writePair(
    TWO_FACTOR_DEVICE_COOKIE,
    SHARED_TWO_FACTOR_DEVICE_COOKIE,
    signTwoFactorDeviceCookie(userId, deviceId, exp, secret()),
    expires,
  );
  return { deviceId, exp };
}
