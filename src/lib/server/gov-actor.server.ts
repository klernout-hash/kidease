import { createHash, randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { takeGovBudget } from "@/lib/gov/rate-limit";
import { isProvinceCode } from "@/lib/gov/places";

export type GovActor = {
  userId: string;
  orgId: string;
  orgName: string;
  province: string;
  demo: boolean;
  readOnly: boolean;
};

export function hashGovSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newGovToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function loadGovActor(userId: string): Promise<GovActor | null> {
  const sql = await getSql();
  const rows = await sql<{
    role: string;
    org_id: string;
    org_name: string;
    province: string;
    demo: number;
    read_only: number;
    status: string;
  }>`
    select p.role, m.org_id, o.name as org_name, o.province, o.demo, m.read_only, m.status
    from profiles p
    join government_members m on m.user_id = p.user_id
    join government_orgs o on o.id = m.org_id
    where p.user_id = ${userId}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  if (String(row.role) !== "government") return null;
  if (String(row.status) !== "active") return null;
  return {
    userId,
    orgId: row.org_id,
    orgName: row.org_name,
    province: isProvinceCode(row.province) ? row.province : "MB",
    demo: Number(row.demo) === 1,
    readOnly: Number(row.read_only) === 1 || Number(row.demo) === 1,
  };
}

export async function requireGovActor(userId: string): Promise<GovActor> {
  const actor = await loadGovActor(userId);
  if (!actor) {
    const err = new Error("Not authorized");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return actor;
}

export function assertGovBudget(actor: GovActor, action: string): { remaining: number } {
  const decision = takeGovBudget(`${actor.userId}:${action}`, actor.demo);
  if (!decision.ok) {
    const err = new Error("Too many requests") as Error & { status?: number; retryAfterSec?: number };
    err.status = 429;
    err.retryAfterSec = decision.retryAfterSec;
    throw err;
  }
  return { remaining: decision.remaining };
}

export function assertGovWritable(actor: GovActor): void {
  if (actor.readOnly || actor.demo) {
    const err = new Error("This demo account is read only");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
}

export async function auditGov(input: {
  userId: string | null;
  action: "login" | "export_csv" | "export_pdf" | "open_data" | "invite" | "revoke" | "api_key_mint" | "api_key_revoke";
  province?: string | null;
}): Promise<void> {
  const sql = await getSql();
  const id = `ga_${randomBytes(8).toString("hex")}`;
  if (input.action === "login" && input.userId) {
    const recent = await sql<{ n: number }>`
      select count(*)::int as n
      from government_audit
      where user_id = ${input.userId}
        and action = 'login'
        and created_at > now() - interval '12 hours'
    `;
    if ((recent[0]?.n ?? 0) > 0) return;
  }
  await sql`
    insert into government_audit (id, user_id, action, province)
    values (${id}, ${input.userId}, ${input.action}, ${input.province ?? null})
  `;
}

export async function actorFromApiKey(rawKey: string): Promise<GovActor | null> {
  const key = rawKey.trim();
  if (key.length < 16) return null;
  const hash = hashGovSecret(key);
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    select user_id
    from government_api_keys
    where key_hash = ${hash}
      and revoked_at is null
    limit 1
  `;
  const userId = rows[0]?.user_id;
  if (!userId) return null;
  const actor = await loadGovActor(userId);
  if (!actor) return null;
  await sql`
    update government_api_keys
    set last_used_at = now()
    where key_hash = ${hash} and revoked_at is null
  `;
  return actor;
}

export async function mintGovApiKey(actor: GovActor): Promise<{ prefix: string; token: string }> {
  assertGovWritable(actor);
  const token = `kegov_${newGovToken()}`;
  const sql = await getSql();
  await sql`
    update government_api_keys
    set revoked_at = now()
    where user_id = ${actor.userId} and revoked_at is null
  `;
  const id = `gak_${randomBytes(8).toString("hex")}`;
  await sql`
    insert into government_api_keys (id, user_id, key_hash, key_prefix)
    values (${id}, ${actor.userId}, ${hashGovSecret(token)}, ${token.slice(0, 12)})
  `;
  await auditGov({ userId: actor.userId, action: "api_key_mint", province: actor.province });
  return { prefix: token.slice(0, 12), token };
}
