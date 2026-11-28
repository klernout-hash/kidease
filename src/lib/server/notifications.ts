import { createServerFn } from "@tanstack/react-start";
import {
  mergeNotificationEvents,
  notificationEventKey,
  type NotificationReceipt,
} from "@/lib/notification-groups";
import type { UnifiedEvent } from "./unified-alerts";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { isKidEaseOperatorEmail } from "@/lib/admin-email";
import { lookupUser } from "@/lib/server/notify";
import { isLeadKind } from "@/lib/lead-requests";
import { OUTBOX_BELL_CATEGORIES, isAlertCategory, safeAlertHref } from "@/lib/alert-push";
import {
  claimNotificationHref,
  claimTitleKey,
  unreadFromRows,
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

const bellCategories = new Set<string>(OUTBOX_BELL_CATEGORIES);

async function ensureNotificationsTable(sql: Sql) {
  if (!import.meta.env.SSR) return;
  const { ensureUserNotifications } = await import("./runtime-schema");
  await ensureUserNotifications(sql);
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
    source_kind: string | null;
  }>`
    select l.id, l.kind, l.status, l.user_id, l.conversation_id, d.name as daycare_name,
           l.created_at, l.updated_at, l.source_kind
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

  return rows.flatMap((row) => {
    const audience = row.user_id === userId ? ("parent" as const) : ("provider" as const);
    if (audience === "parent" && (row.status === "requested" || row.status === "received")) return [];
    // projectFromTours covers the parent's own tour answers (accepted, declined, moved).
    if (audience === "parent" && row.source_kind === "tour_request") return [];
    const kind: NotificationKind = row.kind === "tour" ? "tour" : "lead";
    return [{
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
    }];
  });
}

/**
 * B04: the parent saw no alert when a centre accepted, declined, or moved a
 * tour. Read tour_requests directly so the bell does not depend on a lead row,
 * and key each answer by status and slot so a reschedule is a new alert.
 */
async function projectFromTours(sql: Sql, userId: string): Promise<ProjectedNotification[]> {
  const rows = await sql<{
    id: string;
    status: string;
    conversation_id: string | null;
    daycare_name: string | null;
    preferred_times: string | null;
    responded_at: string | null;
    created_at: string;
  }>`
    select t.id, t.status, t.conversation_id, d.name as daycare_name, t.preferred_times,
           t.responded_at, t.created_at
    from tour_requests t
    join daycares d on d.id = t.daycare_id
    where t.user_id = ${userId}
      and t.responded_at is not null
      and (t.responded_by is null or t.responded_by <> ${userId})
      and t.status in ('accepted', 'declined', 'pending')
    order by t.responded_at desc
    limit 20
  `.catch(() => []);
  return rows.map((row) => ({
    kind: "tour" as const,
    titleKey: "notifTourUpdated" as const,
    href: leadNotificationHref({ audience: "parent", conversationId: row.conversation_id }),
    sourceKey: notificationSourceKey("tour", row.id, `parent:${row.status}:${tourSlotKey(row.preferred_times)}`),
    createdAt: String(row.responded_at || row.created_at),
    daycareName: row.daycare_name,
    status: row.status === "accepted" ? "confirmed" : row.status === "pending" ? "rescheduled" : row.status,
  }));
}

function tourSlotKey(raw: string | null): string {
  return String(raw || "").replace(/[^0-9:-]/g, "").slice(0, 40);
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
    conversation_id: string;
    name: string;
    created_at: string;
    read_at: string | null;
    parent_user_id: string;
  }>`
    select m.id, c.id as conversation_id, d.name, m.created_at,
           case when r.last_read_at >= m.created_at then r.last_read_at
                else (
                  select max(n.read_at) from user_notifications n
                  where n.user_id = ${userId} and n.kind = 'inbox'
                    and starts_with(n.source_key, 'inbox:' || c.id || ':')
                    and n.created_at >= m.created_at
                )
           end as read_at,
           c.user_id as parent_user_id
    from messages m
    join conversations c on c.id = m.conversation_id
    join daycares d on d.id = c.daycare_id
    left join conversation_reads r on r.conversation_id = c.id and r.user_id = ${userId}
    where (
        c.user_id = ${userId}
        or exists (
          select 1 from provider_daycares p
          where p.user_id = ${userId} and p.daycare_id = c.daycare_id
        )
      )
      and m.sender = case when c.user_id = ${userId} then 'provider' else 'parent' end
    order by m.created_at desc, m.id desc
    limit 60
  `.catch(() => []);

  return rows.map((row) => ({
    kind: "inbox",
    titleKey: "notifInbox",
    href: inboxNotificationHref(row.conversation_id, row.parent_user_id === userId ? "family" : "centre"),
    sourceKey: notificationSourceKey("inbox", "message", row.id),
    createdAt: String(row.created_at),
    readAt: row.read_at ? String(row.read_at) : null,
    daycareName: row.name,
    status: null,
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

function bellHref(raw: string): string {
  const safe = safeAlertHref(raw);
  if (safe.startsWith("/")) return safe.split("#")[0] || "/notifications";
  try {
    const url = new URL(safe);
    return `${url.pathname}${url.search}` || "/notifications";
  } catch {
    return "/notifications";
  }
}

async function projectFromAlertOutbox(sql: Sql, userId: string): Promise<ProjectedNotification[]> {
  const rows = await sql<{
    id: string;
    category: string;
    title: string;
    href: string;
    sent_at: string;
  }>`
    select id, category, title, href, sent_at
    from notification_outbox
    where user_id = ${userId} and sent_at is not null
    order by sent_at desc
    limit 20
  `.catch(() => []);
  return rows.flatMap((row) => {
    if (!isAlertCategory(row.category) || !bellCategories.has(row.category)) return [];
    const href = bellHref(row.href);
    if (!isAllowedNotificationHref(href)) return [];
    return [
      {
        kind: "customer_alert" as const,
        titleKey: "notifCustomerAlert" as const,
        href,
        sourceKey: notificationSourceKey("customer_alert", row.id, row.category),
        createdAt: String(row.sent_at),
        daycareName: row.title,
        status: row.category,
      },
    ];
  });
}

export async function projectUserNotifications(sql: Sql, userId: string): Promise<ProjectedNotification[]> {
  const actor = await lookupUser(userId).catch(() => ({ email: null }));
  const isAdmin = isKidEaseOperatorEmail(actor.email);

  const batches = await Promise.all([
    projectFromLeads(sql, userId),
    projectFromTours(sql, userId),
    projectFromClaims(sql, userId, isAdmin),
    projectFromInbox(sql, userId),
    projectFromSearchAlerts(sql, userId),
    projectFromPlatformSignups(sql, isAdmin),
    projectFromAlertOutbox(sql, userId),
    import("./pipeline-notifications").then((m) => m.projectFromPipeline(sql, userId)).catch(() => []),
  ]);
  return batches.flat().filter((row) => isAllowedNotificationHref(row.href));
}

async function persistProjected(sql: Sql, userId: string, rows: ProjectedNotification[]) {
  if (!rows.length) return;
  const unique = new Map(rows.map((row) => [row.sourceKey, row]));
  const batch = [...unique.values()].map((row) => ({
    id: nid("nt"),
    kind: row.kind,
    title_key: row.titleKey,
    href: row.href,
    source_key: row.sourceKey,
    daycare_name: row.daycareName ?? null,
    status: row.status ?? null,
    created_at: row.createdAt,
    read_at: row.readAt ?? null,
  }));
  await sql`
    insert into user_notifications (
      id, user_id, kind, title_key, href, source_key, daycare_name, status, created_at, read_at
    )
    select id, ${userId}, kind, title_key, href, source_key, daycare_name, status, created_at, read_at
    from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) as incoming(
      id text, kind text, title_key text, href text, source_key text,
      daycare_name text, status text, created_at timestamptz, read_at timestamptz
    )
    on conflict (user_id, source_key) do update
      set href = excluded.href,
          title_key = excluded.title_key,
          daycare_name = excluded.daycare_name,
          status = excluded.status,
          read_at = coalesce(user_notifications.read_at, excluded.read_at)
  `.catch(() => undefined);
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

async function syncAndListNotifications(userId: string): Promise<NotificationItem[]> {
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
    and (kind <> 'inbox' or source_key not like 'inbox:%' or source_key like 'inbox:message:%')
    order by created_at desc, id desc
    limit 60
  `;
  return rows.map(mapRow).filter((row): row is NotificationItem => Boolean(row));
}

async function notificationFeed(userId: string) {
  const { listUnifiedEvents } = await import("./unified-alerts");
  const { nativeShellRequest } = await import("@/lib/native-shell-request");
  const native = await nativeShellRequest();
  const [projected, unified] = await Promise.all([
    syncAndListNotifications(userId),
    listUnifiedEvents(userId, native).catch(() => []),
  ]);
  return mergeNotificationEvents<NotificationItem | UnifiedEvent>([
    ...projected.map((item) => ({
      key: notificationEventKey("projected", item.sourceKey),
      data: item,
      createdAt: item.createdAt,
      readAt: item.readAt,
      receipts: [{ source: "projected" as const, id: item.id }],
    })),
    ...unified.map((item) => ({
      key: notificationEventKey("unified", item.dedupeKey),
      data: item,
      createdAt: item.createdAt,
      readAt: item.readAt,
      receipts: [{ source: "unified" as const, id: item.id }],
    })),
  ]);
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  return unreadFromRows(await notificationFeed(userId).catch(() => []));
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
  .handler(async ({ context }) => notificationFeed(context.userId));

export const getNotificationUnread = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => ({ unread: await countUnreadNotifications(context.userId) }));

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { receipts?: NotificationReceipt[]; all?: boolean }) => ({
    receipts: (Array.isArray(input?.receipts) ? input.receipts : [])
      .filter((row) => (row?.source === "projected" || row?.source === "unified") && typeof row.id === "string")
      .slice(0, 10),
    all: input?.all === true,
  }))
  .handler(async ({ context, data }) => {
    const { markUnifiedRead } = await import("./unified-alerts");
    if (data.all) {
      await Promise.all([
        markNotificationsRead(context.userId, { all: true }),
        markUnifiedRead(context.userId, { all: true }),
      ]);
    } else {
      await Promise.all(data.receipts.map(({ id, source }) => source === "projected"
        ? markNotificationsRead(context.userId, { id })
        : markUnifiedRead(context.userId, { id })));
    }
    return { ok: true as const };
  });
