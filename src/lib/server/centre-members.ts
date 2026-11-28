import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  CENTRE_INVITE_DAILY_MAX,
  CENTRE_INVITE_HOURLY_MAX,
  CENTRE_INVITE_EMAIL_UNVERIFIED,
  CENTRE_INVITE_NOT_FOUND,
  CENTRE_INVITE_TTL_MS,
  decideAcceptInvite,
  invitesToClaim,
  decideResendInvite,
  decideRevokeEmployee,
  normalizeInviteEmail,
  type CentreInviteRole,
  type CentreMemberRole,
} from "@/lib/centre-roles";
import {
  decideCentreInvite,
  decidePermissionUpdate,
  grantsForMember,
  permissionChangeDetail,
  type StaffGrants,
  type StaffPreset,
} from "@/lib/staff-permissions";
import { getSql } from "@/lib/db";
import { lookupUser } from "@/lib/server/notify";
import { logSecurityEvent } from "@/lib/server/security-events";
import { loadCentreRole } from "@/lib/server/centre-access";
import { employeeInviteUrl, trySendEmployeeInviteEmail } from "@/lib/server/invite-mail";
import { nid } from "@/lib/utils";
import { dedupeCentreTeam } from "@/lib/centre-team";
import { centrePickerLabel } from "@/lib/centre-label";

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
  preset: StaffPreset | "read_only" | null;
  grants: StaffGrants;
};

export type CentreTeamPayload = {
  centres: Array<{ id: string; name: string; role: CentreMemberRole }>;
  people: CentreTeamRow[];
  canInvite: boolean;
  canEditPermissions: boolean;
};

async function rememberPreset(
  sql: Awaited<ReturnType<typeof getSql>>,
  daycareId: string,
  userId: string,
  preset: string | null,
) {
  if (!preset) return;
  await sql`
    update centre_members
    set permission_preset = ${preset}
    where daycare_id = ${daycareId} and user_id = ${userId} and role <> 'owner'
  `.catch(() => undefined);
}

async function invitePreset(
  sql: Awaited<ReturnType<typeof getSql>>,
  inviteId: string,
  role: string,
): Promise<string | null> {
  const rows = await sql<{ permission_preset: string | null }>`
    select permission_preset from centre_invites where id = ${inviteId} limit 1
  `.catch(() => []);
  const stored = rows[0]?.permission_preset;
  if (stored === "staff" || stored === "lead" || stored === "manager") return stored;
  if (role === "manager") return "manager";
  if (role === "staff") return "staff";
  return null;
}

function memberAccess(role: string, preset: string | null, permissions: unknown): Pick<CentreTeamRow, "preset" | "grants"> {
  const grants = grantsForMember({ role, preset, permissions });
  const stored = preset === "staff" || preset === "lead" || preset === "manager" || preset === "custom" ? preset : null;
  return { preset: role === "read_only" && !stored ? "read_only" : stored, grants };
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function makeInviteToken() {
  return randomBytes(32).toString("hex");
}

function roleLabel(role: string, preset?: string | null) {
  if (preset === "lead") return "Lead";
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
      // Only a manager sees the team list. Staff see their own centres, not colleagues (B05).
      const staffIds = staffCentres.filter((row) => row.role === "manager").map((row) => row.id);
      const members = staffIds.length
        ? await sql.query<{
            id: string;
            daycare_id: string;
            daycare_name: string;
            role: string;
            created_at: string;
            email: string | null;
            name: string | null;
          }>(
            `select m.id, m.daycare_id, d.name as daycare_name, m.role, m.created_at,
                    u.email, u.name
             from centre_members m
             join daycares d on d.id = m.daycare_id
             left join "user" u on u.id = m.user_id
             where m.daycare_id = any($1::text[]) and m.status = 'active'
             order by d.name, u.email`,
            [staffIds],
          ).catch(() => [])
        : [];
      return {
        centres: staffCentres.map((c) => ({
          id: c.id,
          name: centrePickerLabel(c.name, null, c.id),
          role: (c.role as CentreMemberRole) || "staff",
        })),
        people: members.map((m) => ({
          id: m.id,
          kind: "member" as const,
          daycareId: m.daycare_id,
          daycareName: m.daycare_name,
          email: (m.email || "").trim(),
          name: m.name,
          role: (m.role as CentreMemberRole) || "staff",
          status: "active" as const,
          createdAt: String(m.created_at),
          canRevoke: false,
          ...memberAccess(m.role, null, null),
        })),
        canInvite: staffCentres.some((row) => row.role === "manager"),
        canEditPermissions: false,
      };
    }

    type MemberListRow = {
      id: string;
      daycare_id: string;
      daycare_name: string;
      role: string;
      status: string;
      created_at: string;
      email: string | null;
      name: string | null;
      permission_preset?: string | null;
      permissions?: unknown;
    };
    const memberSql = `select m.id, m.daycare_id, d.name as daycare_name, m.role, m.status, m.created_at,
              u.email, coalesce(nullif(btrim(u.name), ''), m.invited_by) as name
       from centre_members m
       join daycares d on d.id = m.daycare_id
       left join "user" u on u.id = m.user_id
       where m.daycare_id = any($1::text[])
         and m.status = 'active'
       order by d.name, m.role, u.email`;
    const members =
      (await sql
        .query<MemberListRow>(
          memberSql.replace(
            "m.created_at,",
            "m.created_at, m.permission_preset, m.permissions,",
          ),
          [scoped],
        )
        .catch(() => null)) ??
      (await sql.query<MemberListRow>(memberSql, [scoped]).catch(() => []));

    const invites = await sql.query<{
      id: string;
      daycare_id: string;
      daycare_name: string;
      email: string;
      name: string | null;
      role: string;
      status: string;
      created_at: string;
      permission_preset?: string | null;
    }>(
      `select i.id, i.daycare_id, d.name as daycare_name, i.email, i.name, i.role, i.status, i.created_at,
              i.permission_preset
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
        ...memberAccess(m.role, m.permission_preset ?? null, m.permissions ?? null),
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
        ...memberAccess(i.role, i.permission_preset ?? null, null),
      })),
    ];

    return {
      centres: centres.map((c) => ({ id: c.id, name: centrePickerLabel(c.name, null, c.id), role: "owner" as const })),
      people: dedupeCentreTeam(people),
      canInvite,
      canEditPermissions: true,
    };
  });

export type CentreEmployeeInviteInput = { daycareId: string; email: string; name?: string; role?: string; preset?: string };

/**
 * The one staff-invite path. The desk form sends the invite email. The staff job
 * board passes `send: false`: the hired person sees the invite on their KidEase
 * page and accepts it there (listMyStaffInvites / acceptMyStaffInvite).
 */
export async function createCentreEmployeeInvite(
  actorUserId: string,
  data: CentreEmployeeInviteInput,
  options: { send: boolean } = { send: true },
) {
  const context = { userId: actorUserId };
  {
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
    const decision = decideCentreInvite({
      actorRole,
      actorEmail: actor.email || "",
      inviteEmail: email,
      preset: data.preset,
      role: data.role,
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
    const expiresAt = new Date(Date.now() + CENTRE_INVITE_TTL_MS).toISOString();
    const tokenHash = hashInviteToken(token);
    const inserted = await sql`
      insert into centre_invites (
        id, daycare_id, email, name, role, token_hash, status, invited_by, expires_at, permission_preset
      ) values (
        ${id},
        ${daycareId},
        ${email},
        ${name},
        ${decision.role},
        ${tokenHash},
        'pending',
        ${context.userId},
        ${expiresAt},
        ${decision.preset}
      )
    `.then(() => true).catch(() => false);
    if (!inserted) {
      await sql`
        insert into centre_invites (
          id, daycare_id, email, name, role, token_hash, status, invited_by, expires_at
        ) values (
          ${id},
          ${daycareId},
          ${email},
          ${name},
          ${decision.role},
          ${tokenHash},
          'pending',
          ${context.userId},
          ${expiresAt}
        )
      `;
    }
    await logSecurityEvent({
      kind: "employee_invite",
      actorUserId: context.userId,
      daycareId,
      detail: `invited ${email} as ${decision.role}`,
    });
    if (!options.send) {
      return {
        ok: true as const,
        inviteId: id,
        mailed: false,
        hourlyMax: CENTRE_INVITE_HOURLY_MAX,
        dailyMax: CENTRE_INVITE_DAILY_MAX,
      };
    }
    const payload = {
      to: email,
      centreName: centre[0].name,
      roleLabel: roleLabel(decision.role, decision.preset),
      url: employeeInviteUrl(token),
      invitedName: name,
    };
    const firstSend = await trySendEmployeeInviteEmail(payload);
    const mailed = firstSend.mailed || firstSend.suppressed
      ? firstSend.mailed
      : (await trySendEmployeeInviteEmail(payload)).mailed;
    return {
      ok: true as const,
      inviteId: id,
      mailed,
      hourlyMax: CENTRE_INVITE_HOURLY_MAX,
      dailyMax: CENTRE_INVITE_DAILY_MAX,
    };
  }
}

export const inviteCentreEmployee = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: CentreEmployeeInviteInput) => input)
  .handler(async ({ context, data }) => createCentreEmployeeInvite(context.userId, data, { send: true }));

export const resendCentreInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input?.id || "").trim() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if (!data.id) throw new Error(CENTRE_INVITE_NOT_FOUND);
    const invite = await sql<{
      id: string;
      daycare_id: string;
      email: string;
      name: string | null;
      role: string;
      status: string;
      created_at: string | Date;
    }>`
      select id, daycare_id, email, name, role, status, created_at
      from centre_invites
      where id = ${data.id} and status = 'pending' and expires_at > now()
      limit 1
    `.catch(() => []);
    const row = invite[0];
    if (!row) throw new Error(CENTRE_INVITE_NOT_FOUND);
    const actorRole = await loadCentreRole(sql, context.userId, row.daycare_id);
    const hourlyInvites = await sql<{ n: number }>`
      select count(*)::int as n from centre_invites
      where daycare_id = ${row.daycare_id} and created_at > now() - interval '1 hour'
    `.catch(() => [{ n: 0 }]);
    const hourlyResends = await sql<{ n: number }>`
      select count(*)::int as n from security_events
      where kind = 'employee_invite' and daycare_id = ${row.daycare_id}
        and detail like 'resent %' and at > now() - interval '1 hour'
    `.catch(() => [{ n: 0 }]);
    const dailyInvites = await sql<{ n: number }>`
      select count(*)::int as n from centre_invites
      where invited_by = ${context.userId} and created_at > now() - interval '24 hours'
    `.catch(() => [{ n: 0 }]);
    const dailyResends = await sql<{ n: number }>`
      select count(*)::int as n from security_events
      where kind = 'employee_invite' and actor_user_id = ${context.userId}
        and detail like 'resent %' and at > now() - interval '24 hours'
    `.catch(() => [{ n: 0 }]);
    const last = await sql<{ at: string | Date }>`
      select at from security_events
      where kind = 'employee_invite' and detail = ${`resent ${row.id}`}
      order by at desc
      limit 1
    `.catch(() => []);
    const createdAtMs = new Date(row.created_at).getTime();
    const lastResentAtMs = last[0] ? new Date(last[0].at).getTime() : null;
    const decision = decideResendInvite({
      actorRole,
      inviteStatus: row.status,
      createdAtMs,
      lastResentAtMs: Number.isFinite(lastResentAtMs) ? lastResentAtMs : null,
      hourlyCount: (hourlyInvites[0]?.n ?? 0) + (hourlyResends[0]?.n ?? 0),
      dailyCount: (dailyInvites[0]?.n ?? 0) + (dailyResends[0]?.n ?? 0),
    });
    if (!decision.ok) throw new Error(decision.error);
    const centre = await sql<{ name: string }>`select name from daycares where id = ${row.daycare_id} limit 1`;
    if (!centre[0]) throw new Error("Centre not found");
    const token = makeInviteToken();
    const payload = {
      to: row.email,
      centreName: centre[0].name,
      roleLabel: roleLabel(row.role),
      url: employeeInviteUrl(token),
      invitedName: row.name,
    };
    const sent = await trySendEmployeeInviteEmail(payload);
    if (!sent.mailed && !sent.suppressed) throw new Error("Could not resend that invite.");
    if (sent.mailed) {
      await sql`
        update centre_invites
        set token_hash = ${hashInviteToken(token)},
            expires_at = ${new Date(Date.now() + CENTRE_INVITE_TTL_MS).toISOString()}
        where id = ${row.id} and status = 'pending'
      `;
    }
    await logSecurityEvent({
      kind: "employee_invite",
      actorUserId: context.userId,
      daycareId: row.daycare_id,
      detail: `resent ${row.id}`,
    });
    return { ok: true as const, mailed: sent.mailed };
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

/**
 * The login's mailbox, only when that user row has confirmed it. An email match is
 * only proof of the mailbox once Better Auth has set emailVerified, since email
 * sign-up issues a session before the address is confirmed.
 */
async function verifiedInviteEmail(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
): Promise<string | null> {
  const rows = await sql<{ email: string | null; emailVerified: boolean | null }>`
    select email, "emailVerified" from "user" where id = ${userId} limit 1
  `.catch(() => []);
  const row = rows[0];
  if (!row || row.emailVerified !== true) return null;
  const email = normalizeInviteEmail(row.email);
  return email.includes("@") ? email : null;
}

/**
 * Attach a live staff invite for this mailbox when the person presses Accept.
 * Leaves the login and any account-closure date alone, and does not grant owner.
 * Email match only counts once the account has proven it owns that mailbox
 * (emailVerified); otherwise the emailed invite link is the only way in.
 */
export async function claimPendingCentreInvitesForUser(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  email: string,
  inviteId?: string,
): Promise<{ claimed: number }> {
  const normalized = await verifiedInviteEmail(sql, userId);
  if (!normalized || normalized !== normalizeInviteEmail(email)) return { claimed: 0 };
  const rows = await sql<{
    id: string;
    daycare_id: string;
    email: string;
    role: string;
    status: string;
    expires_at: string | Date;
    invited_by: string | null;
  }>`
    select i.id, i.daycare_id, i.email, i.role, i.status, i.expires_at, i.invited_by
    from centre_invites i
    join "user" u
      on u.id = ${userId}
      and u."emailVerified" = true
      and lower(u.email) = lower(i.email)
    where lower(i.email) = ${normalized}
      and i.status = 'pending'
      and i.expires_at > now()
  `.catch(() => []);
  const now = Date.now();
  const wanted = (inviteId || "").trim();
  const chosen = invitesToClaim({
    email: normalized,
    nowMs: now,
    invites: rows.map((row) => ({
      id: row.id,
      daycareId: row.daycare_id,
      email: row.email,
      role: row.role,
      status: row.status,
      expiresAtMs: new Date(row.expires_at).getTime(),
    })),
  }).filter((row) => !wanted || row.id === wanted);
  let claimed = 0;
  for (const candidate of chosen) {
    // Mark the invite taken in one statement that rechecks the verified mailbox,
    // then grant only what that statement returned.
    const taken = await sql<{ id: string; daycare_id: string; role: string; invited_by: string | null }>`
      update centre_invites
      set status = 'accepted', accepted_at = now(), accepted_user_id = ${userId}
      where id = ${candidate.id}
        and status = 'pending'
        and expires_at > now()
        and role = ${candidate.role}
        and lower(email) = ${normalized}
        and exists (
          select 1 from "user" u
          where u.id = ${userId}
            and u."emailVerified" = true
            and lower(u.email) = lower(centre_invites.email)
        )
      returning id, daycare_id, role, invited_by
    `.catch(() => []);
    const source = taken[0];
    if (!source) continue;
    const invite = { id: source.id, daycareId: source.daycare_id, role: candidate.role };
    const existing = await sql<{ id: string; status: string; role: string }>`
      select id, status, role from centre_members
      where daycare_id = ${invite.daycareId} and user_id = ${userId}
      limit 1
    `.catch(() => []);
    if (!existing[0]) {
      await sql`
        insert into centre_members (id, daycare_id, user_id, role, status, invited_by)
        values (
          ${nid("cm")},
          ${invite.daycareId},
          ${userId},
          ${invite.role},
          'active',
          ${source.invited_by || userId}
        )
      `;
    } else if (existing[0].status !== "active") {
      await sql`
        update centre_members
        set role = ${invite.role}, status = 'active', revoked_at = null, revoked_by = null
        where id = ${existing[0].id}
      `;
      await rememberPreset(sql, invite.daycareId, userId, await invitePreset(sql, invite.id, invite.role));
    }
    if (!existing[0]) {
      await rememberPreset(sql, invite.daycareId, userId, await invitePreset(sql, invite.id, invite.role));
    }
    await logSecurityEvent({
      kind: "employee_accept",
      actorUserId: userId,
      daycareId: invite.daycareId,
      detail: `accepted ${invite.role} from email match`,
    });
    claimed += 1;
  }
  return { claimed };
}

export const listMyStaffInvites = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { readViewAsPublic } = await import("@/lib/view-as-public");
    if (readViewAsPublic()) return { invites: [] as Array<{ id: string; centre: string; role: string }> };
    const sql = await getSql();
    const email = await verifiedInviteEmail(sql, context.userId);
    if (!email) return { invites: [] as Array<{ id: string; centre: string; role: string }> };
    const rows = await sql<{ id: string; role: string; centre: string }>`
      select i.id, i.role, d.name as centre
      from centre_invites i
      join daycares d on d.id = i.daycare_id
      join "user" u
        on u.id = ${context.userId}
        and u."emailVerified" = true
        and lower(u.email) = lower(i.email)
      where lower(i.email) = ${email}
        and i.status = 'pending'
        and i.expires_at > now()
      order by i.created_at asc
    `.catch(() => []);
    const now = Date.now();
    const allowed = new Set(
      invitesToClaim({
        email,
        nowMs: now,
        invites: rows.map((row) => ({
          id: row.id,
          daycareId: "",
          email,
          role: row.role,
          status: "pending",
          expiresAtMs: now + 60_000,
        })),
      }).map((row) => row.id),
    );
    return {
      invites: rows
        .filter((row) => allowed.has(row.id))
        .map((row) => ({ id: row.id, centre: row.centre, role: row.role })),
    };
  });

export const acceptMyStaffInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string }) => ({ id: String(input?.id || "").trim() }))
  .handler(async ({ context, data }) => {
    const { readViewAsPublic } = await import("@/lib/view-as-public");
    if (readViewAsPublic()) throw new Error(CENTRE_INVITE_NOT_FOUND);
    if (!data.id) throw new Error(CENTRE_INVITE_NOT_FOUND);
    const actor = await lookupUser(context.userId);
    const sql = await getSql();
    const result = await claimPendingCentreInvitesForUser(sql, context.userId, actor.email || "", data.id);
    if (result.claimed !== 1) throw new Error(CENTRE_INVITE_NOT_FOUND);
    return { ok: true as const };
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
    if (!actor.emailVerified) throw new Error(CENTRE_INVITE_EMAIL_UNVERIFIED);

    // Take the invite in one conditional statement that rechecks the token,
    // pending status, expiry, and this user's verified matching mailbox.
    // Membership is granted only from the row this statement returns, so a
    // double or concurrent accept, a revoke, or an expiry grants nothing.
    const taken = await sql<{ id: string; daycare_id: string; role: string; name: string | null }>`
      update centre_invites
      set status = 'accepted', accepted_at = now(), accepted_user_id = ${context.userId}
      where id = ${invite.id}
        and token_hash = ${hash}
        and status = 'pending'
        and expires_at > now()
        and exists (
          select 1 from "user" u
          where u.id = ${context.userId}
            and u."emailVerified" = true
            and lower(u.email) = lower(centre_invites.email)
        )
      returning id, daycare_id, role, name
    `.catch(() => []);
    const source = taken[0];
    if (!source) throw new Error(CENTRE_INVITE_NOT_FOUND);
    const accepted = { id: source.id, daycare_id: source.daycare_id, role: source.role, name: source.name };

    const existing = await sql<{ id: string }>`
      select id from centre_members
      where daycare_id = ${accepted.daycare_id} and user_id = ${context.userId}
      limit 1
    `.catch(() => []);
    if (existing[0]) {
      await sql`
        update centre_members
        set role = ${accepted.role}, status = 'active', revoked_at = null, revoked_by = null,
            invited_by = coalesce(invited_by, ${context.userId})
        where id = ${existing[0].id}
      `;
    } else {
      await sql`
        insert into centre_members (id, daycare_id, user_id, role, status, invited_by)
        values (${nid("cm")}, ${accepted.daycare_id}, ${context.userId}, ${accepted.role}, 'active', ${context.userId})
      `;
    }
    await rememberPreset(sql, accepted.daycare_id, context.userId, await invitePreset(sql, accepted.id, accepted.role));
    await logSecurityEvent({
      kind: "employee_accept",
      actorUserId: context.userId,
      daycareId: accepted.daycare_id,
      detail: `accepted ${accepted.role}`,
    });
    if (accepted.name) {
      await sql`
        update "user" set name = ${accepted.name}
        where id = ${context.userId} and (name is null or btrim(name) = '')
      `.catch(() => undefined);
    }
    return { ok: true as const, daycareId: accepted.daycare_id };
  });

export const updateCentreStaffPermissions = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { memberId?: string; preset?: string; grants?: StaffGrants }) => ({
    memberId: String(input?.memberId || "").trim(),
    preset: String(input?.preset || "").trim(),
    grants: input?.grants,
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if (!data.memberId) throw new Error("Employee not found");
    const rows = await sql<{
      id: string;
      daycare_id: string;
      user_id: string;
      role: string;
      permission_preset: string | null;
      permissions: unknown;
    }>`
      select id, daycare_id, user_id, role, permission_preset, permissions
      from centre_members
      where id = ${data.memberId} and status = 'active'
      limit 1
    `.catch(() => []);
    const row = rows[0];
    if (!row) throw new Error("Employee not found");
    const actorRole = await loadCentreRole(sql, context.userId, row.daycare_id);
    const decision = decidePermissionUpdate({
      actorIsOwner: actorRole === "owner",
      targetRole: row.role,
      preset: data.preset,
      grants: data.grants,
    });
    if (!decision.ok) throw new Error(decision.error);
    const before = grantsForMember({ role: row.role, preset: row.permission_preset, permissions: row.permissions });
    const detail = permissionChangeDetail({
      presetFrom: row.permission_preset || row.role || "staff",
      presetTo: decision.preset,
      before,
      after: decision.grants,
    });
    if (!detail) return { ok: true as const, unchanged: true as const };
    await sql`
      update centre_members
      set role = ${decision.role},
          permission_preset = ${decision.preset},
          permissions = ${decision.preset === "custom" ? JSON.stringify(decision.grants) : null}::jsonb
      where id = ${row.id} and role <> 'owner' and status = 'active'
    `;
    await logSecurityEvent({
      kind: "employee_permissions",
      actorUserId: context.userId,
      targetUserId: row.user_id,
      daycareId: row.daycare_id,
      detail,
    });
    return { ok: true as const };
  });
