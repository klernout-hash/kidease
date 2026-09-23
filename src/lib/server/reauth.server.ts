/**
 * Step-up cookie I/O. `.server` so getCookie / setCookie stay off the client graph.
 */
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { isAdminIdleWindowFresh, parseTimestampMs } from "@/lib/admin-idle";
import {
  ADMIN_IDLE_COOKIE,
  isKideasePublicHost,
  KIDEASE_COOKIE_DOMAIN,
  pickCookieValue,
  SHARED_ADMIN_IDLE_COOKIE,
} from "@/lib/auth/cookies";
import {
  ADMIN_IDLE_TTL_MS,
  adminReauthGraceMs,
  parseReauthProof,
  REAUTH_COOKIE,
  REAUTH_REQUIRED_MESSAGE,
  REAUTH_WINDOW_MS,
  reauthProofAllows,
  SHARED_REAUTH_COOKIE,
  signReauthStamp,
  type StepUpClass,
} from "@/lib/reauth";

function secret() {
  return (process.env.BETTER_AUTH_SECRET || process.env.ADMIN_EMAIL || "kidease-preview").trim();
}

function writePair(
  hostName: string,
  sharedName: string,
  value: string,
  expires: Date,
  maxAgeSec?: number,
) {
  const base = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    expires,
    ...(maxAgeSec != null ? { maxAge: maxAgeSec } : {}),
  };
  setCookie(hostName, value, base);
  const host = getRequest()?.headers.get("x-forwarded-host") || getRequest()?.headers.get("host");
  if (isKideasePublicHost(host)) {
    setCookie(sharedName, value, { ...base, domain: KIDEASE_COOKIE_DOMAIN });
  }
}

function graceMs() {
  return adminReauthGraceMs(process.env.ADMIN_REAUTH_GRACE_MS);
}

function currentProof() {
  return parseReauthProof(getCookie(REAUTH_COOKIE) || getCookie(SHARED_REAUTH_COOKIE), secret());
}

/**
 * Records confirm time. The browser keeps the cookie for the longer of the
 * high-stakes window and the desk grace. Each action class checks its own window.
 */
export function writeReauthCookie(userId: string) {
  const confirmedAt = Date.now();
  const grace = graceMs();
  const browserExp = confirmedAt + Math.max(REAUTH_WINDOW_MS, grace);
  writePair(
    REAUTH_COOKIE,
    SHARED_REAUTH_COOKIE,
    signReauthStamp(userId, confirmedAt, secret()),
    new Date(browserExp),
  );
}

export function isStepUpFresh(userId: string, klass: StepUpClass): boolean {
  return reauthProofAllows(currentProof(), userId, klass, Date.now(), graceMs());
}

/** High-stakes step-up (Approve/Live and the other trust actions). */
export function isCurrentUserRecentlyReauthed(userId: string): boolean {
  return isStepUpFresh(userId, "high");
}

export function assertRecentReauth(userId: string) {
  if (!isCurrentUserRecentlyReauthed(userId)) {
    throw new Error(REAUTH_REQUIRED_MESSAGE);
  }
}

/** Low-risk desk edits: skip the dialog inside the grace window. */
export function assertGraceReauth(userId: string) {
  if (!isStepUpFresh(userId, "grace")) {
    throw new Error(REAUTH_REQUIRED_MESSAGE);
  }
}

export function writeAdminIdleCookie() {
  const maxAge = Math.ceil(ADMIN_IDLE_TTL_MS / 1000);
  const exp = Date.now() + ADMIN_IDLE_TTL_MS;
  writePair(ADMIN_IDLE_COOKIE, SHARED_ADMIN_IDLE_COOKIE, "1", new Date(exp), maxAge);
}

export function isAdminIdleFresh(): boolean {
  if (getCookie(ADMIN_IDLE_COOKIE) || getCookie(SHARED_ADMIN_IDLE_COOKIE)) return true;
  const header = getRequest()?.headers.get("cookie");
  return Boolean(pickCookieValue(header, [ADMIN_IDLE_COOKIE, SHARED_ADMIN_IDLE_COOKIE]));
}

export const ADMIN_IDLE_MESSAGE = "Admin session timed out. Sign in again.";

async function resolveCurrentSessionToken(userId: string): Promise<{
  token: string | null;
  createdAtMs: number;
}> {
  const { getVerifiedAuthSession } = await import("@/lib/auth/verify.server");
  const verified = await getVerifiedAuthSession().catch(() => null);
  if (verified && verified.id === userId) {
    return { token: verified.token, createdAtMs: verified.createdAtMs };
  }
  const { readSessionToken } = await import("@/lib/auth/server");
  return { token: readSessionToken(), createdAtMs: 0 };
}

async function lookupSessionCreatedAtMs(userId: string, token: string): Promise<number> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ createdAt: string | Date }>`
    select "createdAt" from "session" where token = ${token} and "userId" = ${userId} limit 1
  `.catch(() => []);
  return parseTimestampMs(rows[0]?.createdAt);
}

async function readAdminIdleSeenMs(userId: string, token: string): Promise<number | null> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ seen_at: string | Date }>`
    select seen_at from admin_idle_seen
    where user_id = ${userId} and session_token = ${token}
    limit 1
  `.catch(() => []);
  const ms = parseTimestampMs(rows[0]?.seen_at);
  return ms || null;
}

async function touchAdminIdleSeen(userId: string, token: string | null): Promise<void> {
  if (!token) return;
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`
    insert into admin_idle_seen (user_id, session_token, seen_at)
    values (${userId}, ${token}, now())
    on conflict (user_id, session_token) do update set seen_at = now()
  `.catch(() => undefined);
}

export async function markAdminIdleFresh(userId: string): Promise<void> {
  writeAdminIdleCookie();
  const { token } = await resolveCurrentSessionToken(userId);
  await touchAdminIdleSeen(userId, token);
}

/**
 * Idle cookie, per-session last-seen, or a brand-new Better Auth session
 * (created within ADMIN_IDLE_TTL_MS) may mint/refresh the idle window.
 *
 * Prefer `auth.api.getSession()` — it already unwraps the signed cookie.
 * `readSessionToken()` is the fallback and must strip Better Auth's HMAC
 * (base64urlnopad, not only padded base64).
 */
export async function bootstrapAdminIdleFromSession(userId: string, nowMs = Date.now()): Promise<boolean> {
  const cookiePresent = isAdminIdleFresh();
  const { token, createdAtMs: verifiedCreatedAtMs } = await resolveCurrentSessionToken(userId);
  let createdAtMs = verifiedCreatedAtMs;
  if (!createdAtMs && token) {
    createdAtMs = await lookupSessionCreatedAtMs(userId, token);
  }
  const lastSeenAtMs = token ? await readAdminIdleSeenMs(userId, token) : null;
  if (
    !isAdminIdleWindowFresh({
      idleCookiePresent: cookiePresent,
      sessionCreatedAtMs: createdAtMs,
      lastSeenAtMs,
      nowMs,
    })
  ) {
    return false;
  }
  writeAdminIdleCookie();
  await touchAdminIdleSeen(userId, token);
  return true;
}

export async function assertAdminIdleFresh(userId: string) {
  if (await bootstrapAdminIdleFromSession(userId)) return;
  throw new Error(ADMIN_IDLE_MESSAGE);
}
