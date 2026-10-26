import { randomBytes } from "node:crypto";
import { getVerifiedAuthSession } from "@/lib/auth/verify.server";
import { KIDEASE_OPERATOR_EMAIL } from "@/lib/admin-email";
import { getSql } from "@/lib/db";
import { parseAppRole } from "@/lib/desks";
import { logSecurityEvent } from "@/lib/server/security-events";
import { requireAdmin } from "@/lib/server/roles";
import {
  decideStartViewAs,
  exitViewAsSession,
  openViewAsSession,
  readViewAsSession,
  viewAsAuthFailureEndsSession,
  viewAsHome,
  type ViewAsAudit,
  type ViewAsDenyReason,
  type ViewAsSessionRow,
} from "@/lib/view-as";
import { readViewAsPublic, type ViewAsPublic, type ViewAsTarget, type ViewAsTargetKind } from "@/lib/view-as-public";
import {
  enterViewAsFrame,
  getViewAsFrame,
  isViewAsBypass,
  runWithoutViewAs,
  withViewAsWriteBypass,
  type ViewAsFrame,
} from "@/lib/server/view-as-frame.server";

export type { ViewAsTarget, ViewAsTargetKind };

function newId() {
  return randomBytes(16).toString("hex");
}

function ms(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function startError(reason: ViewAsDenyReason): Error {
  return new Error(`view_as:${reason}`);
}

async function writeAudits(events: ViewAsAudit[]) {
  for (const event of events) {
    await logSecurityEvent({
      kind: event.kind,
      actorUserId: event.actorUserId,
      targetUserId: event.targetUserId || null,
      detail: event.detail,
    });
  }
}

async function loadOpen(adminUserId: string): Promise<ViewAsSessionRow | null> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    admin_user_id: string;
    target_user_id: string;
    started_at: string | Date;
    expires_at: string | Date;
    ended_at: string | Date | null;
    end_reason: string | null;
  }>`
    select id, admin_user_id, target_user_id, started_at, expires_at, ended_at, end_reason
    from view_as_sessions
    where admin_user_id = ${adminUserId} and ended_at is null
    order by started_at desc
    limit 1
  `.catch(() => []);
  const row = rows[0];
  if (!row) return null;
  const reason = row.end_reason;
  return {
    id: row.id,
    adminUserId: row.admin_user_id,
    targetUserId: row.target_user_id,
    startedAtMs: ms(row.started_at),
    expiresAtMs: ms(row.expires_at),
    endedAtMs: row.ended_at ? ms(row.ended_at) : null,
    endReason:
      reason === "exit" || reason === "expired" || reason === "replaced" || reason === "denied" ? reason : null,
  };
}

type TargetRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
  ownsCentre: boolean;
};

async function loadTarget(userId: string): Promise<TargetRow | null> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    email: string | null;
    name: string | null;
    role: string | null;
    owns: boolean | number | null;
  }>`
    select
      u.id,
      u.email,
      coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(u.name), '')) as name,
      p.role,
      (
        exists (select 1 from provider_daycares d where d.user_id = u.id)
        or exists (
          select 1 from centre_members m
          where m.user_id = u.id and m.status = 'active'
        )
      ) as owns
    from "user" u
    left join profiles p on p.user_id = u.id
    where u.id = ${userId}
    limit 1
  `.catch(() => []);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    ownsCentre: row.owns === true || Number(row.owns) === 1,
  };
}

async function persistClose(row: ViewAsSessionRow) {
  const sql = await getSql();
  await sql`
    update view_as_sessions
    set ended_at = ${new Date(row.endedAtMs || Date.now()).toISOString()},
        end_reason = ${row.endReason}
    where id = ${row.id} and ended_at is null
  `;
}

async function persistOpen(row: ViewAsSessionRow) {
  const sql = await getSql();
  await sql`
    insert into view_as_sessions (
      id, admin_user_id, target_user_id, started_at, expires_at
    ) values (
      ${row.id},
      ${row.adminUserId},
      ${row.targetUserId},
      ${new Date(row.startedAtMs).toISOString()},
      ${new Date(row.expiresAtMs).toISOString()}
    )
  `;
}

async function adminStillOk(actorUserId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requireAdmin(actorUserId);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Not authorized";
    return { ok: false, message };
  }
}

async function actorFromCookie(): Promise<{ id: string; email: string | null }> {
  const session = await getVerifiedAuthSession();
  if (!session?.id) throw new Error("Not authorized");
  return { id: session.id, email: session.email };
}

/**
 * Re-check requireAdmin (kyle@kidease.ca, staff 2FA, trusted device, idle)
 * on the real session, then overlay the target for the rest of this request.
 * A failed admin check never overlays. Auth failures close the row.
 */
export async function effectiveSessionUser(session: {
  id: string;
  email: string | null;
}): Promise<{ id: string; email: string | null }> {
  if (isViewAsBypass()) return { id: session.id, email: session.email };
  const existing = getViewAsFrame();
  if (existing && existing.actorUserId === session.id) {
    return { id: existing.targetUserId, email: existing.targetEmail };
  }
  return runWithoutViewAs(() => applyOverlay(session));
}

async function applyOverlay(session: { id: string; email: string | null }) {
  const open = await loadOpen(session.id);
  if (!open) return { id: session.id, email: session.email };
  const gate = await adminStillOk(session.id);
  const now = Date.now();
  if (!gate.ok) {
    if (viewAsAuthFailureEndsSession(gate.message)) {
      await persistClose({ ...open, endedAtMs: now, endReason: "denied" });
      await writeAudits([
        {
          kind: "view_as_denied",
          actorUserId: session.id,
          targetUserId: open.targetUserId,
          atMs: now,
          detail: gate.message.slice(0, 80),
        },
      ]);
    }
    return { id: session.id, email: session.email };
  }
  const tick = readViewAsSession(open, now);
  if (tick.expired) {
    await persistClose(tick.expired);
    await writeAudits(tick.audits);
    return { id: session.id, email: session.email };
  }
  const target = await loadTarget(open.targetUserId);
  const decision = decideStartViewAs({
    actorIsAdmin: true,
    actorUserId: session.id,
    targetUserId: open.targetUserId,
    targetRole: target?.role,
    targetEmail: target?.email,
  });
  if (!decision.ok || !target) {
    await persistClose({ ...open, endedAtMs: now, endReason: "denied" });
    await writeAudits([
      {
        kind: "view_as_denied",
        actorUserId: session.id,
        targetUserId: open.targetUserId,
        atMs: now,
        detail: decision.ok ? "missing_target" : decision.reason,
      },
    ]);
    return { id: session.id, email: session.email };
  }
  const role = parseAppRole(target.role) === "provider" ? "provider" : "parent";
  const frame: ViewAsFrame = {
    sessionId: open.id,
    actorUserId: session.id,
    targetUserId: target.id,
    targetEmail: target.email,
    targetName: target.name,
    targetRole: role,
    expiresAtMs: open.expiresAtMs,
    writeBypass: false,
  };
  enterViewAsFrame(frame);
  return { id: target.id, email: target.email };
}

/** True when this request is inside a live view-as frame after a fresh admin check. */
export async function viewAsBlocksThisRequest(): Promise<boolean> {
  const session = await getVerifiedAuthSession();
  if (!session?.id) return false;
  await effectiveSessionUser(session);
  return getViewAsFrame()?.actorUserId === session.id;
}

export async function readViewAsState(): Promise<{ active: false } | ({ active: true } & ViewAsPublic)> {
  const view = readViewAsPublic();
  if (!view) return { active: false };
  return { active: true, ...view };
}

export async function searchViewAsPeople(query: string): Promise<ViewAsTarget[]> {
  const actor = await actorFromCookie();
    await withViewAsWriteBypass(() => requireAdmin(actor.id));
    if (getViewAsFrame()) return [];
    const stripped = query.replace(/[%_\\]/g, "");
    if (stripped.length < 2) return [];
    const needle = `%${stripped}%`;
    const sql = await getSql();
    const rows = await sql<{
      user_id: string;
      name: string | null;
      email: string | null;
      city: string | null;
      role: string;
      staff: boolean | number | null;
    }>`
      select
        u.id as user_id,
        coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(u.name), '')) as name,
        u.email,
        p.city,
        p.role,
        exists (
          select 1 from centre_members m
          where m.user_id = u.id and m.status = 'active'
        ) as staff
      from profiles p
      join "user" u on u.id = p.user_id
      where p.role in ('parent', 'provider')
        and u.id <> ${actor.id}
        and lower(u.email) <> ${KIDEASE_OPERATOR_EMAIL}
        and (
          u.email ilike ${needle}
          or coalesce(u.name, '') ilike ${needle}
          or coalesce(p.display_name, '') ilike ${needle}
        )
      order by u."createdAt" desc
      limit 20
    `.catch(() => []);
    return rows.map((row) => {
      const role = row.role === "provider" ? "provider" : "parent";
      const staff = row.staff === true || Number(row.staff) === 1;
      const kind: ViewAsTargetKind = role === "provider" ? "daycare" : staff ? "staff" : "parent";
      return {
        userId: row.user_id,
        name: row.name,
        email: row.email,
        city: row.city,
        role,
        kind,
      };
    });
}

export async function beginViewAs(targetUserId: string) {
  const actor = await actorFromCookie();
  if (getViewAsFrame()) throw startError("already");
  await requireAdmin(actor.id);
  const target = await loadTarget(targetUserId);
  const decision = decideStartViewAs({
    actorIsAdmin: true,
    actorUserId: actor.id,
    targetUserId,
    targetRole: target?.role,
    targetEmail: target?.email,
  });
  const now = Date.now();
  const existing = await loadOpen(actor.id);
  const opened = openViewAsSession({
    id: newId(),
    adminUserId: actor.id,
    targetUserId,
    nowMs: now,
    existing,
    decision,
  });
  if (opened.error || !opened.session || !target) {
    await writeAudits(opened.audits);
    throw startError(opened.error || "missing_target");
  }
  if (opened.closed) await persistClose(opened.closed);
  await persistOpen(opened.session);
  await writeAudits(opened.audits);
  const role = parseAppRole(target.role);
  return {
    ok: true as const,
    home: viewAsHome(role, target.ownsCentre),
    expiresAt: new Date(opened.session.expiresAtMs).toISOString(),
  };
}

export async function endViewAs() {
  const actor = await actorFromCookie();
    await withViewAsWriteBypass(async () => {
      await requireAdmin(actor.id);
      const open = await loadOpen(actor.id);
      const closed = exitViewAsSession(open, Date.now());
      if (closed.closed) await persistClose(closed.closed);
      await writeAudits(closed.audits);
    });
    return { ok: true as const, home: "/admin" as const };
}
