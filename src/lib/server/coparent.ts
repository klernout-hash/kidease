import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { coparentLinkEnabled } from "@/lib/features";
import {
  VIEW_ONLY_MESSAGE,
  canRemoveLink,
  canSetAccess,
  decideAccept,
  invitePath,
  parseAccess,
  scopeFromLinks,
  tokenOk,
  type CoparentLink,
  type FamilyScope,
} from "@/lib/coparent";
import { nid } from "@/lib/utils";

type LinkRow = {
  id: string;
  owner_user_id: string;
  member_user_id: string | null;
  access: string;
  status: string;
  invite_token: string;
};

function mapLink(row: LinkRow): CoparentLink | null {
  const access = parseAccess(row.access);
  if (!access) return null;
  if (row.status !== "pending" && row.status !== "active" && row.status !== "removed") return null;
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    memberUserId: row.member_user_id,
    access,
    status: row.status,
    inviteToken: row.invite_token,
  };
}

async function ensureCoparentTable() {
  const sql = await getSql();
  await sql`
    create table if not exists coparent_links (
      id text primary key,
      owner_user_id text not null,
      member_user_id text,
      access text not null default 'view',
      status text not null default 'pending',
      invite_token text not null,
      created_at timestamptz not null default now(),
      accepted_at timestamptz,
      removed_at timestamptz
    )
  `.catch(() => undefined);
  await sql`create unique index if not exists coparent_links_token_idx on coparent_links (invite_token)`.catch(() => undefined);
  await sql`
    create unique index if not exists coparent_links_one_open_owner
      on coparent_links (owner_user_id)
      where status in ('pending', 'active')
  `.catch(() => undefined);
  await sql`
    create unique index if not exists coparent_links_one_active_member
      on coparent_links (member_user_id)
      where status = 'active' and member_user_id is not null
  `.catch(() => undefined);
}

async function linksFor(userId: string): Promise<CoparentLink[]> {
  const sql = await getSql();
  const rows = await sql<LinkRow>`
    select id, owner_user_id, member_user_id, access, status, invite_token
    from coparent_links
    where status = 'active'
      and (owner_user_id = ${userId} or member_user_id = ${userId})
  `.catch(() => []);
  return rows.flatMap((row) => {
    const link = mapLink(row);
    return link ? [link] : [];
  });
}

/** Flag off: the signed-in person only. No extra query. */
export async function familyScopeFor(userId: string): Promise<FamilyScope> {
  if (!coparentLinkEnabled()) return scopeFromLinks(userId, [], false);
  await ensureCoparentTable();
  return scopeFromLinks(userId, await linksFor(userId), true);
}

export async function assertFamilyWrite(userId: string): Promise<FamilyScope> {
  const scope = await familyScopeFor(userId);
  if (!scope.canWrite) throw new Error(VIEW_ONLY_MESSAGE);
  return scope;
}

function fail(code: string): never {
  throw new Error(`coparent:${code}`);
}

async function displayName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const sql = await getSql();
  const rows = await sql<{ name: string | null }>`select name from "user" where id = ${userId} limit 1`.catch(() => []);
  const name = (rows[0]?.name || "").trim();
  return name || null;
}

export const coparentStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ enabled: coparentLinkEnabled() }));

export const listCoparent = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!coparentLinkEnabled()) {
      return {
        enabled: false as const,
        role: "none" as const,
        access: "owner" as const,
        canWrite: true,
        status: null,
        accessChoice: "view" as const,
        inviteToken: null,
        memberName: null,
        ownerName: null,
      };
    }
    await ensureCoparentTable();
    const sql = await getSql();
    const rows = await sql<LinkRow>`
      select id, owner_user_id, member_user_id, access, status, invite_token
      from coparent_links
      where status in ('pending', 'active')
        and (owner_user_id = ${context.userId} or member_user_id = ${context.userId})
      order by created_at desc
      limit 4
    `.catch(() => []);
    const links = rows.flatMap((row) => {
      const link = mapLink(row);
      return link ? [link] : [];
    });
    const scope = scopeFromLinks(context.userId, links.filter((link) => link.status === "active"), true);
    const mine =
      links.find((link) => link.memberUserId === context.userId && link.status === "active") ||
      links.find((link) => link.ownerUserId === context.userId) ||
      null;
    const role = mine?.memberUserId === context.userId ? "member" : mine ? "owner" : "none";
    return {
      enabled: true as const,
      role,
      access: scope.access,
      canWrite: scope.canWrite,
      status: mine && mine.status !== "removed" ? mine.status : null,
      accessChoice: mine?.access || "view",
      inviteToken: role === "owner" && mine?.status === "pending" ? mine.inviteToken : null,
      memberName: mine?.memberUserId ? await displayName(mine.memberUserId) : null,
      ownerName: role === "member" && mine ? await displayName(mine.ownerUserId) : null,
    };
  });

export const createCoparentInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { access?: string; deskPath?: string } | undefined) => ({
    access: parseAccess(input?.access) || "view",
    deskPath: input?.deskPath === "/fr/parent" ? ("/fr/parent" as const) : ("/parent" as const),
  }))
  .handler(async ({ context, data }) => {
    if (!coparentLinkEnabled()) fail("off");
    await ensureCoparentTable();
    const sql = await getSql();
    const open = await sql<LinkRow>`
      select id, owner_user_id, member_user_id, access, status, invite_token
      from coparent_links
      where status in ('pending', 'active')
        and (owner_user_id = ${context.userId} or member_user_id = ${context.userId})
    `.catch(() => []);
    const links = open.flatMap((row) => {
      const link = mapLink(row);
      return link ? [link] : [];
    });
    if (links.some((link) => link.memberUserId === context.userId && link.status === "active")) fail("member");
    const existing = links.find((link) => link.ownerUserId === context.userId);
    if (existing?.status === "active") fail("open");
    if (existing?.status === "pending") {
      if (existing.access !== data.access) {
        await sql`update coparent_links set access = ${data.access} where id = ${existing.id}`;
      }
      return { ok: true as const, path: invitePath(existing.inviteToken, data.deskPath), token: existing.inviteToken };
    }
    const token = randomBytes(18).toString("base64url");
    const id = nid("cp");
    await sql`
      insert into coparent_links (id, owner_user_id, member_user_id, access, status, invite_token)
      values (${id}, ${context.userId}, ${null}, ${data.access}, ${"pending"}, ${token})
    `;
    return { ok: true as const, path: invitePath(token, data.deskPath), token };
  });

export const setCoparentAccess = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { access?: string } | undefined) => ({ access: parseAccess(input?.access) }))
  .handler(async ({ context, data }) => {
    if (!coparentLinkEnabled()) fail("off");
    await ensureCoparentTable();
    const sql = await getSql();
    const rows = await sql<LinkRow>`
      select id, owner_user_id, member_user_id, access, status, invite_token
      from coparent_links
      where owner_user_id = ${context.userId} and status in ('pending', 'active')
      limit 1
    `.catch(() => []);
    const link = rows[0] ? mapLink(rows[0]) : null;
    if (!canSetAccess(context.userId, link, data.access) || !data.access || !link) fail("denied");
    await sql`update coparent_links set access = ${data.access} where id = ${link.id}`;
    return { ok: true as const };
  });

export const removeCoparent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!coparentLinkEnabled()) fail("off");
    await ensureCoparentTable();
    const sql = await getSql();
    const rows = await sql<LinkRow>`
      select id, owner_user_id, member_user_id, access, status, invite_token
      from coparent_links
      where owner_user_id = ${context.userId} and status in ('pending', 'active')
      limit 1
    `.catch(() => []);
    const link = rows[0] ? mapLink(rows[0]) : null;
    if (!canRemoveLink(context.userId, link) || !link) fail("denied");
    await sql`
      update coparent_links
      set status = 'removed', removed_at = now()
      where id = ${link.id} and owner_user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const acceptCoparentInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token?: string } | undefined) => ({ token: String(input?.token || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!coparentLinkEnabled()) fail("off");
    if (!tokenOk(data.token)) fail("missing");
    await ensureCoparentTable();
    const sql = await getSql();
    const rows = await sql<LinkRow>`
      select id, owner_user_id, member_user_id, access, status, invite_token
      from coparent_links
      where invite_token = ${data.token}
      limit 1
    `.catch(() => []);
    const link = rows[0] ? mapLink(rows[0]) : null;
    const others = await sql<{ id: string }>`
      select id from coparent_links
      where status in ('pending', 'active')
        and (owner_user_id = ${context.userId} or member_user_id = ${context.userId})
        and id is distinct from ${link?.id || ""}
      limit 1
    `.catch(() => []);
    const decision = decideAccept({
      actorId: context.userId,
      link,
      actorHasOpenFamily: others.length > 0,
    });
    if (!decision.ok) fail(decision.error);
    if (!link) fail("missing");
    const saved = await sql<{ id: string }>`
      update coparent_links
      set member_user_id = ${context.userId}, status = 'active', accepted_at = now()
      where id = ${link.id} and status = 'pending' and member_user_id is null
      returning id
    `;
    if (!saved[0]) fail("closed");
    return { ok: true as const };
  });
