import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { deviceLabelFromUserAgent } from "@/lib/trusted-device";
import { TWO_FACTOR_DEVICE_TTL_MS } from "@/lib/two-factor-cookie";

export type SignedInDevice = {
  id: string;
  kind: "session" | "trusted";
  label: string;
  current: boolean;
  createdAt: string | null;
  lastSeen: string | null;
  expiresAt: string | null;
  ip: string | null;
};

async function ensureTrustedDeviceTables() {
  const sql = await getSql();
  await sql
    .query(
      `create table if not exists trusted_devices (
        id text primary key,
        user_id text not null,
        device_id text not null,
        label text,
        user_agent text,
        ip text,
        created_at timestamptz not null default now(),
        last_seen timestamptz not null default now(),
        expires_at timestamptz not null,
        revoked_at timestamptz
      )`,
    )
    .catch(() => undefined);
  await sql
    .query(`create unique index if not exists trusted_devices_user_device on trusted_devices (user_id, device_id)`)
    .catch(() => undefined);
}

export async function persistTrustedDevice(input: {
  userId: string;
  deviceId: string;
  exp: number;
  userAgent?: string | null;
  ip?: string | null;
}) {
  await ensureTrustedDeviceTables();
  const sql = await getSql();
  const id = nid("tdev");
  const label = deviceLabelFromUserAgent(input.userAgent);
  const expiresAt = new Date(input.exp).toISOString();
  await sql.query(
    `insert into trusted_devices (id, user_id, device_id, label, user_agent, ip, expires_at)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (user_id, device_id) do update set
       last_seen = now(),
       expires_at = excluded.expires_at,
       label = excluded.label,
       user_agent = excluded.user_agent,
       ip = excluded.ip,
       revoked_at = null`,
    [id, input.userId, input.deviceId, label, input.userAgent || null, input.ip || null, expiresAt],
  );
}

export async function isTrustedDeviceRevoked(userId: string, deviceId: string): Promise<boolean> {
  if (!deviceId) return false;
  await ensureTrustedDeviceTables();
  const sql = await getSql();
  const rows = await sql<{ revoked_at: string | null; expires_at: string }>`
    select revoked_at, expires_at from trusted_devices
    where user_id = ${userId} and device_id = ${deviceId}
    limit 1
  `.catch(() => []);
  const row = rows[0];
  if (!row) return false;
  if (row.revoked_at) return true;
  return new Date(row.expires_at).getTime() < Date.now();
}

export async function touchTrustedDevice(userId: string, deviceId: string) {
  if (!deviceId) return;
  const sql = await getSql();
  await sql`
    update trusted_devices
    set last_seen = now()
    where user_id = ${userId} and device_id = ${deviceId} and revoked_at is null
  `.catch(() => undefined);
}

function maskIp(ip?: string | null): string | null {
  const raw = String(ip || "").trim();
  if (!raw) return null;
  if (raw.includes(".")) {
    const parts = raw.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  }
  if (raw.includes(":")) {
    const parts = raw.split(":");
    return `${parts.slice(0, 3).join(":")}:*`;
  }
  return null;
}

export const listSignedInDevices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ devices: SignedInDevice[] }> => {
    await ensureTrustedDeviceTables();
    const sql = await getSql();
    const { readSessionToken } = await import("@/lib/auth/server");
    const token = readSessionToken();
    const { parseCurrentTrustedDevice } = await import("./two-factor.server");
    const currentDevice = parseCurrentTrustedDevice(context.userId);
    if (currentDevice?.deviceId) {
      await touchTrustedDevice(context.userId, currentDevice.deviceId);
    } else if (currentDevice && !currentDevice.deviceId) {
      const { writeTwoFactorDeviceCookie, requestDeviceHints } = await import("./two-factor.server");
      const remembered = writeTwoFactorDeviceCookie(context.userId, Math.max(60_000, currentDevice.exp - Date.now()));
      const hints = requestDeviceHints();
      await persistTrustedDevice({
        userId: context.userId,
        deviceId: remembered.deviceId,
        exp: remembered.exp,
        userAgent: hints.userAgent,
        ip: hints.ip,
      });
    }

    const sessions = await sql<{
      id: string;
      token: string;
      ipAddress: string | null;
      userAgent: string | null;
      createdAt: string;
      updatedAt: string;
      expiresAt: string;
    }>`
      select id, token, "ipAddress", "userAgent", "createdAt", "updatedAt", "expiresAt"
      from "session"
      where "userId" = ${context.userId} and "expiresAt" > now()
      order by "updatedAt" desc
    `.catch(() => []);

    const trusted = await sql<{
      id: string;
      device_id: string;
      label: string | null;
      user_agent: string | null;
      ip: string | null;
      created_at: string;
      last_seen: string;
      expires_at: string;
    }>`
      select id, device_id, label, user_agent, ip, created_at, last_seen, expires_at
      from trusted_devices
      where user_id = ${context.userId}
        and revoked_at is null
        and expires_at > now()
      order by last_seen desc
    `.catch(() => []);

    const liveDevice = parseCurrentTrustedDevice(context.userId);
    const devices: SignedInDevice[] = [
      ...sessions.map((row) => ({
        id: `session:${row.id}`,
        kind: "session" as const,
        label: deviceLabelFromUserAgent(row.userAgent) + (token && row.token === token ? " · this device" : ""),
        current: Boolean(token && row.token === token),
        createdAt: row.createdAt,
        lastSeen: row.updatedAt,
        expiresAt: row.expiresAt,
        ip: maskIp(row.ipAddress),
      })),
      ...trusted.map((row) => ({
        id: `trusted:${row.device_id}`,
        kind: "trusted" as const,
        label: `${row.label || deviceLabelFromUserAgent(row.user_agent)} · remembered 30 days`,
        current: Boolean(liveDevice?.deviceId && liveDevice.deviceId === row.device_id),
        createdAt: row.created_at,
        lastSeen: row.last_seen,
        expiresAt: row.expires_at,
        ip: maskIp(row.ip),
      })),
    ];

    if (!devices.some((row) => row.current) && (token || liveDevice)) {
      devices.unshift({
        id: liveDevice?.deviceId ? `trusted:${liveDevice.deviceId}` : "session:current",
        kind: liveDevice ? "trusted" : "session",
        label: liveDevice ? "This device · remembered 30 days" : "This device",
        current: true,
        createdAt: null,
        lastSeen: new Date().toISOString(),
        expiresAt: liveDevice ? new Date(liveDevice.exp).toISOString() : null,
        ip: null,
      });
    }

    return { devices };
  });

export const revokeSignedInDevice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { scope: "this" | "others" }) => ({
    scope: input?.scope === "others" ? ("others" as const) : ("this" as const),
  }))
  .handler(async ({ context, data }) => {
    await ensureTrustedDeviceTables();
    const sql = await getSql();
    const { readSessionToken } = await import("@/lib/auth/server");
    const token = readSessionToken();
    if (!token) throw new Error("Could not see this session. Sign in again, then retry.");

    const { parseCurrentTrustedDevice, expireTrustedDeviceCookies, expireThisSessionCookies } =
      await import("./two-factor.server");
    const currentDevice = parseCurrentTrustedDevice(context.userId);

    if (data.scope === "this") {
      const deleted = await sql`
        delete from "session" where "userId" = ${context.userId} and token = ${token}
      `.catch(() => []);
      if (currentDevice?.deviceId) {
        const revoked = await sql`
          update trusted_devices
          set revoked_at = now()
          where user_id = ${context.userId} and device_id = ${currentDevice.deviceId} and revoked_at is null
        `.catch(() => []);
        if (!revoked) throw new Error("Could not revoke this remembered device.");
      }
      if (!deleted) throw new Error("Could not revoke this session.");
      expireThisSessionCookies();
      expireTrustedDeviceCookies();
      return { ok: true as const, signedOut: true as const };
    }

    const others = await sql<{ n: number }>`
      select count(*)::int as n from "session"
      where "userId" = ${context.userId} and token <> ${token} and "expiresAt" > now()
    `.catch(() => [{ n: 0 }]);
    const otherTrusted = await sql<{ n: number }>`
      select count(*)::int as n from trusted_devices
      where user_id = ${context.userId}
        and revoked_at is null
        and expires_at > now()
        and device_id <> ${currentDevice?.deviceId || ""}
    `.catch(() => [{ n: 0 }]);

    try {
      await sql`delete from "session" where "userId" = ${context.userId} and token <> ${token}`;
      if (currentDevice?.deviceId) {
        await sql`
          update trusted_devices
          set revoked_at = now()
          where user_id = ${context.userId}
            and device_id <> ${currentDevice.deviceId}
            and revoked_at is null
        `;
      } else {
        await sql`
          update trusted_devices
          set revoked_at = now()
          where user_id = ${context.userId} and revoked_at is null
        `;
      }
    } catch {
      throw new Error("Could not revoke the other devices. Nothing was marked done.");
    }

    return {
      ok: true as const,
      signedOut: false as const,
      revokedSessions: others[0]?.n ?? 0,
      revokedTrusted: otherTrusted[0]?.n ?? 0,
    };
  });

export { TWO_FACTOR_DEVICE_TTL_MS };
