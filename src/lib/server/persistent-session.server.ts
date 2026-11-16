/**
 * Server-only persistent sessions. The browser file imports the wrappers in
 * persistent-session.ts, which load this module inside the handler.
 */
import { getRequest, setCookie } from "@tanstack/react-start/server";
import {
  isKideasePublicHost,
  KIDEASE_COOKIE_DOMAIN,
  pickCookieValue,
  REFRESH_TOKEN_COOKIE,
  SESSION_TOKEN_COOKIE,
  SHARED_REFRESH_TOKEN_COOKIE,
  SHARED_SESSION_TOKEN_COOKIE,
  unsignedSessionToken,
} from "@/lib/auth/cookies";
import { authSigningSecret } from "@/lib/auth/server";
import { getSql, type Sql } from "@/lib/db";
import { deviceLabelFromUserAgent } from "@/lib/trusted-device";
import {
  cookieMaxAgeSec,
  decideRefresh,
  enrollAllowed,
  NATIVE_ABSOLUTE_MS,
  WEB_IDLE_MS,
  WEB_REMEMBER_MS,
  formatRefreshToken,
  initialSessionWindow,
  maskDeviceIp,
  nextSessionWindow,
  parseRefreshToken,
  persistentSessionsEnabled,
  randomUrlToken,
  requestIsAppShell,
  revokePlan,
  sessionVisibleTo,
  sha256Hex,
  signSessionToken,
  stepUpRequired,
  type RevokeReason,
} from "@/lib/persistent-session";

const DONT_REMEMBER = "__Host-grok-auth.dont_remember";
const SHARED_DONT_REMEMBER = "__Secure-kidease.dont_remember";

type DeviceRow = {
  id: string;
  user_id: string;
  session_token: string | null;
  refresh_hash: string;
  previous_hash: string | null;
  rotated_at: string | Date | null;
  step_up_hash: string | null;
  push_token: string | null;
  shell: boolean;
  remember: boolean;
  idle_expires_at: string | Date | null;
  absolute_expires_at: string | Date;
  revoked_at: string | Date | null;
};

function ms(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const at = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(at) ? at : null;
}

function cookieBase(maxAge: number | null) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    ...(maxAge != null ? { maxAge } : {}),
  };
}

function writePair(hostName: string, sharedName: string, value: string, maxAge: number | null) {
  const base = cookieBase(maxAge);
  setCookie(hostName, value, base);
  const host = getRequest()?.headers.get("x-forwarded-host") || getRequest()?.headers.get("host");
  if (isKideasePublicHost(host)) setCookie(sharedName, value, { ...base, domain: KIDEASE_COOKIE_DOMAIN });
}

function expirePair(hostName: string, sharedName: string) {
  writePair(hostName, sharedName, "", 0);
}

function requestMeta() {
  const request = getRequest();
  const header = request?.headers;
  const ip =
    header?.get("cf-connecting-ip") ||
    header?.get("x-real-ip") ||
    header?.get("x-forwarded-for")?.split(",")[0] ||
    "";
  return {
    cookie: header?.get("cookie") || "",
    userAgent: header?.get("user-agent") || "",
    ip: maskDeviceIp(ip.trim()),
  };
}

async function roleFor(sql: Sql, userId: string): Promise<string | null> {
  const rows = await sql<{ role: string | null }>`
    select role from profiles where user_id = ${userId} limit 1
  `.catch(() => []);
  return rows[0]?.role ?? null;
}

async function sessionByToken(sql: Sql, token: string, userId?: string) {
  if (userId) {
    const rows = await sql<{ id: string; token: string; userId: string; expiresAt: string | Date }>`
      select id, token, "userId", "expiresAt" from "session"
      where token = ${token} and "userId" = ${userId}
      limit 1
    `.catch(() => []);
    return rows[0] ?? null;
  }
  const rows = await sql<{ id: string; token: string; userId: string; expiresAt: string | Date }>`
    select id, token, "userId", "expiresAt" from "session"
    where token = ${token}
    limit 1
  `.catch(() => []);
  return rows[0] ?? null;
}

async function writeSessionCookie(token: string, maxAge: number | null) {
  const signed = await signSessionToken(token, authSigningSecret());
  writePair(SESSION_TOKEN_COOKIE, SHARED_SESSION_TOKEN_COOKIE, signed, maxAge);
  if (maxAge != null) expirePair(DONT_REMEMBER, SHARED_DONT_REMEMBER);
}

function refreshFromRequest(bodyToken?: string | null): string | null {
  const meta = requestMeta();
  const fromBody = String(bodyToken || "").trim();
  if (fromBody) return fromBody;
  return pickCookieValue(meta.cookie, [REFRESH_TOKEN_COOKIE, SHARED_REFRESH_TOKEN_COOKIE]);
}

export function readPersistentStatus() {
  return { enabled: persistentSessionsEnabled(process.env) };
}

export async function issuePersistentSession(input: {
  userId: string;
  remember: boolean;
  clientShell: boolean;
  biometric: boolean;
  pushToken?: string | null;
}) {
  if (!persistentSessionsEnabled(process.env)) return { ok: false as const, skipped: true as const };
  const sql = await getSql();
  if (!enrollAllowed(await roleFor(sql, input.userId))) return { ok: false as const, skipped: true as const };
  const meta = requestMeta();
  const shell = requestIsAppShell({
    userAgent: meta.userAgent,
    cookie: meta.cookie,
    clientShell: input.clientShell,
  });
  const remember = shell ? true : input.remember === true;
  const raw = pickCookieValue(meta.cookie, [SESSION_TOKEN_COOKIE, SHARED_SESSION_TOKEN_COOKIE]);
  const token = unsignedSessionToken(raw);
  if (!token) return { ok: false as const, skipped: false as const };
  const session = await sessionByToken(sql, token, input.userId);
  if (!session || !sessionVisibleTo(session.userId, input.userId)) return { ok: false as const, skipped: false as const };

  const now = Date.now();
  const window = initialSessionWindow({ shell, remember, nowMs: now });
  const secret = randomUrlToken(32);
  const refreshHash = await sha256Hex(secret);
  const stepSecret = shell && input.biometric ? randomUrlToken(32) : null;
  const stepHash = stepSecret ? await sha256Hex(stepSecret) : null;
  const pushToken = String(input.pushToken || "").trim() || null;
  const existing = await sql<{ id: string }>`
    select id from device_sessions
    where user_id = ${input.userId} and session_token = ${token} and revoked_at is null
    limit 1
  `.catch(() => []);

  let id = existing[0]?.id || "";
  if (id) {
    await sql`
      update device_sessions set
        refresh_hash = ${refreshHash},
        previous_hash = null,
        rotated_at = now(),
        step_up_hash = ${stepHash},
        push_token = ${pushToken},
        shell = ${shell},
        remember = ${remember},
        label = ${deviceLabelFromUserAgent(meta.userAgent)},
        platform = ${shell ? "shell" : "web"},
        user_agent = ${meta.userAgent.slice(0, 300)},
        ip = ${meta.ip},
        last_seen_at = now(),
        idle_expires_at = ${window.idleMs ? new Date(window.idleMs).toISOString() : null},
        absolute_expires_at = ${new Date(window.absoluteMs).toISOString()}
      where id = ${id} and user_id = ${input.userId}
    `;
  } else {
    id = `ds_${randomUrlToken(12)}`;
    await sql`
      insert into device_sessions (
        id, user_id, session_id, session_token, refresh_hash, step_up_hash, push_token,
        label, platform, user_agent, ip, shell, remember, idle_expires_at, absolute_expires_at
      ) values (
        ${id}, ${input.userId}, ${session.id}, ${token}, ${refreshHash}, ${stepHash}, ${pushToken},
        ${deviceLabelFromUserAgent(meta.userAgent)}, ${shell ? "shell" : "web"},
        ${meta.userAgent.slice(0, 300)}, ${meta.ip}, ${shell}, ${remember},
        ${window.idleMs ? new Date(window.idleMs).toISOString() : null},
        ${new Date(window.absoluteMs).toISOString()}
      )
    `;
  }

  await sql`
    update "session"
    set "expiresAt" = ${new Date(window.expiresAtMs).toISOString()}, "updatedAt" = now()
    where id = ${session.id} and "userId" = ${input.userId}
  `;
  const maxAge = cookieMaxAgeSec({ shell, remember });
  await writeSessionCookie(token, maxAge);
  writePair(REFRESH_TOKEN_COOKIE, SHARED_REFRESH_TOKEN_COOKIE, formatRefreshToken(id, secret), maxAge);
  return {
    ok: true as const,
    skipped: false as const,
    shell,
    refreshToken: shell ? formatRefreshToken(id, secret) : null,
    stepUpSecret: stepSecret,
  };
}

/**
 * Rotate the refresh secret and extend the session. Does not delete or replace
 * push_device_tokens — a session refresh must keep alerts arriving.
 */
export async function refreshDeviceSession(bodyToken?: string | null) {
  if (!persistentSessionsEnabled(process.env)) return { ok: false as const, skipped: true as const };
  const parsed = parseRefreshToken(refreshFromRequest(bodyToken));
  if (!parsed) return { ok: false as const, skipped: false as const };
  const sql = await getSql();
  const rows = await sql<DeviceRow>`
    select id, user_id, session_token, refresh_hash, previous_hash, rotated_at, step_up_hash,
           push_token, shell, remember, idle_expires_at, absolute_expires_at, revoked_at
    from device_sessions
    where id = ${parsed.id}
    limit 1
  `.catch(() => []);
  const row = rows[0];
  if (!row) return { ok: false as const, skipped: false as const };
  const now = Date.now();
  const presented = await sha256Hex(parsed.secret);
  const decision = decideRefresh({
    presentedHash: presented,
    currentHash: row.refresh_hash,
    previousHash: row.previous_hash,
    rotatedAtMs: ms(row.rotated_at),
    nowMs: now,
    revoked: Boolean(row.revoked_at),
    absoluteMs: ms(row.absolute_expires_at) ?? 0,
  });
  if (decision === "reject") return { ok: false as const, skipped: false as const };
  if (decision === "revoke") {
    await sql`
      update device_sessions
      set revoked_at = now(), revoke_reason = ${"security"}
      where id = ${row.id} and user_id = ${row.user_id}
    `;
    if (row.session_token) {
      await sql`delete from "session" where token = ${row.session_token} and "userId" = ${row.user_id}`;
    }
    return { ok: false as const, skipped: false as const };
  }

  const sessionToken = String(row.session_token || "");
  const session = sessionToken ? await sessionByToken(sql, sessionToken, row.user_id) : null;
  if (!session || !sessionVisibleTo(session.userId, row.user_id)) {
    await sql`
      update device_sessions set revoked_at = now(), revoke_reason = ${"security"}
      where id = ${row.id}
    `;
    return { ok: false as const, skipped: false as const };
  }

  const meta = requestMeta();
  const incoming = unsignedSessionToken(pickCookieValue(meta.cookie, [SESSION_TOKEN_COOKIE, SHARED_SESSION_TOKEN_COOKIE]));
  const expired = ms(session.expiresAt);
  const revived = !incoming || incoming !== session.token || (expired != null && expired <= now);
  const shell = Boolean(row.shell);
  const remember = Boolean(row.remember);
  const slidAbsolute = shell ? now + NATIVE_ABSOLUTE_MS : remember ? now + WEB_REMEMBER_MS : now + WEB_IDLE_MS;
  const nextToken = shell ? randomUrlToken(24) : session.token;
  const secret = randomUrlToken(32);
  const refreshHash = await sha256Hex(secret);
  await sql`
    update "session"
    set token = ${nextToken},
        "expiresAt" = ${new Date(slidAbsolute).toISOString()},
        "updatedAt" = now()
    where id = ${session.id} and "userId" = ${row.user_id}
  `;
  await sql`
    update device_sessions set
      session_token = ${nextToken},
      refresh_hash = ${refreshHash},
      previous_hash = ${row.refresh_hash},
      rotated_at = now(),
      last_seen_at = now(),
      absolute_expires_at = ${new Date(slidAbsolute).toISOString()},
      idle_expires_at = ${shell || remember ? null : new Date(slidAbsolute).toISOString()},
      user_agent = ${meta.userAgent.slice(0, 300)},
      ip = ${meta.ip}
    where id = ${row.id} and user_id = ${row.user_id}
  `;
  const maxAge = cookieMaxAgeSec({ shell, remember });
  await writeSessionCookie(nextToken, maxAge);
  writePair(REFRESH_TOKEN_COOKIE, SHARED_REFRESH_TOKEN_COOKIE, formatRefreshToken(row.id, secret), maxAge);
  return {
    ok: true as const,
    skipped: false as const,
    revived,
    shell,
    refreshToken: shell ? formatRefreshToken(row.id, secret) : null,
  };
}

export async function enforcePersistentSession(token: string | null): Promise<boolean> {
  if (!token || !persistentSessionsEnabled(process.env)) return true;
  try {
    const sql = await getSql();
    const rows = await sql<DeviceRow>`
      select id, user_id, session_token, refresh_hash, previous_hash, rotated_at, step_up_hash,
             push_token, shell, remember, idle_expires_at, absolute_expires_at, revoked_at
      from device_sessions
      where session_token = ${token} and revoked_at is null
      limit 1
    `;
    const row = rows[0];
    if (!row) return true;
    const now = Date.now();
    const next = nextSessionWindow({
      shell: Boolean(row.shell),
      remember: Boolean(row.remember),
      nowMs: now,
      absoluteMs: ms(row.absolute_expires_at) ?? 0,
      idleMs: ms(row.idle_expires_at),
    });
    if (next.expired || row.revoked_at) {
      await sql`delete from "session" where token = ${token} and "userId" = ${row.user_id}`;
      await sql`
        update device_sessions
        set revoked_at = now(), revoke_reason = ${"logout"}
        where id = ${row.id} and user_id = ${row.user_id}
      `;
      return false;
    }
    await sql`
      update device_sessions set
        last_seen_at = now(),
        absolute_expires_at = ${new Date(next.absoluteMs).toISOString()},
        idle_expires_at = ${next.idleMs ? new Date(next.idleMs).toISOString() : null}
      where id = ${row.id} and user_id = ${row.user_id}
    `;
    await sql`
      update "session"
      set "expiresAt" = ${new Date(next.expiresAtMs).toISOString()}
      where token = ${token} and "userId" = ${row.user_id} and "expiresAt" < ${new Date(next.expiresAtMs).toISOString()}
    `;
    return true;
  } catch {
    return true;
  }
}

async function deletePushToken(sql: Sql, userId: string, token: string | null) {
  const value = String(token || "").trim();
  if (!value) return;
  await sql`delete from push_device_tokens where user_id = ${userId} and token = ${value}`.catch(() => undefined);
}

export async function forgetUserSessions(userId: string, reason: RevokeReason) {
  const plan = revokePlan(reason, persistentSessionsEnabled(process.env));
  if (!plan.allSessions && !plan.currentSession) return plan;
  const sql = await getSql();
  if (plan.push === "all") {
    await sql`delete from push_device_tokens where user_id = ${userId}`.catch(() => undefined);
  }
  await sql`
    update device_sessions
    set revoked_at = now(), revoke_reason = ${reason}
    where user_id = ${userId} and revoked_at is null
  `.catch(() => undefined);
  if (plan.allSessions) {
    await sql`delete from "session" where "userId" = ${userId}`.catch(() => undefined);
  }
  return plan;
}

export async function revokePersistentDevice(input: {
  userId: string;
  current?: boolean;
  sessionId?: string;
  everywhere?: boolean;
}) {
  if (!persistentSessionsEnabled(process.env)) return { ok: false as const, skipped: true as const, signedOut: false as const };
  const sql = await getSql();
  const meta = requestMeta();
  const current = unsignedSessionToken(pickCookieValue(meta.cookie, [SESSION_TOKEN_COOKIE, SHARED_SESSION_TOKEN_COOKIE]));
  if (input.everywhere) {
    await forgetUserSessions(input.userId, "security");
    expirePair(SESSION_TOKEN_COOKIE, SHARED_SESSION_TOKEN_COOKIE);
    expirePair(REFRESH_TOKEN_COOKIE, SHARED_REFRESH_TOKEN_COOKIE);
    return { ok: true as const, skipped: false as const, signedOut: true as const };
  }

  let token = current;
  if (input.sessionId) {
    const rows = await sql<{ token: string; userId: string }>`
      select token, "userId" from "session" where id = ${input.sessionId} limit 1
    `.catch(() => []);
    const row = rows[0];
    if (!row || !sessionVisibleTo(row.userId, input.userId)) throw new Error("That device is not on this account.");
    token = row.token;
  }
  if (!token) throw new Error("Could not see this session. Sign in again, then retry.");
  const devices = await sql<{ push_token: string | null }>`
    select push_token from device_sessions
    where user_id = ${input.userId} and session_token = ${token} and revoked_at is null
  `.catch(() => []);
  await sql`delete from "session" where token = ${token} and "userId" = ${input.userId}`;
  await sql`
    update device_sessions
    set revoked_at = now(), revoke_reason = ${"logout"}
    where user_id = ${input.userId} and session_token = ${token}
  `;
  for (const device of devices) await deletePushToken(sql, input.userId, device.push_token);
  const signedOut = Boolean(current && token === current);
  if (signedOut) {
    expirePair(SESSION_TOKEN_COOKIE, SHARED_SESSION_TOKEN_COOKIE);
    expirePair(REFRESH_TOKEN_COOKIE, SHARED_REFRESH_TOKEN_COOKIE);
  }
  return { ok: true as const, skipped: false as const, signedOut };
}

export async function confirmPersistentBiometric(userId: string, secret: string) {
  if (!persistentSessionsEnabled(process.env)) return { ok: false as const, skipped: true as const };
  if (!stepUpRequired("password_change", true)) return { ok: false as const, skipped: true as const };
  const parsed = String(secret || "").trim();
  if (parsed.length < 20) return { ok: false as const, skipped: false as const };
  const sql = await getSql();
  const meta = requestMeta();
  const token = unsignedSessionToken(pickCookieValue(meta.cookie, [SESSION_TOKEN_COOKIE, SHARED_SESSION_TOKEN_COOKIE]));
  if (!token) return { ok: false as const, skipped: false as const };
  const rows = await sql<{ id: string; user_id: string; step_up_hash: string | null }>`
    select id, user_id, step_up_hash from device_sessions
    where session_token = ${token} and revoked_at is null
    limit 1
  `.catch(() => []);
  const row = rows[0];
  if (!row || !sessionVisibleTo(row.user_id, userId) || !row.step_up_hash) return { ok: false as const, skipped: false as const };
  const hash = await sha256Hex(parsed);
  if (hash !== row.step_up_hash) return { ok: false as const, skipped: false as const };
  const next = randomUrlToken(32);
  await sql`
    update device_sessions set step_up_hash = ${await sha256Hex(next)}
    where id = ${row.id} and user_id = ${userId}
  `;
  const { writeReauthCookie } = await import("./reauth.server");
  writeReauthCookie(userId);
  return { ok: true as const, skipped: false as const, stepUpSecret: next };
}

export async function assertPersistentStepUp(userId: string, action: string) {
  if (!stepUpRequired(action, persistentSessionsEnabled(process.env))) return;
  const { assertRecentReauth } = await import("./reauth.server");
  assertRecentReauth(userId);
}

export async function touchPersistentPush(userId: string, token: string) {
  if (!persistentSessionsEnabled(process.env)) return { ok: false as const, skipped: true as const };
  const next = String(token || "").trim();
  if (!next) return { ok: false as const, skipped: false as const };
  const sql = await getSql();
  const meta = requestMeta();
  const sessionToken = unsignedSessionToken(pickCookieValue(meta.cookie, [SESSION_TOKEN_COOKIE, SHARED_SESSION_TOKEN_COOKIE]));
  if (!sessionToken) return { ok: false as const, skipped: false as const };
  const rows = await sql<{ id: string; push_token: string | null; user_id: string }>`
    select id, push_token, user_id from device_sessions
    where session_token = ${sessionToken} and revoked_at is null
    limit 1
  `.catch(() => []);
  const row = rows[0];
  if (!row || !sessionVisibleTo(row.user_id, userId)) return { ok: false as const, skipped: false as const };
  if (row.push_token && row.push_token !== next) await deletePushToken(sql, userId, row.push_token);
  await sql`update device_sessions set push_token = ${next} where id = ${row.id} and user_id = ${userId}`;
  return { ok: true as const, skipped: false as const };
}
