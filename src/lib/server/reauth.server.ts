/**
 * Step-up cookie I/O. `.server` so getCookie / setCookie stay off the client graph.
 */
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import {
  isKideasePublicHost,
  KIDEASE_COOKIE_DOMAIN,
} from "@/lib/auth/cookies";
import {
  ADMIN_IDLE_COOKIE,
  ADMIN_IDLE_TTL_MS,
  isRecentReauth,
  REAUTH_COOKIE,
  REAUTH_REQUIRED_MESSAGE,
  REAUTH_WINDOW_MS,
  SHARED_ADMIN_IDLE_COOKIE,
  SHARED_REAUTH_COOKIE,
  signReauthCookie,
} from "@/lib/reauth";

function secret() {
  return (process.env.BETTER_AUTH_SECRET || process.env.ADMIN_EMAIL || "kidease-preview").trim();
}

function writePair(hostName: string, sharedName: string, value: string, expires: Date) {
  const base = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
  setCookie(hostName, value, base);
  const host = getRequest()?.headers.get("x-forwarded-host") || getRequest()?.headers.get("host");
  if (isKideasePublicHost(host)) {
    setCookie(sharedName, value, { ...base, domain: KIDEASE_COOKIE_DOMAIN });
  }
}

export function writeReauthCookie(userId: string, ttlMs = REAUTH_WINDOW_MS) {
  const exp = Date.now() + ttlMs;
  writePair(REAUTH_COOKIE, SHARED_REAUTH_COOKIE, signReauthCookie(userId, exp, secret()), new Date(exp));
}

export function isCurrentUserRecentlyReauthed(userId: string): boolean {
  return isRecentReauth(
    userId,
    getCookie(REAUTH_COOKIE) || getCookie(SHARED_REAUTH_COOKIE),
    secret(),
  );
}

export function assertRecentReauth(userId: string) {
  if (!isCurrentUserRecentlyReauthed(userId)) {
    throw new Error(REAUTH_REQUIRED_MESSAGE);
  }
}

export function writeAdminIdleCookie() {
  const exp = Date.now() + ADMIN_IDLE_TTL_MS;
  writePair(ADMIN_IDLE_COOKIE, SHARED_ADMIN_IDLE_COOKIE, "1", new Date(exp));
}

export function isAdminIdleFresh(): boolean {
  return Boolean(getCookie(ADMIN_IDLE_COOKIE) || getCookie(SHARED_ADMIN_IDLE_COOKIE));
}

export const ADMIN_IDLE_MESSAGE = "Admin session timed out. Sign in again.";

/**
 * When the idle cookie is missing, allow a brand-new Better Auth session
 * (created within ADMIN_IDLE_TTL_MS) to mint the cookie. Uses the unsigned
 * session token — the signed cookie value never matches `session.token`.
 */
export async function bootstrapAdminIdleFromSession(userId: string, nowMs = Date.now()): Promise<boolean> {
  if (isAdminIdleFresh()) {
    writeAdminIdleCookie();
    return true;
  }
  const { readSessionToken } = await import("@/lib/auth/server");
  const token = readSessionToken();
  if (!token) return false;
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ createdAt: string }>`
    select "createdAt" from "session" where token = ${token} and "userId" = ${userId} limit 1
  `.catch(() => []);
  const created = rows[0]?.createdAt ? new Date(rows[0].createdAt).getTime() : 0;
  if (created && nowMs - created < ADMIN_IDLE_TTL_MS) {
    writeAdminIdleCookie();
    return true;
  }
  return false;
}

export async function assertAdminIdleFresh(userId: string) {
  if (await bootstrapAdminIdleFromSession(userId)) return;
  throw new Error(ADMIN_IDLE_MESSAGE);
}
