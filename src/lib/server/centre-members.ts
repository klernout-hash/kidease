import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  CENTRE_INVITE_DAILY_MAX,
  CENTRE_INVITE_HOURLY_MAX,
  CENTRE_INVITE_NOT_FOUND,
  CENTRE_INVITE_TTL_MS,
  decideAcceptInvite,
  decideInviteEmployee,
  decideRevokeEmployee,
  normalizeInviteEmail,
  parseCentreInviteRole,
  type CentreInviteRole,
  type CentreMemberRole,
} from "@/lib/centre-roles";
import { getSql } from "@/lib/db";
import { lookupUser } from "@/lib/server/notify";
import { logSecurityEvent } from "@/lib/server/security-events";
import { loadCentreRole } from "@/lib/server/centre-access";
import { employeeInviteUrl, sendEmployeeInviteEmail } from "@/lib/server/invite-mail";
import { nid } from "@/lib/utils";

export type CentreTeamRow = {
  id: string;
  kind: "member" | "invite";
  daycareId: string;
  daycareName: string;
  email: string;
  name: string | null;
  role: CentreMemberRole | CentreInviteRole;
  status: "active" | "pending" | "revoked";
  createdAt: string;
  canRevoke: boolean;
};

export type CentreTeamPayload = {
  centres: Array<{ id: string; name: string; role: CentreMemberRole }>;
  people: CentreTeamRow[];
  canInvite: boolean;
};

function hashInviteToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function makeInviteToken() {
  return randomBytes(32).toString("hex");
}

function roleLabel(role: string) {
  if (role === "owner") return "Owner";
  if (role === "manager") return "Manager";
  if (role === "read_only") return "Read-only";
  return "Staff";
}

async function ownedCentres(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string; name: string }>`
    select d.id, d.name
    from daycares d
    join provider_daycares p on p.daycare_id = d.id
    where p.user_id = ${userId}
    order by d.name
  `.catch(() => []);
  return rows;
}

export const listCentreTeam = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CentreTeamPayload> => {
    const sql = await getSql();
    const centres = await ownedCentres(context.userId);
    const canInvite = centres.length > 0;
    const scoped = centres.map((c) => c.id);
    if (!scoped.length) {
      const staffCentres = await sql<{ id: string; name: string; role: string }>`
        select d.id, d.name, m.role
        from centre_members m
        join daycares d on d.id = m.daycare_id
        where m.user_id = ${context.userId} and m.status = 'active'
        order by d.name
      `.catch(() => []);
      return {
        centres: staffCentres.map((c) => ({
          id: c.id,
          name: c.name,
          role: (c.role as CentreMemberRole) || "staff",
        })),
        people: [],
        canInvite: false,
      };
    }

    const members = await sql.query<{
      id: string;
      daycare_id: string;
      daycare_name: string;
      role: string;
      status: string;
      created_at: string;
      email: string | null;
      name: string | null;
    }>(
      `select m.id, m.daycare_id, d.name as daycare_name, m.role, m.status, m.created_at,
              u.email, coalesce(nullif(btrim(u.name), ''), m.invited_by) as name
       from centre_members m
       join daycares d on d.id = m.daycare_id
       left join "user" u on u.id = m.user_id
       where m.daycare_id = any($1::text[])
         and m.status = 'active'
       order by d.name, m.role, u.email`,
      [scoped],
    ).catch(() => []);

    const invites = await sql.query<{
      id: string;
      daycare_id: string;
      daycare_name: string;
      email: string;
      name: string | null;
      role: string;
      status: string;
      created_at: string;
    }>(
      `select i.id, i.daycare_id, d.name as daycare_name, i.email, i.name, i.role, i.status, i.created_at
       from centre_invites i
       join daycares d on d.id = i.daycare_id
       where i.daycare_id = any($1::text[])
         and i.status = 'pending'
         and i.expires_at > now()
       order by i.created_at desc`,
      [scoped],
    ).catch(() => []);

    const people: CentreTeamRow[] = [
      ...members.map((m) => ({
        id: m.id,
        kind: "member" as const,
        daycareId: m.daycare_id,
        daycareName: m.daycare_name,
        email: (m.email || "").trim(),
        name: m.name,
        role: (m.role as CentreMemberRole) || "staff",
        status: "active" as const,
        createdAt: String(m.created_at),
        canRevoke: canInvite && m.role !== "owner",
      })),
      ...invites.map((i) => ({
        id: i.id,
        kind: "invite" as const,
        daycareId: i.daycare_id,
        daycareName: i.daycare_name,
        email: i.email,
        name: i.name,
        role: (i.role as CentreInviteRole) || "staff",
        status: "pending" as const,
        createdAt: String(i.created_at),
        canRevoke: canInvite,
      })),
    ];

    return {
      centres: centres.map((c) => ({ id: c.id, name: c.name, role: "owner" as const })),
      people,
      canInvite,
    };
  });

export const inviteCentreEmployee = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { daycareId: string; email: string; name?: string; role?: string }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const daycareId = (data.daycareId || "").trim();
    const email = normalizeInviteEmail(data.email);
    const name = (data.name || "").trim().slice(0, 80) || null;
    const actor = await lookupUser(context.userId);
    const actorRole = await loadCentreRole(sql, context.userId, daycareId);
    const hourly = await sql<{ n: number }>`
      select count(*)::int as n from centre_invites
      where daycare_id = ${daycareId}
        and created_at > now() - interval '1 hour'
    `.catch(() => [{ n: 0 }]);
    const daily = await sql<{ n: number }>`
      select count(*)::int as n from centre_invites
      where invited_by = ${context.userId}
        and created_at > now() - interval '24 hours'
    `.catch(() => [{ n: 0 }]);
    const existingMember = await sql<{ n: number }>`
      select count(*)::int as n
      from centre_members m
      left join "user" u on u.id = m.user_id
      where m.daycare_id = ${daycareId}
        and m.status = 'active'
        and lower(u.email) = ${email}
    `.catch(() => [{ n: 0 }]);
    const pending = await sql<{ n: number }>`
      select count(*)::int as n from centre_invites
      where daycare_id = ${daycareId}
        and email = ${email}
        and status = 'pending'
        and expires_at > now()
    `.catch(() => [{ n: 0 }]);
    const decision = decideInviteEmployee({
      actorRole,
      actorEmail: actor.email || "",
      inviteEmail: email,
      inviteRole: parseCentreInviteRole(data.role),
      alreadyMember: (existingMember[0]?.n ?? 0) > 0,
      pendingInvite: (pending[0]?.n ?? 0) > 0,
      hourlyCount: hourly[0]?.n ?? 0,
      dailyCount: daily[0]?.n ?? 0,
    });
    if (!decision.ok) throw new Error(decision.error);

    const centre = await sql<{ name: string }>`
      select name from daycares where id = ${daycareId} limit 1
    `;
    if (!centre[0]) throw new Error("Centre not found");

    const token = makeInviteToken();
    const id = nid("inv");
    await sql`
      insert into centre_invites (
        id, daycare_id, email, name, role, token_hash, status, invited_by, expires_at
      ) values (
        ${id},
        ${daycareId},
        ${email},
        ${name},
        ${decision.role},
        ${hashInviteToken(token)},
        'pending',
        ${context.userId},
        ${new Date(Date.now() + CENTRE_INVITE_TTL_MS).toISOString()}
      )
    `;
    await logSecurityEvent({
      kind: "employee_invite",
      actorUserId: context.userId,
      daycareId,
      detail: `invited ${email} as ${decision.role}`,
    });
    const mail = await sendEmployeeInviteEmail({
      to: email,
      centreName: centre[0].name,
      roleLabel: roleLabel(decision.role),
      url: employeeInviteUrl(token),
      invitedName: name,
    });
    return {
      ok: true as const,
      inviteId: id,
      mailed: mail.status === "sent",
      hourlyMax: CENTRE_INVITE_HOURLY_MAX,
      dailyMax: CENTRE_INVITE_DAILY_MAX,
    };
  });

export const revokeCentreEmployee = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; kind: "member" | "invite" }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = (data.id || "").trim();
    if (!id) throw new Error(CENTRE_INVITE_NOT_FOUND);

    if (data.kind === "invite") {
      const row = await sql<{ daycare_id: string; email: string }>`
        select daycare_id, email from centre_invites
        where id = ${id} and status = 'pending'
        limit 1
      `.catch(() => []);
      if (!row[0]) throw new Error(CENTRE_INVITE_NOT_FOUND);
      const actorRole = await loadCentreRole(sql, context.userId, row[0].daycare_id);
      const decision = decideRevokeEmployee({
        actorRole,
        targetRole: null,
        targetKind: "invite",
      });
      if (!decision.ok) throw new Error(decision.error);
      await sql`
        update centre_invites set status = 'revoked'
        where id = ${id} and status = 'pending'
      `;
      await logSecurityEvent({
        kind: "employee_revoke",
        actorUserId: context.userId,
        daycareId: row[0].daycare_id,
        detail: `revoked invite ${row[0].email}`,
      });
      return { ok: true as const };
    }

    const row = await sql<{ daycare_id: string; user_id: string; role: string }>`
      select daycare_id, user_id, role from centre_members
      where id = ${id} and status = 'active'
      limit 1
    `.catch(() => []);
    if (!row[0]) throw new Error(CENTRE_INVITE_NOT_FOUND);
    const actorRole = await loadCentreRole(sql, context.userId, row[0].daycare_id);
    const decision = decideRevokeEmployee({
      actorRole,
      targetRole: row[0].role as CentreMemberRole,
      targetKind: "member",
    });
    if (!decision.ok) throw new Error(decision.error);
    await sql`
      update centre_members
      set status = 'revoked', revoked_at = now(), revoked_by = ${context.userId}
      where id = ${id} and status = 'active' and role <> 'owner'
    `;
    await logSecurityEvent({
      kind: "employee_revoke",
      actorUserId: context.userId,
      targetUserId: row[0].user_id,
      daycareId: row[0].daycare_id,
      detail: `revoked ${row[0].role}`,
    });
    return { ok: true as const };
  });

export const peekCentreInvite = createServerFn({ method: "GET" })
  .validator((token: string) => token)
  .handler(async ({ data: token }) => {
    const sql = await getSql();
    const hash = hashInviteToken((token || "").trim());
    const rows = await sql<{
      email: string;
      name: string | null;
      role: string;
      status: string;
      expires_at: string;
      daycare_name: string;
    }>`
      select i.email, i.name, i.role, i.status, i.expires_at, d.name as daycare_name
      from centre_invites i
      join daycares d on d.id = i.daycare_id
      where i.token_hash = ${hash}
      limit 1
    `.catch(() => []);
    const row = rows[0];
    if (!row) return { ok: false as const, error: CENTRE_INVITE_NOT_FOUND };
    const expiresAtMs = new Date(row.expires_at).getTime();
    if (row.status !== "pending" || expiresAtMs < Date.now()) {
      return { ok: false as const, error: CENTRE_INVITE_NOT_FOUND };
    }
    return {
      ok: true as const,
      email: row.email,
      name: row.name,
      role: row.role,
      daycareName: row.daycare_name,
    };
  });

export const acceptCentreInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((token: string) => token)
  .handler(async ({ context, data: token }) => {
    const sql = await getSql();
    const hash = hashInviteToken((token || "").trim());
    const rows = await sql<{
      id: string;
      daycare_id: string;
      email: string;
      name: string | null;
      role: string;
      status: string;
      expires_at: string;
    }>`
      select id, daycare_id, email, name, role, status, expires_at
      from centre_invites
      where token_hash = ${hash}
      limit 1
    `.catch(() => []);
    const invite = rows[0];
    if (!invite) throw new Error(CENTRE_INVITE_NOT_FOUND);
    const actor = await lookupUser(context.userId);
    const decision = decideAcceptInvite({
      inviteStatus: invite.status,
      inviteEmail: invite.email,
      sessionEmail: actor.email || "",
      expiresAtMs: new Date(invite.expires_at).getTime(),
    });
    if (!decision.ok) throw new Error(decision.error);

    const existing = await sql<{ id: string }>`
      select id from centre_members
      where daycare_id = ${invite.daycare_id} and user_id = ${context.userId}
      limit 1
    `.catch(() => []);
    if (existing[0]) {
      await sql`
        update centre_members
        set role = ${invite.role}, status = 'active', revoked_at = null, revoked_by = null,
            invited_by = coalesce(invited_by, ${context.userId})
        where id = ${existing[0].id}
      `;
    } else {
      await sql`
        insert into centre_members (id, daycare_id, user_id, role, status, invited_by)
        values (${nid("cm")}, ${invite.daycare_id}, ${context.userId}, ${invite.role}, 'active', ${context.userId})
      `;
    }
    await sql`
      update centre_invites
      set status = 'accepted', accepted_at = now(), accepted_user_id = ${context.userId}
      where id = ${invite.id}
    `;
    await logSecurityEvent({
      kind: "employee_accept",
      actorUserId: context.userId,
      daycareId: invite.daycare_id,
      detail: `accepted ${invite.role}`,
    });
    if (invite.name) {
      await sql`
        update "user" set name = ${invite.name}
        where id = ${context.userId} and (name is null or btrim(name) = '')
      `.catch(() => undefined);
    }
    return { ok: true as const, daycareId: invite.daycare_id };
  });
