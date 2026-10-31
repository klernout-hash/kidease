import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireAdmin } from "@/lib/server/roles";
import { isProtectedOperatorEmail } from "@/lib/access-control";
import { isProvinceCode, PROVINCES } from "@/lib/gov/places";
import { auditGov, hashGovSecret, newGovToken } from "@/lib/server/gov-actor.server";

const STAFF = new Set(["admin", "support", "support_lead", "provider"]);

function cleanEmail(value: string): string {
  return value.trim().toLowerCase().slice(0, 180);
}

function passwordOk(value: string): boolean {
  return value.trim().length >= 12 && value.trim().length <= 200;
}

export type GovMemberRow = {
  userId: string;
  email: string;
  orgName: string;
  province: string;
  status: string;
  demo: boolean;
  readOnly: boolean;
};

export const listGovMembers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      user_id: string;
      email: string;
      org_name: string;
      province: string;
      status: string;
      demo: number;
      read_only: number;
    }>`
      select m.user_id, u.email, o.name as org_name, o.province, m.status, o.demo, m.read_only
      from government_members m
      join government_orgs o on o.id = m.org_id
      join "user" u on u.id = m.user_id
      order by o.name, u.email
    `;
    const invites = await sql<{ id: string; email: string; org_name: string; province: string; expires_at: string }>`
      select id, email, org_name, province, expires_at
      from government_invites
      where accepted_at is null and revoked_at is null and expires_at > now()
      order by created_at desc
      limit 50
    `;
    return {
      members: rows.map((row) => ({
        userId: row.user_id,
        email: row.email,
        orgName: row.org_name,
        province: row.province,
        status: row.status,
        demo: Number(row.demo) === 1,
        readOnly: Number(row.read_only) === 1,
      })),
      invites: invites.map((row) => ({
        id: row.id,
        email: row.email,
        orgName: row.org_name,
        province: row.province,
        expiresAt: row.expires_at,
      })),
      provinces: PROVINCES.map((row) => ({ code: row.code, name: row.nameEn })),
    };
  });

export const inviteGovUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email?: string; orgName?: string; province?: string }) => ({
    email: cleanEmail(String(input?.email || "")),
    orgName: String(input?.orgName || "").trim().slice(0, 120),
    province: String(input?.province || "").trim().toUpperCase(),
  }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    if (!data.email.includes("@") || !data.orgName || !isProvinceCode(data.province)) {
      return { ok: false as const, error: "Enter a work email, an organization, and a province." };
    }
    if (isProtectedOperatorEmail(data.email)) {
      return { ok: false as const, error: "That mailbox cannot become a government account." };
    }
    const sql = await getSql();
    const users = await sql<{ id: string; role: string | null }>`
      select u.id, p.role
      from "user" u
      left join profiles p on p.user_id = u.id
      where lower(u.email) = ${data.email}
      limit 1
    `;
    const existing = users[0];
    if (existing) {
      const role = String(existing.role || "");
      if (STAFF.has(role)) {
        return { ok: false as const, error: "That account is already a daycare or staff account." };
      }
      const personal = await sql<{ n: number }>`
        select (
          (select count(*) from children c where c.user_id = ${existing.id})
          + (select count(*) from bookings b where b.user_id = ${existing.id})
          + (select count(*) from provider_daycares d where d.user_id = ${existing.id})
        )::int as n
      `;
      if ((personal[0]?.n ?? 0) > 0) {
        return { ok: false as const, error: "That account already has family or centre records. Use a new email." };
      }
      const demo = await sql<{ demo: number }>`
        select o.demo
        from government_members m
        join government_orgs o on o.id = m.org_id
        where m.user_id = ${existing.id}
        limit 1
      `;
      if (Number(demo[0]?.demo) === 1) {
        return { ok: false as const, error: "The demo account is managed by the seed script." };
      }
      const orgId = `gorg_${randomBytes(6).toString("hex")}`;
      await sql`
        insert into government_orgs (id, name, province, demo)
        values (${orgId}, ${data.orgName}, ${data.province}, 0)
      `;
      await sql`
        insert into profiles (user_id, role)
        values (${existing.id}, 'government')
        on conflict (user_id) do update set role = 'government'
      `;
      await sql`
        insert into government_members (user_id, org_id, status, read_only)
        values (${existing.id}, ${orgId}, 'active', 1)
        on conflict (user_id) do update
          set org_id = excluded.org_id, status = 'active', revoked_at = null, read_only = 1
      `;
      await auditGov({ userId: context.userId, action: "invite", province: data.province });
      return { ok: true as const, linked: true as const };
    }
    const token = newGovToken();
    const id = `ginv_${randomBytes(6).toString("hex")}`;
    await sql`
      insert into government_invites (id, email, org_name, province, token_hash, invited_by, expires_at)
      values (
        ${id},
        ${data.email},
        ${data.orgName},
        ${data.province},
        ${hashGovSecret(token)},
        ${context.userId},
        now() + interval '14 days'
      )
    `;
    await auditGov({ userId: context.userId, action: "invite", province: data.province });
    return { ok: true as const, linked: false as const, path: `/gov/login?invite=${token}` };
  });

export const revokeGovUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId?: string }) => ({ userId: String(input?.userId || "").trim().slice(0, 80) }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    if (!data.userId) return { ok: false as const, error: "Missing account." };
    const sql = await getSql();
    await sql`
      update government_members
      set status = 'revoked', revoked_at = now()
      where user_id = ${data.userId}
    `;
    await sql`
      update government_api_keys
      set revoked_at = now()
      where user_id = ${data.userId} and revoked_at is null
    `;
    await auditGov({ userId: context.userId, action: "revoke", province: null });
    return { ok: true as const };
  });

export const revokeGovInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string }) => ({ id: String(input?.id || "").trim().slice(0, 80) }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await sql`
      update government_invites set revoked_at = now()
      where id = ${data.id} and accepted_at is null
    `;
    return { ok: true as const };
  });

export async function acceptGovInvite(input: { token: string; password: string; name: string }): Promise<
  { ok: true; email: string } | { ok: false; error: string }
> {
  const token = input.token.trim();
  const password = input.password;
  const name = input.name.trim().slice(0, 80);
  if (!token || !passwordOk(password)) {
    return { ok: false, error: "Use at least 12 characters." };
  }
  const sql = await getSql();
  const hash = hashGovSecret(token);
  const rows = await sql<{ id: string; email: string; org_name: string; province: string }>`
    select id, email, org_name, province
    from government_invites
    where token_hash = ${hash}
      and accepted_at is null
      and revoked_at is null
      and expires_at > now()
    limit 1
  `;
  const invite = rows[0];
  if (!invite || !isProvinceCode(invite.province)) return { ok: false, error: "This invite is no longer valid." };
  const passwordHash = await hashPassword(password);
  const userId = `gov_${randomBytes(8).toString("hex")}`;
  const accountId = `gac_${randomBytes(8).toString("hex")}`;
  await sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values (${userId}, ${name || invite.org_name}, ${invite.email}, true, now(), now())
  `;
  await sql`
    insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    values (${accountId}, ${userId}, 'credential', ${userId}, ${passwordHash}, now(), now())
  `;
  await sql`
    insert into profiles (user_id, role) values (${userId}, 'government')
  `;
  const orgId = `gorg_${randomBytes(6).toString("hex")}`;
  await sql`
    insert into government_orgs (id, name, province, demo) values (${orgId}, ${invite.org_name}, ${invite.province}, 0)
  `;
  await sql`
    insert into government_members (user_id, org_id, status, read_only)
    values (${userId}, ${orgId}, 'active', 1)
  `;
  await sql`update government_invites set accepted_at = now() where id = ${invite.id}`;
  await auditGov({ userId, action: "login", province: invite.province });
  return { ok: true, email: invite.email };
}

export const acceptGovInviteFn = createServerFn({ method: "POST" })
  .validator((input: { token?: string; password?: string; name?: string }) => ({
    token: String(input?.token || "").trim().slice(0, 200),
    password: String(input?.password || ""),
    name: String(input?.name || "").trim().slice(0, 80),
  }))
  .handler(async ({ data }) => acceptGovInvite(data));
