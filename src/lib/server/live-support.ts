import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { liveSupportEnabled, supportSmsAlertEnabled, type EnvMap } from "@/lib/features";
import { brandedNotice } from "@/lib/email-layout";
import {
  cleanIdempotencyKey,
  mayReadSupportThread,
  planLiveSupportAlert,
  resolveSupportThreadId,
  supportAlertEmail,
  supportMessageSender,
  supportPushNotice,
  supportPushUrl,
  supportReferenceCode,
  supportRoleForAccount,
  supportSmsAlert,
  type SupportActor,
} from "@/lib/live-support";
import { cleanSupportBody, supportPreview, supportRateAllows } from "@/lib/support-desk";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";
import { sendPushNotification } from "@/lib/server/push.server";
import { requireSupport } from "@/lib/server/roles";
import { sendSms } from "@/lib/server/sms";
import { sendTransactionalMail } from "@/lib/transactional-mail";
import { nid } from "@/lib/utils";

type ThreadRow = {
  id: string;
  user_id: string;
  admin_unread: number;
  user_unread: number;
  reference_code: string | null;
};

export type LiveSupportDetail = {
  userId: string;
  name: string;
  role: "Parent" | "Daycare" | "Staff";
  centres: string[];
  children: string[];
  reference: string | null;
};

export type LiveSupportMessage = {
  id: string;
  sender: string;
  body: string;
  createdAt: string;
};

async function staffUser(userId: string): Promise<boolean> {
  try {
    await requireSupport(userId);
    return true;
  } catch {
    return false;
  }
}

async function ensureThread(sql: Sql, userId: string): Promise<ThreadRow> {
  const existing = await sql<ThreadRow>`
    select id, user_id, admin_unread, user_unread, reference_code
    from support_threads where user_id = ${userId} limit 1
  `;
  const fresh = nid("sth");
  const picked = resolveSupportThreadId(existing[0]?.id, fresh);
  if (!picked.created && existing[0]) return existing[0];
  await sql`
    insert into support_threads (id, user_id) values (${picked.id}, ${userId})
    on conflict (user_id) do nothing
  `;
  const again = await sql<ThreadRow>`
    select id, user_id, admin_unread, user_unread, reference_code
    from support_threads where user_id = ${userId} limit 1
  `;
  return again[0];
}

async function accountDetail(sql: Sql, userId: string, reference: string | null): Promise<LiveSupportDetail> {
  const roleRows = await sql<{ role: string | null }>`
    select role from profiles where user_id = ${userId} limit 1
  `.catch(() => [] as Array<{ role: string | null }>);
  const nameRows = await sql<{ name: string | null }>`
    select name from "user" where id = ${userId} limit 1
  `.catch(() => [] as Array<{ name: string | null }>);
  const centreRows = await sql<{ name: string | null }>`
    select name from (
      select d.name from provider_daycares p
      join daycares d on d.id = p.daycare_id
      where p.user_id = ${userId}
      union
      select d.name from centre_members m
      join daycares d on d.id = m.daycare_id
      where m.user_id = ${userId} and m.status = 'active'
    ) centres
    where name is not null
    limit 5
  `.catch(() => [] as Array<{ name: string | null }>);
  const childRows = await sql<{ name: string | null }>`
    select name from children where user_id = ${userId} order by created_at asc limit 4
  `.catch(() => [] as Array<{ name: string | null }>);
  const centres = centreRows.map((row) => String(row.name || "").trim()).filter(Boolean);
  return {
    userId,
    name: String(nameRows[0]?.name || "").trim() || "Someone",
    role: supportRoleForAccount({ profileRole: roleRows[0]?.role, hasCentre: centres.length > 0 }),
    centres,
    children: childRows.map((row) => String(row.name || "").trim()).filter(Boolean),
    reference,
  };
}

async function markRead(sql: Sql, threadId: string, userId: string, actor: SupportActor) {
  await sql`
    insert into support_reads (thread_id, user_id, last_read_at)
    values (${threadId}, ${userId}, now())
    on conflict (thread_id, user_id) do update set last_read_at = now()
  `;
  if (actor === "staff") {
    await sql`update support_threads set admin_unread = 0 where id = ${threadId}`;
  } else {
    await sql`update support_threads set user_unread = 0 where id = ${threadId}`;
  }
}

async function loadMessages(sql: Sql, threadId: string): Promise<LiveSupportMessage[]> {
  const rows = await sql<{ id: string; sender: string; body: string; created_at: string }>`
    select id, sender, body, created_at from support_messages
    where thread_id = ${threadId}
    order by created_at asc
    limit 200
  `;
  return rows.map((row) => ({
    id: row.id,
    sender: row.sender,
    body: row.body,
    createdAt: String(row.created_at),
  }));
}

async function loadReads(sql: Sql, threadId: string) {
  const rows = await sql<{ user_id: string; last_read_at: string; name: string | null }>`
    select r.user_id, r.last_read_at, u.name
    from support_reads r
    left join "user" u on u.id = r.user_id
    where r.thread_id = ${threadId}
  `.catch(() => [] as Array<{ user_id: string; last_read_at: string; name: string | null }>);
  return rows.map((row) => ({
    userId: row.user_id,
    name: String(row.name || "").trim(),
    lastReadAt: String(row.last_read_at),
  }));
}

async function claimAlertWindow(sql: Sql, threadId: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    update support_threads
    set last_alert_at = now()
    where id = ${threadId}
      and (last_alert_at is null or last_alert_at < now() - interval '2 minutes')
    returning id
  `;
  return Boolean(rows[0]);
}

async function alertStaff(input: {
  sql: Sql;
  threadId: string;
  authorId: string;
  name: string;
  role: LiveSupportDetail["role"];
  env?: EnvMap;
}) {
  const env = input.env ?? process.env;
  const due = await claimAlertWindow(input.sql, input.threadId);
  if (!due) return;
  const url = supportPushUrl(input.threadId);
  const notice = supportPushNotice({ role: input.role, name: input.name });
  const people = await input.sql<{ user_id: string }>`
    select user_id from profiles where role in ('admin', 'support', 'support_lead')
  `.catch(() => [] as Array<{ user_id: string }>);
  let sent = 0;
  for (const person of people) {
    if (!person.user_id || person.user_id === input.authorId) continue;
    try {
      const result = await sendPushNotification({
        userId: person.user_id,
        title: notice.title,
        body: notice.body,
        url,
      });
      if (result.ok) sent += result.sent;
    } catch {
      /* one device failure still leaves email */
    }
  }
  const phone = String(env.SUPPORT_ALERT_PHONE || "").trim();
  const emailTo = supportAlertEmail({
    SUPPORT_INBOX_EMAIL: env.SUPPORT_INBOX_EMAIL || SUPPORT_INBOX_EMAIL,
    ADMIN_EMAIL: env.ADMIN_EMAIL,
  });
  const plan = planLiveSupportAlert({
    due: true,
    pushDelivered: sent > 0,
    smsFlagOn: supportSmsAlertEnabled(env),
    smsPhone: phone,
    emailTo,
  });
  if (plan.email) {
    const text = `${notice.body}\n${url}`;
    try {
      await sendTransactionalMail({
        to: emailTo,
        purpose: "customer_alert",
        subject: notice.title,
        text,
        html: `<p>${notice.body}</p><p><a href="${url}">${url}</a></p>`,
        branded: brandedNotice({
          heading: notice.title,
          text,
          reason: "You get this because a support chat is waiting.",
          cta: { label: "Open the chat", href: url },
        }),
      });
    } catch {
      /* the message is already saved */
    }
  }
  if (plan.sms) {
    try {
      await sendSms(
        {
          to: phone,
          body: supportSmsAlert({ role: input.role, name: input.name, url }),
          audience: "internal",
        },
        { operatorAlert: true, env },
      );
    } catch {
      /* the message is already saved */
    }
  }
}

async function insertMessage(sql: Sql, input: {
  threadId: string;
  sender: "user" | "admin";
  body: string;
  key: string;
}): Promise<{ id: string; duplicate: boolean }> {
  const id = nid("smsg");
  const inserted = await sql<{ id: string }>`
    insert into support_messages (id, thread_id, sender, body, idempotency_key)
    values (${id}, ${input.threadId}, ${input.sender}, ${input.body}, ${input.key})
    on conflict (thread_id, idempotency_key) do nothing
    returning id
  `;
  if (inserted[0]) return { id: inserted[0].id, duplicate: false };
  const prior = await sql<{ id: string }>`
    select id from support_messages
    where thread_id = ${input.threadId} and idempotency_key = ${input.key}
    limit 1
  `;
  return { id: prior[0]?.id || id, duplicate: true };
}

export const liveSupportStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ enabled: liveSupportEnabled() }));

export const loadLiveSupport = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { threadId?: string } | undefined) => ({
    threadId: String(input?.threadId || "").trim().slice(0, 80),
  }))
  .handler(async ({ context, data }) => {
    if (!liveSupportEnabled()) return { enabled: false as const };
    const sql = await getSql();
    const staff = await staffUser(context.userId);
    let thread: ThreadRow | undefined;
    if (data.threadId) {
      if (!staff) return { enabled: true as const, ok: false as const, reason: "forbidden" as const };
      const rows = await sql<ThreadRow>`
        select id, user_id, admin_unread, user_unread, reference_code
        from support_threads where id = ${data.threadId} limit 1
      `;
      thread = rows[0];
      if (!thread || !mayReadSupportThread({ viewerId: context.userId, ownerId: thread.user_id, staff: true })) {
        return { enabled: true as const, ok: false as const, reason: "missing" as const };
      }
    } else {
      const rows = await sql<ThreadRow>`
        select id, user_id, admin_unread, user_unread, reference_code
        from support_threads where user_id = ${context.userId} limit 1
      `;
      thread = rows[0];
    }
    if (!thread) {
      const detail = await accountDetail(sql, context.userId, null);
      return {
        enabled: true as const,
        ok: true as const,
        threadId: null,
        messages: [] as LiveSupportMessage[],
        reads: [] as Array<{ userId: string; name: string; lastReadAt: string }>,
        detail,
        viewerId: context.userId,
        staff,
      };
    }
    if (!mayReadSupportThread({ viewerId: context.userId, ownerId: thread.user_id, staff: data.threadId ? staff : false })) {
      return { enabled: true as const, ok: false as const, reason: "forbidden" as const };
    }
    const actor: SupportActor = data.threadId && staff ? "staff" : "member";
    await markRead(sql, thread.id, context.userId, actor);
    const [messages, reads, detail] = await Promise.all([
      loadMessages(sql, thread.id),
      loadReads(sql, thread.id),
      accountDetail(sql, thread.user_id, thread.reference_code),
    ]);
    return {
      enabled: true as const,
      ok: true as const,
      threadId: thread.id,
      messages,
      reads,
      detail,
      viewerId: context.userId,
      staff,
    };
  });

export const sendLiveSupport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { body?: string; idempotencyKey?: string; reference?: string; threadId?: string; as?: string } | undefined) => ({
    body: cleanSupportBody(input?.body || ""),
    idempotencyKey: cleanIdempotencyKey(input?.idempotencyKey || "") || "",
    reference: supportReferenceCode(input?.reference),
    threadId: String(input?.threadId || "").trim().slice(0, 80),
    as: input?.as === "staff" ? ("staff" as const) : ("member" as const),
  }))
  .handler(async ({ context, data }) => {
    if (!liveSupportEnabled()) return { enabled: false as const };
    if (!data.idempotencyKey) return { enabled: true as const, ok: false as const, reason: "key" as const };
    if (!data.body) return { enabled: true as const, ok: false as const, reason: "empty" as const };
    const sql = await getSql();
    const staff = data.as === "staff" ? await staffUser(context.userId) : false;
    if (data.as === "staff" && !staff) return { enabled: true as const, ok: false as const, reason: "forbidden" as const };

    let thread: ThreadRow;
    let sender: "user" | "admin" = "user";
    if (data.as === "staff") {
      if (!data.threadId) return { enabled: true as const, ok: false as const, reason: "missing" as const };
      const rows = await sql<ThreadRow>`
        select id, user_id, admin_unread, user_unread, reference_code
        from support_threads where id = ${data.threadId} limit 1
      `;
      if (!rows[0] || !mayReadSupportThread({ viewerId: context.userId, ownerId: rows[0].user_id, staff: true })) {
        return { enabled: true as const, ok: false as const, reason: "missing" as const };
      }
      thread = rows[0];
      sender = supportMessageSender("staff");
    } else {
      const recent = await sql<{ n: number }>`
        select count(*)::int as n from support_messages m
        join support_threads t on t.id = m.thread_id
        where t.user_id = ${context.userId} and m.sender = 'user' and m.created_at > now() - interval '1 hour'
      `;
      if (!supportRateAllows(Number(recent[0]?.n || 0))) {
        return { enabled: true as const, ok: false as const, reason: "limited" as const };
      }
      thread = await ensureThread(sql, context.userId);
      sender = supportMessageSender("member");
    }

    const saved = await insertMessage(sql, {
      threadId: thread.id,
      sender,
      body: data.body,
      key: data.idempotencyKey,
    });
    if (!saved.duplicate && sender === "user") {
      await sql`
        update support_threads
        set updated_at = now(),
            last_user_at = now(),
            admin_unread = admin_unread + 1,
            reference_code = coalesce(${data.reference}, reference_code)
        where id = ${thread.id}
      `;
      const detail = await accountDetail(sql, context.userId, data.reference || thread.reference_code);
      await alertStaff({
        sql,
        threadId: thread.id,
        authorId: context.userId,
        name: detail.name,
        role: detail.role,
      });
    } else if (!saved.duplicate) {
      await sql`
        update support_threads
        set updated_at = now(), last_admin_at = now(), user_unread = user_unread + 1, admin_unread = 0
        where id = ${thread.id}
      `;
    }
    return { enabled: true as const, ok: true as const, id: saved.id, threadId: thread.id, duplicate: saved.duplicate };
  });

export const listLiveSupportInbox = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!liveSupportEnabled()) return { enabled: false as const };
    if (!(await staffUser(context.userId))) return { enabled: true as const, ok: false as const, reason: "forbidden" as const };
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      user_id: string;
      admin_unread: number;
      updated_at: string;
      reference_code: string | null;
      name: string | null;
      role: string | null;
      preview: string | null;
    }>`
      select t.id, t.user_id, t.admin_unread, t.updated_at, t.reference_code,
        u.name, p.role,
        (select body from support_messages m where m.thread_id = t.id order by m.created_at desc limit 1) as preview
      from support_threads t
      left join "user" u on u.id = t.user_id
      left join profiles p on p.user_id = t.user_id
      order by t.updated_at desc
      limit 100
    `;
    return {
      enabled: true as const,
      ok: true as const,
      threads: rows.map((row) => ({
        id: row.id,
        name: String(row.name || "").trim() || "Someone",
        role: supportRoleForAccount({ profileRole: row.role, hasCentre: false }),
        unread: Number(row.admin_unread || 0),
        preview: supportPreview(row.preview || ""),
        reference: row.reference_code,
        updatedAt: String(row.updated_at),
      })),
    };
  });
