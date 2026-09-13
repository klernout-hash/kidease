import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { isKidEaseOperatorEmail } from "@/lib/admin-email";
import { lookupUser } from "@/lib/server/notify";
import { isLeadKind } from "@/lib/lead-requests";
import {
  claimNotificationHref,
  claimTitleKey,
  failClosedUnread,
  inboxNotificationHref,
  isAllowedNotificationHref,
  isNotificationKind,
  isNotificationTitleKey,
  leadNotificationHref,
  leadTitleKey,
  notificationSourceKey,
  projectAdminSignupNotification,
  searchAlertHref,
  type NotificationItem,
  type NotificationKind,
  type ProjectedNotification,
} from "@/lib/notifications";

type Sql = Awaited<ReturnType<typeof getSql>>;

async function ensureNotificationsTable(sql: Sql) {
  await sql
    .query(
      `create table if not exists user_notifications (
        id text primary key,
        user_id text not null,
        kind text not null,
        title_key text not null,
        href text not null,
        source_key text not null,
        daycare_name text,
        status text,
        created_at timestamptz not null default now(),
        read_at timestamptz
      )`,
    )
    .catch(() => undefined);
  await sql
    .query(`create unique index if not exists user_notifications_source_uidx on user_notifications (user_id, source_key)`)
    .catch(() => undefined);
}

async function projectFromLeads(sql: Sql, userId: string): Promise<ProjectedNotification[]> {
  const rows = await sql<{
    id: string;
    kind: string;
    status: string;
    user_id: string;
    conversation_id: string | null;
    daycare_name: string | null;
    created_at: string;
    updated_at: string;
  }>`
    select l.id, l.kind, l.status, l.user_id, l.conversation_id, d.name as daycare_name,
           l.created_at, l.updated_at
    from lead_requests l
    join daycares d on d.id = l.daycare_id
    where l.user_id = ${userId}
       or exists (
         select 1 from provider_daycares p
         where p.user_id = ${userId} and p.daycare_id = l.daycare_id
       )
    order by l.updated_at desc
    limit 40
  `.catch(() => []);

  return rows.map((row) => {
    const audience = row.user_id === userId ? ("parent" as const) : ("provider" as const);
    const kind: NotificationKind = row.kind === "tour" ? "tour" : "lead";
    return {
      kind,
      titleKey: leadTitleKey({
        audience,
        kind: isLeadKind(row.kind) ? row.kind : "spot_inquiry",
        status: row.status,
      }),
      href: leadNotificationHref({ audience, conversationId: row.conversation_id }),
      sourceKey: notificationSourceKey(kind, row.id, `${audience}:${row.status}`),
      createdAt: String(row.updated_at || row.created_at),
      daycareName: row.daycare_name,
      status: row.status,
    };
  });
}

async function projectFromClaims(
  sql: Sql,
  userId: string,
  isAdmin: boolean,
): Promise<ProjectedNotification[]> {
  const mine = await sql<{
    id: string;
    status: string;
    daycare_name: string | null;
    created_at: string;
    reviewed_at: string | null;
  }>`
    select c.id, c.status, d.name as daycare_name, c.created_at, c.reviewed_at
    from listing_claims c
    left join daycares d on d.id = c.daycare_id
    where c.user_id = ${userId}
    order by coalesce(c.reviewed_at, c.created_at) desc
    limit 20
  `.catch(() => []);

  const out: ProjectedNotification[] = mine.map((row) => ({
    kind: "claim",
    titleKey: claimTitleKey(row.status, "provider"),
    href: claimNotificationHref("provider"),
    sourceKey: notificationSourceKey("claim", row.id, row.status),
    createdAt: String(row.reviewed_at || row.created_at),
    daycareName: row.daycare_name,
    status: row.status,
  }));

  if (!isAdmin) return out;

  const waiting = await sql<{
    id: string;
    status: string;
    daycare_name: string | null;
    created_at: string;
  }>`
    select c.id, c.status, d.name as daycare_name, c.created_at
    from listing_claims c
    left join daycares d on d.id = c.daycare_id
    where c.status in ('pending', 'waiting')
    order by c.created_at desc
    limit 20
  `.catch(() => []);

  for (const row of waiting) {
    out.push({
      kind: "admin_queue",
      titleKey: "notifAdminClaim",
      href: claimNotificationHref("admin"),
      sourceKey: notificationSourceKey("admin_queue", row.id, row.status),
      createdAt: String(row.created_at),
      daycareName: row.daycare_name,
      status: row.status,
    });
  }
  return out;
}

async function projectFromInbox(sql: Sql, userId: string): Promise<ProjectedNotification[]> {
  const rows = await sql<{
    id: string;
    name: string;
    last_at: string;
    parent_user_id: string;
  }>`
    select c.id, d.name, c.last_at, c.user_id as parent_user_id
    from conversations c
    join daycares d on d.id = c.daycare_id
    where (
        c.user_id = ${userId}
        or exists (
          select 1 from provider_daycares p
          where p.user_id = ${userId} and p.daycare_id = c.daycare_id
        )
      )
      and exists (
        select 1 from messages m
        where m.conversation_id = c.id
          and m.sender <> 'system'
          and m.sender <> case when c.user_id = ${userId} then 'parent' else 'provider' end
          and m.created_at > coalesce(
            (select r.last_read_at from conversation_reads r
             where r.conversation_id = c.id and r.user_id = ${userId}),
            '1970-01-01'::timestamptz
          )
      )
    order by c.last_at desc
    limit 20
  `.catch(() => []);

  return rows.map((row) => ({
    kind: "inbox",
    titleKey: "notifInbox",
    href: inboxNotificationHref(row.id, row.parent_user_id === userId ? "family" : "centre"),
    sourceKey: notificationSourceKey("inbox", row.id, String(row.last_at)),
    createdAt: String(row.last_at),
    daycareName: row.name,
    status: "unread",
  }));
}

async function projectFromSearchAlerts(sql: Sql, userId: string): Promise<ProjectedNotification[]> {
  const rows = await sql<{
    id: string;
    title: string | null;
    link_path: string | null;
    read_at: string | null;
    created_at: string;
  }>`
    select id, title, link_path, read_at, created_at
    from search_alert_notices
    where user_id = ${userId}
    order by created_at desc
    limit 20
  `.catch(async () => {
    const fallback = await sql<{
      id: string;
      title: string | null;
      read_at: string | null;
      created_at: string;
    }>`
      select id, title, read_at, created_at
      from search_alert_notices
      where user_id = ${userId}
      order by created_at desc
      limit 20
    `.catch(() => []);
    return fallback.map((row) => ({ ...row, link_path: null as string | null }));
  });

  return rows.map((row) => ({
    kind: "search_alert",
    titleKey: "notifSearchAlert",
    href: searchAlertHref(row.link_path),
    sourceKey: notificationSourceKey("search_alert", row.id),
    createdAt: String(row.created_at),
    readAt: row.read_at ? String(row.read_at) : null,
    daycareName: row.title,
    status: row.read_at ? "read" : "unread",
  }));
}

async function projectFromPlatformSignups(sql: Sql, isAdmin: boolean): Promise<ProjectedNotification[]> {
  if (!isAdmin) return [];
  const rows = await sql<{
    id: string;
    kind: string;
    daycare_name: string | null;
    provider_name: string | null;
    provider_email: string | null;
    email_status: string | null;
    created_at: string;
  }>`
    select id, kind, daycare_name, provider_name, provider_email, email_status, created_at
    from platform_events
    where kind in ('account', 'signup', 'listing')
    order by created_at desc
    limit 40
  `.catch(() => []);

  return rows
    .map((row) => projectAdminSignupNotification(row))
    .filter((row): row is ProjectedNotification => Boolean(row));
}

export async function projectUserNotifications(sql: Sql, userId: string): Promise<ProjectedNotification[]> {
  const actor = await lookupUser(userId).catch(() => ({ email: null }));
  const isAdmin = isKidEaseOperatorEmail(actor.email);

  const batches = await Promise.all([
    projectFromLeads(sql, userId),
    projectFromClaims(sql, userId, isAdmin),
    projectFromInbox(sql, userId),
    projectFromSearchAlerts(sql, userId),
    projectFromPlatformSignups(sql, isAdmin),
  ]);
  return batches.flat().filter((row) => isAllowedNotificationHref(row.href));
}

async function persistProjected(sql: Sql, userId: string, rows: ProjectedNotification[]) {
  for (const row of rows) {
    const id = nid("nt");
    await sql`
      insert into user_notifications (
        id, user_id, kind, title_key, href, source_key, daycare_name, status, created_at, read_at
      ) values (
        ${id}, ${userId}, ${row.kind}, ${row.titleKey}, ${row.href}, ${row.sourceKey},
        ${row.daycareName ?? null}, ${row.status ?? null}, ${row.createdAt}, ${row.readAt ?? null}
      )
      on conflict (user_id, source_key) do update
        set href = excluded.href,
            title_key = excluded.title_key,
            daycare_name = excluded.daycare_name,
            status = excluded.status,
            read_at = coalesce(user_notifications.read_at, excluded.read_at)
    `.catch(() => undefined);
  }
}

function mapRow(row: {
  id: string;
  kind: string;
  title_key: string;
  href: string;
  source_key: string;
  created_at: string;
  read_at: string | null;
  daycare_name: string | null;
  status: string | null;
}): NotificationItem | null {
  if (!isNotificationKind(row.kind) || !isNotificationTitleKey(row.title_key)) return null;
  if (!isAllowedNotificationHref(row.href)) return null;
  return {
    id: row.id,
    kind: row.kind,
    titleKey: row.title_key,
    href: row.href,
    sourceKey: row.source_key,
    createdAt: String(row.created_at),
    readAt: row.read_at ? String(row.read_at) : null,
    daycareName: row.daycare_name,
    status: row.status,
  };
}

export async function syncAndListNotifications(userId: string): Promise<NotificationItem[]> {
  try {
    const sql = await getSql();
    await ensureNotificationsTable(sql);
    const projected = await projectUserNotifications(sql, userId);
    await persistProjected(sql, userId, projected);
    const rows = await sql<{
      id: string;
      kind: string;
      title_key: string;
      href: string;
      source_key: string;
      created_at: string;
      read_at: string | null;
      daycare_name: string | null;
      status: string | null;
    }>`
      select id, kind, title_key, href, source_key, created_at, read_at, daycare_name, status
      from user_notifications
      where user_id = ${userId}
      order by created_at desc
      limit 60
    `.catch(() => []);
    return rows.map(mapRow).filter((row): row is NotificationItem => Boolean(row));
  } catch {
    return [];
  }
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  try {
    const sql = await getSql();
    await ensureNotificationsTable(sql);
    const projected = await projectUserNotifications(sql, userId);
    await persistProjected(sql, userId, projected);
    const rows = await sql<{ n: number }>`
      select count(*)::int as n
      from user_notifications
      where user_id = ${userId} and read_at is null
    `.catch(() => [{ n: 0 }]);
    return failClosedUnread(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

export async function markNotificationsRead(
  userId: string,
  input: { id?: string; all?: boolean },
): Promise<{ ok: true }> {
  const sql = await getSql();
  await ensureNotificationsTable(sql);
  if (input.all) {
    await sql`
      update user_notifications set read_at = now()
      where user_id = ${userId} and read_at is null
    `.catch(() => undefined);
  } else if (input.id) {
    await sql`
      update user_notifications set read_at = now()
      where id = ${input.id} and user_id = ${userId} and read_at is null
    `.catch(() => undefined);
  }
  return { ok: true as const };
}

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => syncAndListNotifications(context.userId));

export const getNotificationUnread = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => ({ unread: await countUnreadNotifications(context.userId) }));

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; all?: boolean }) => ({
    id: String(input?.id || "").trim(),
    all: Boolean(input?.all),
  }))
  .handler(async ({ context, data }) => markNotificationsRead(context.userId, data));
