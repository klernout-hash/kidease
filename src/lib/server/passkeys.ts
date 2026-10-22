import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import {
  PASSKEY_CHALLENGE_TTL_MS,
  PASSKEY_MAX_PER_USER,
  PASSKEY_RATE_WINDOW_MS,
  cleanDeviceName,
  passkeyRateLimited,
} from "@/lib/passkey-policy";

export class PasskeyRateError extends Error {
  readonly code = "PASSKEY_RATE_LIMIT";
  constructor() {
    super("Too many tries. Wait a few minutes, then try again.");
  }
}

export class PasskeyLimitError extends Error {
  readonly code = "PASSKEY_LIMIT";
  constructor() {
    super("This account already has the maximum number of passkeys.");
  }
}

export type PasskeyRecord = {
  id: string;
  userId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
};

export type PasskeyListItem = {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type ChallengeKind = "register" | "login";

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function bytesFromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function countRecentChallenges(userId: string | null, ip: string): Promise<number> {
  const sql = await getSql();
  const cutoff = new Date(Date.now() - PASSKEY_RATE_WINDOW_MS);
  const rows = await sql<{ n: number | string }>`
    select count(*)::int as n
    from passkey_challenges
    where created_at > ${cutoff}
      and (ip = ${ip} or (${userId}::text is not null and user_id = ${userId}))
  `;
  return asNumber(rows[0]?.n);
}

export async function openPasskeyChallenge(input: {
  userId: string | null;
  ip: string;
  kind: ChallengeKind;
  challenge: string;
}): Promise<string> {
  const sql = await getSql();
  await sql`delete from passkey_challenges where expires_at < now()`;
  const recent = await countRecentChallenges(input.userId, input.ip);
  if (passkeyRateLimited(recent)) throw new PasskeyRateError();
  const id = randomBytes(16).toString("hex");
  const expires = new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS);
  await sql`
    insert into passkey_challenges (id, user_id, ip, kind, challenge, expires_at)
    values (${id}, ${input.userId}, ${input.ip}, ${input.kind}, ${input.challenge}, ${expires})
  `;
  return id;
}

export async function takePasskeyChallenge(input: {
  id: string;
  kind: ChallengeKind;
  userId?: string | null;
}): Promise<string | null> {
  if (!/^[a-f0-9]{32}$/.test(input.id)) return null;
  const sql = await getSql();
  const rows = await sql<{ challenge: string; user_id: string | null; expires_at: unknown }>`
    select challenge, user_id, expires_at
    from passkey_challenges
    where id = ${input.id} and kind = ${input.kind}
  `;
  const row = rows[0];
  await sql`delete from passkey_challenges where id = ${input.id}`;
  if (!row) return null;
  const expires = new Date(iso(row.expires_at)).getTime();
  if (!Number.isFinite(expires) || expires < Date.now()) return null;
  if (input.kind === "register" && row.user_id !== (input.userId ?? null)) return null;
  return row.challenge;
}

export async function countPasskeys(userId: string): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ n: number | string }>`
    select count(*)::int as n from passkey_credentials where user_id = ${userId}
  `;
  return asNumber(rows[0]?.n);
}

export async function assertPasskeyRoom(userId: string): Promise<void> {
  if ((await countPasskeys(userId)) >= PASSKEY_MAX_PER_USER) throw new PasskeyLimitError();
}

export async function listPasskeyIds(userId: string): Promise<Array<{ id: string; transports: string[] }>> {
  const sql = await getSql();
  const rows = await sql<{ id: string; transports: string }>`
    select id, transports from passkey_credentials where user_id = ${userId}
  `;
  return rows.map((row) => ({
    id: row.id,
    transports: row.transports ? row.transports.split(",").filter(Boolean) : [],
  }));
}

export async function listPasskeysForUser(userId: string): Promise<PasskeyListItem[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    device_name: string;
    created_at: unknown;
    last_used_at: unknown;
  }>`
    select id, device_name, created_at, last_used_at
    from passkey_credentials
    where user_id = ${userId}
    order by created_at desc
  `;
  return rows.map((row) => ({
    id: row.id,
    deviceName: cleanDeviceName(row.device_name),
    createdAt: iso(row.created_at),
    lastUsedAt: row.last_used_at ? iso(row.last_used_at) : null,
  }));
}

export async function savePasskey(input: {
  id: string;
  userId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  deviceName: string;
}): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into passkey_credentials (id, user_id, public_key, counter, transports, device_name)
    values (
      ${input.id},
      ${input.userId},
      ${base64UrlFromBytes(input.publicKey)},
      ${input.counter},
      ${input.transports.join(",")},
      ${cleanDeviceName(input.deviceName)}
    )
  `;
}

export async function findPasskey(id: string): Promise<PasskeyRecord | null> {
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(id)) return null;
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    user_id: string;
    public_key: string;
    counter: number | string;
    transports: string;
  }>`
    select id, user_id, public_key, counter, transports
    from passkey_credentials
    where id = ${id}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    publicKey: bytesFromBase64Url(row.public_key),
    counter: asNumber(row.counter),
    transports: row.transports ? row.transports.split(",").filter(Boolean) : [],
  };
}

export async function touchPasskey(id: string, counter: number): Promise<void> {
  const sql = await getSql();
  await sql`
    update passkey_credentials
    set counter = ${counter}, last_used_at = now()
    where id = ${id}
  `;
}

export async function deletePasskey(userId: string, id: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(id)) return false;
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    delete from passkey_credentials
    where id = ${id} and user_id = ${userId}
    returning id
  `;
  return rows.length > 0;
}

export async function logPasskeyEvent(input: {
  kind: "passkey_add" | "passkey_login" | "passkey_remove" | "passkey_fail";
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, string | boolean | number | null>;
}): Promise<void> {
  try {
    const sql = await getSql();
    const id = randomBytes(16).toString("hex");
    const meta = JSON.stringify(input.meta ?? {});
    await sql`
      insert into security_events (id, kind, actor_user_id, target_user_id, ip, user_agent, meta)
      values (
        ${id},
        ${input.kind},
        ${input.userId ?? null},
        ${input.userId ?? null},
        ${input.ip ?? null},
        ${(input.userAgent || "").slice(0, 240) || null},
        ${meta}::jsonb
      )
    `;
  } catch {
    /* audit must not block sign-in */
  }
}
