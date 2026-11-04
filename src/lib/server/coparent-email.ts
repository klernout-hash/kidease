import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { coparentEmailEnabled } from "@/lib/features";
import {
  canSeeCustodyRecord,
  coparentMailPlan,
  decideEmailAccept,
  emailsMatch,
  familyNotice,
  guardianNotifyIds,
  inviteCreatesPending,
  inviteExpiry,
  pairBlocked,
  type AuditAction,
  type FamilyNoticeKind,
} from "@/lib/coparent-custody";
import { invitePath, tokenOk, type CoparentLink } from "@/lib/coparent";
import { R2_FAMILY_PREFIX } from "@/lib/private-docs";
import { saveParentInAppNotice } from "@/lib/server/parent-notice";
import { nid } from "@/lib/utils";
import { escapeMailHtml, mailPreheaderHtml } from "@/lib/mail-copy";

function fail(code: string): never {
  throw new Error(`coparent:${code}`);
}

function emailOk(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200;
}

async function actorEmail(sql: Sql, userId: string) {
  const rows = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId} limit 1
  `.catch(() => []);
  return (rows[0]?.email || "").trim().toLowerCase();
}

async function localeFor(sql: Sql, userId: string) {
  const rows = await sql<{ locale: string | null }>`
    select locale from profiles where user_id = ${userId} limit 1
  `.catch(() => []);
  return rows[0]?.locale === "fr" ? "fr" : "en";
}

export async function writeCoparentAudit(
  sql: Sql,
  input: {
    actorId: string;
    action: AuditAction;
    linkId?: string | null;
    daycareId?: string | null;
    childId?: string | null;
    detail?: string;
  },
) {
  await sql`
    insert into coparent_audit (id, link_id, daycare_id, child_id, actor_user_id, action, detail)
    values (
      ${nid("ca")},
      ${input.linkId || null},
      ${input.daycareId || null},
      ${input.childId || null},
      ${input.actorId},
      ${input.action},
      ${(input.detail || "").slice(0, 180)}
    )
  `;
}

function appOrigin() {
  return (process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca").replace(/\/$/, "");
}

async function sendFamilyMail(to: string, locale: string, kind: FamilyNoticeKind, href: string) {
  const plan = coparentMailPlan({ enabled: coparentEmailEnabled(), env: process.env });
  if (plan !== "send") return plan;
  const notice = familyNotice(locale, kind);
  const url = href.startsWith("http") ? href : `${appOrigin()}${href}`;
  const text = `${notice.text}\n\n${url}\n`;
  const html = `<!doctype html><html><body style="font-family:Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
    ${mailPreheaderHtml(notice.text)}
    <p>${escapeMailHtml(notice.text)}</p>
    <p><a href="${escapeMailHtml(url)}">${escapeMailHtml(url)}</a></p>
  </body></html>`;
  const { sendTransactionalMail } = await import("@/lib/transactional-mail");
  await sendTransactionalMail({
    purpose: "coparent",
    to,
    subject: notice.subject,
    text,
    html,
  });
  return plan;
}

export async function notifyGuardians(
  sql: Sql,
  input: {
    ownerId: string;
    memberId?: string | null;
    kind: FamilyNoticeKind;
    href: string;
    sourceKey: string;
    inviteEmail?: string | null;
  },
) {
  const ids = guardianNotifyIds(input.ownerId, input.memberId);
  for (const userId of ids) {
    const locale = await localeFor(sql, userId);
    const notice = familyNotice(locale, input.kind);
    await saveParentInAppNotice(sql, {
      userId,
      kind: "inbox",
      titleKey: "notifFamily",
      href: input.href,
      sourceKey: `${input.sourceKey}:${userId}`,
      daycareName: notice.text,
      status: input.kind,
    });
    const email = await actorEmail(sql, userId);
    if (email) await sendFamilyMail(email, locale, input.kind, input.href).catch(() => undefined);
  }
  const extra = (input.inviteEmail || "").trim().toLowerCase();
  if (!extra) return;
  const already = await Promise.all(ids.map((id) => actorEmail(sql, id)));
  if (!already.includes(extra)) {
    await sendFamilyMail(extra, "en", input.kind, input.href).catch(() => undefined);
  }
}

type LinkRow = {
  id: string;
  owner_user_id: string;
  member_user_id: string | null;
  access: string;
  status: string;
  invite_token: string;
  invite_email: string | null;
  expires_at: string | null;
};

function mapInvite(row: LinkRow): CoparentLink & { inviteEmail: string | null; expiresAt: string | null } {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    memberUserId: row.member_user_id,
    access: row.access === "full" ? "full" : "view",
    status: row.status === "active" || row.status === "removed" ? row.status : "pending",
    inviteToken: row.invite_token,
    inviteEmail: row.invite_email,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
  };
}

export const inviteCoparentByEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email?: string; access?: string; deskPath?: string } | undefined) => ({
    email: String(input?.email || "").trim().toLowerCase(),
    access: input?.access === "full" ? "full" : "view",
    deskPath: input?.deskPath === "/fr/parent" ? ("/fr/parent" as const) : ("/parent" as const),
  }))
  .handler(async ({ context, data }) => {
    if (!coparentEmailEnabled()) fail("off");
    if (!emailOk(data.email)) fail("email_bad");
    const sql = await getSql();
    const mine = await actorEmail(sql, context.userId);
    if (emailsMatch(mine, data.email)) fail("self");
    const target = await sql<{ id: string }>`
      select id from "user" where lower(email) = ${data.email} limit 1
    `.catch(() => []);
    if (target[0]) {
      const blocks = await sql<{ blocker_user_id: string; blocked_user_id: string | null }>`
        select blocker_user_id, blocked_user_id from safety_blocks
        where (blocker_user_id = ${context.userId} and blocked_user_id = ${target[0].id})
           or (blocker_user_id = ${target[0].id} and blocked_user_id = ${context.userId})
      `.catch(() => []);
      if (
        pairBlocked(
          blocks.map((row) => ({
            blockerUserId: row.blocker_user_id,
            blockedUserId: row.blocked_user_id,
            daycareId: null,
          })),
          context.userId,
          target[0].id,
        )
      ) {
        fail("blocked");
      }
    }
    const open = await sql<LinkRow>`
      select id, owner_user_id, member_user_id, access, status, invite_token, invite_email, expires_at
      from coparent_links
      where status in ('pending', 'active')
        and (owner_user_id = ${context.userId} or member_user_id = ${context.userId})
    `.catch(() => []);
    if (open.some((row) => row.member_user_id === context.userId && row.status === "active")) fail("member");
    if (open.some((row) => row.owner_user_id === context.userId && row.status === "active")) fail("open");
    const token = randomBytes(18).toString("base64url");
    const expires = inviteExpiry();
    const pending = open.find((row) => row.owner_user_id === context.userId && row.status === "pending");
    let id = pending?.id || "";
    if (pending) {
      await sql`
        update coparent_links
        set access = ${data.access}, invite_email = ${data.email}, invite_token = ${token}, expires_at = ${expires}
        where id = ${pending.id}
      `;
    } else {
      id = nid("cp");
      await sql`
        insert into coparent_links (
          id, owner_user_id, member_user_id, access, status, invite_token, invite_email, expires_at
        ) values (
          ${id}, ${context.userId}, ${null}, ${data.access}, ${"pending"}, ${token}, ${data.email}, ${expires}
        )
      `;
    }
    if (!inviteCreatesPending({ status: "pending", memberUserId: null })) fail("closed");
    await writeCoparentAudit(sql, {
      actorId: context.userId,
      action: "invite",
      linkId: id,
      detail: data.email,
    });
    const path = invitePath(token, data.deskPath);
    const mailed = await sendFamilyMail(data.email, data.deskPath === "/fr/parent" ? "fr" : "en", "invite", path).catch(
      () => "skip_preview" as const,
    );
    return { ok: true as const, path, mailed: mailed === "send", mail: mailed === "send" ? "sent" : mailed };
  });

export async function guardCoparentAccept(sql: Sql, actorId: string, link: LinkRow | null, actorHasOpenFamily: boolean) {
  const mapped = link ? mapInvite(link) : null;
  let blocked = false;
  if (mapped) {
    const blocks = await sql<{ blocker_user_id: string; blocked_user_id: string | null }>`
      select blocker_user_id, blocked_user_id from safety_blocks
      where (blocker_user_id = ${actorId} and blocked_user_id = ${mapped.ownerUserId})
         or (blocker_user_id = ${mapped.ownerUserId} and blocked_user_id = ${actorId})
    `.catch(() => []);
    blocked = pairBlocked(
      blocks.map((row) => ({
        blockerUserId: row.blocker_user_id,
        blockedUserId: row.blocked_user_id,
        daycareId: null,
      })),
      actorId,
      mapped.ownerUserId,
    );
  }
  return decideEmailAccept({
    actorId,
    actorEmail: await actorEmail(sql, actorId),
    link: mapped,
    actorHasOpenFamily,
    pairBlocked: blocked,
  });
}

export async function afterCoparentAccepted(sql: Sql, link: { id: string; ownerUserId: string; memberUserId: string }) {
  await writeCoparentAudit(sql, {
    actorId: link.memberUserId,
    action: "accept",
    linkId: link.id,
  });
  await notifyGuardians(sql, {
    ownerId: link.ownerUserId,
    memberId: link.memberUserId,
    kind: "linked",
    href: "/parent?tab=family",
    sourceKey: `coparent:accept:${link.id}:${Date.now()}`,
  });
}

export async function afterCoparentRevoked(sql: Sql, link: { id: string; ownerUserId: string; memberUserId: string | null; inviteEmail: string | null }, actorId: string) {
  await writeCoparentAudit(sql, {
    actorId,
    action: "revoke",
    linkId: link.id,
  });
  await notifyGuardians(sql, {
    ownerId: link.ownerUserId,
    memberId: link.memberUserId,
    inviteEmail: link.inviteEmail,
    kind: "unlinked",
    href: "/parent?tab=family",
    sourceKey: `coparent:revoke:${link.id}:${Date.now()}`,
  });
}

export async function notifyPickupChange(sql: Sql, ownerId: string, actorId: string, childId: string) {
  if (!coparentEmailEnabled()) return;
  const links = await sql<{ member_user_id: string | null }>`
    select member_user_id from coparent_links
    where owner_user_id = ${ownerId} and status = 'active'
    limit 1
  `.catch(() => []);
  await writeCoparentAudit(sql, {
    actorId,
    action: "pickup_change",
    childId,
    detail: "pickups",
  });
  await notifyGuardians(sql, {
    ownerId,
    memberId: links[0]?.member_user_id,
    kind: "pickups",
    href: "/parent?tab=children",
    sourceKey: `coparent:pickup:${childId}:${Date.now()}`,
  });
}

async function centreIds(sql: Sql, userId: string) {
  const { listAccessibleDaycareIds } = await import("@/lib/server/centre-access");
  return listAccessibleDaycareIds(sql, userId);
}

async function assertCentreStaff(sql: Sql, userId: string, daycareId: string) {
  const { resolveAdminAccess } = await import("@/lib/server/roles");
  const admin = await resolveAdminAccess(userId)
    .then((row) => row.ok)
    .catch(() => false);
  const ids = admin ? [daycareId] : await centreIds(sql, userId);
  if (!canSeeCustodyRecord({ viewerIsAdmin: admin, viewerDaycareIds: ids, recordDaycareId: daycareId })) {
    fail("denied");
  }
  return admin;
}

export const verifyCoparent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { linkId?: string; daycareId?: string } | undefined) => ({
    linkId: String(input?.linkId || "").trim(),
    daycareId: String(input?.daycareId || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!coparentEmailEnabled()) fail("off");
    if (!data.linkId || !data.daycareId) fail("missing");
    const sql = await getSql();
    const admin = await assertCentreStaff(sql, context.userId, data.daycareId);
    const { canCentreWriteLeadsFor } = await import("@/lib/server/centre-access");
    if (!admin && !(await canCentreWriteLeadsFor(sql, context.userId, data.daycareId))) fail("denied");
    const links = await sql<{ id: string; status: string }>`
      select id, status from coparent_links where id = ${data.linkId} and status = 'active' limit 1
    `;
    if (!links[0]) fail("missing");
    await sql`
      insert into coparent_verifications (id, link_id, daycare_id, status, actor_user_id, verified_at)
      values (${nid("cvf")}, ${data.linkId}, ${data.daycareId}, ${"verified"}, ${context.userId}, now())
      on conflict (link_id, daycare_id) do update
      set status = 'verified', actor_user_id = ${context.userId}, verified_at = now()
    `;
    await writeCoparentAudit(sql, {
      actorId: context.userId,
      action: "verify",
      linkId: data.linkId,
      daycareId: data.daycareId,
    });
    return { ok: true as const };
  });

export const saveCustodyRestriction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId?: string;
      childId?: string;
      guardianUserId?: string;
      mode?: string;
      note?: string;
      filename?: string;
      dataUrl?: string;
    } | undefined) => ({
      daycareId: String(input?.daycareId || "").trim(),
      childId: String(input?.childId || "").trim(),
      guardianUserId: String(input?.guardianUserId || "").trim(),
      mode: input?.mode === "block" ? ("block" as const) : ("restrict" as const),
      note: String(input?.note || "").trim().slice(0, 2000),
      filename: String(input?.filename || "").slice(0, 160),
      dataUrl: String(input?.dataUrl || ""),
    }),
  )
  .handler(async ({ context, data }) => {
    if (!coparentEmailEnabled()) fail("off");
    if (!data.daycareId || !data.childId || !data.guardianUserId) fail("missing");
    const sql = await getSql();
    const admin = await assertCentreStaff(sql, context.userId, data.daycareId);
    const { canCentreWriteLeadsFor } = await import("@/lib/server/centre-access");
    if (!admin && !(await canCentreWriteLeadsFor(sql, context.userId, data.daycareId))) fail("denied");
    let documentRef: string | null = null;
    let documentName: string | null = null;
    let documentMime: string | null = null;
    if (data.dataUrl) {
      const { parsePrivateUpload, persistPrivateDoc } = await import("@/lib/server/private-docs");
      const parsed = parsePrivateUpload({ dataUrl: data.dataUrl, filename: data.filename || "order.pdf" });
      if (!parsed.ok) throw new Error(parsed.error);
      const stored = await persistPrivateDoc({
        prefix: R2_FAMILY_PREFIX,
        keyTail: `custody/${data.daycareId}/${nid("ord")}`,
        body: parsed.body,
        mime: parsed.mime,
      });
      documentRef = stored.storageRef;
      documentName = parsed.filename;
      documentMime = stored.mime;
    }
    const id = nid("cus");
    await sql`
      insert into custody_restrictions (
        id, daycare_id, child_id, guardian_user_id, mode, note, document_ref, document_name, document_mime, created_by
      ) values (
        ${id}, ${data.daycareId}, ${data.childId}, ${data.guardianUserId}, ${data.mode}, ${data.note},
        ${documentRef}, ${documentName}, ${documentMime}, ${context.userId}
      )
    `;
    await writeCoparentAudit(sql, {
      actorId: context.userId,
      action: "restriction",
      daycareId: data.daycareId,
      childId: data.childId,
      detail: `${data.mode}${documentRef ? " doc=1" : ""}`,
    });
    return { ok: true as const, id };
  });

export const liftCustodyRestriction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string } | undefined) => ({ id: String(input?.id || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!coparentEmailEnabled()) fail("off");
    const sql = await getSql();
    const rows = await sql<{ id: string; daycare_id: string; child_id: string }>`
      select id, daycare_id, child_id from custody_restrictions
      where id = ${data.id} and lifted_at is null
      limit 1
    `;
    const row = rows[0];
    if (!row) fail("missing");
    const admin = await assertCentreStaff(sql, context.userId, row.daycare_id);
    const { canCentreWriteLeadsFor } = await import("@/lib/server/centre-access");
    if (!admin && !(await canCentreWriteLeadsFor(sql, context.userId, row.daycare_id))) fail("denied");
    await sql`
      update custody_restrictions
      set lifted_at = now(), lifted_by = ${context.userId}
      where id = ${row.id}
    `;
    await writeCoparentAudit(sql, {
      actorId: context.userId,
      action: "restriction_lift",
      daycareId: row.daycare_id,
      childId: row.child_id,
      detail: row.id,
    });
    return { ok: true as const };
  });

export const readCustodyDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string } | undefined) => ({ id: String(input?.id || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!coparentEmailEnabled()) fail("off");
    const sql = await getSql();
    const rows = await sql<{
      daycare_id: string;
      document_ref: string | null;
      document_name: string | null;
      document_mime: string | null;
    }>`
      select daycare_id, document_ref, document_name, document_mime
      from custody_restrictions where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row?.document_ref) fail("missing");
    await assertCentreStaff(sql, context.userId, row.daycare_id);
    const { loadPrivateDoc } = await import("@/lib/server/private-docs");
    const file = await loadPrivateDoc(row.document_ref, row.document_mime, row.document_name);
    return {
      ok: true as const,
      filename: file.filename,
      mime: file.mime,
      dataUrl: `data:${file.mime};base64,${file.body.toString("base64")}`,
    };
  });

export async function messagingBlocked(sql: Sql, input: { senderId: string; daycareId: string; parentUserId: string }) {
  if (!coparentEmailEnabled()) return false;
  const rows = await sql<{ guardian_user_id: string }>`
    select guardian_user_id from custody_restrictions
    where daycare_id = ${input.daycareId}
      and lifted_at is null
      and mode = 'block'
      and guardian_user_id in (${input.senderId}, ${input.parentUserId})
  `.catch(() => []);
  if (rows.some((row) => row.guardian_user_id === input.senderId)) return true;
  const guardians = [input.senderId, input.parentUserId];
  const blocks = await sql<{ blocker_user_id: string; blocked_user_id: string | null; daycare_id: string | null }>`
    select blocker_user_id, blocked_user_id, daycare_id from safety_blocks
    where daycare_id = ${input.daycareId}
       or blocker_user_id = ${guardians[0]}
       or blocked_user_id = ${guardians[0]}
       or blocker_user_id = ${guardians[1]}
       or blocked_user_id = ${guardians[1]}
  `.catch(() => []);
  const { anyGuardianBlocked } = await import("@/lib/coparent-custody");
  const centres = await sql<{ user_id: string }>`
    select user_id from provider_daycares where daycare_id = ${input.daycareId}
    union
    select user_id from centre_members where daycare_id = ${input.daycareId} and status = 'active'
  `.catch(() => []);
  return anyGuardianBlocked({
    guardianIds: guardians,
    daycareId: input.daycareId,
    centreUserIds: centres.map((row) => row.user_id),
    blocks: blocks.map((row) => ({
      blockerUserId: row.blocker_user_id,
      blockedUserId: row.blocked_user_id,
      daycareId: row.daycare_id,
    })),
  });
}

export function acceptTokenOk(token: string) {
  return tokenOk(token);
}
