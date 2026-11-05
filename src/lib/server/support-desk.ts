import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { supportDeskEnabled, supportSmsReplyEnabled, type EnvMap } from "@/lib/features";
import {
  cleanSupportBody,
  ownerAlertText,
  shouldSendOwnerSms,
  supportPreview,
  supportRateAllows,
  supportRoleLabel,
  handleSupportOwnerReply,
} from "@/lib/support-desk";
import { sendSms } from "@/lib/server/sms";
import { requireSupport } from "@/lib/server/roles";
import { sendTransactionalMail } from "@/lib/transactional-mail";
import { brandedNotice } from "@/lib/email-layout";
import { nid } from "@/lib/utils";

type ThreadRow = {
  id: string;
  user_id: string;
  admin_unread: number;
  user_unread: number;
  last_owner_sms_at: string | null;
  owner_emailed: number;
};

function sendsLive(env: EnvMap = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

async function ensureThread(sql: Sql, userId: string): Promise<ThreadRow> {
  const existing = await sql<ThreadRow>`
    select id, user_id, admin_unread, user_unread, last_owner_sms_at, owner_emailed
    from support_threads where user_id = ${userId} limit 1
  `;
  if (existing[0]) return existing[0];
  const id = nid();
  await sql`
    insert into support_threads (id, user_id) values (${id}, ${userId})
    on conflict (user_id) do nothing
  `;
  const again = await sql<ThreadRow>`
    select id, user_id, admin_unread, user_unread, last_owner_sms_at, owner_emailed
    from support_threads where user_id = ${userId} limit 1
  `;
  return again[0];
}

async function senderFacts(sql: Sql, userId: string) {
  const roleRows = await sql<{ role: string | null }>`select role from profiles where user_id = ${userId} limit 1`;
  const nameRows = await sql<{ name: string | null }>`select name from "user" where id = ${userId} limit 1`.catch(() => []);
  return {
    role: supportRoleLabel(roleRows[0]?.role),
    name: String(nameRows[0]?.name || "").trim() || "Someone",
  };
}

/** Owner text. The phone stays in env and is never returned or logged. */
export async function notifySupportOwner(input: {
  sql: Sql;
  thread: ThreadRow;
  role: ReturnType<typeof supportRoleLabel>;
  name: string;
  body: string;
  nowMs?: number;
  env?: EnvMap;
}) {
  const env = input.env ?? process.env;
  const nowMs = input.nowMs ?? Date.now();
  let emailed = false;
  if (!input.thread.owner_emailed && sendsLive(env)) {
    const to = String(env.ADMIN_EMAIL || env.SUPPORT_INBOX_EMAIL || "").trim();
    if (to) {
      const alert = ownerAlertText({
        role: input.role,
        name: input.name,
        preview: input.body,
        threadId: input.thread.id,
      });
      const html = `<p>${alert.replace(/[&<>]/g, (ch) => (ch === "&" ? "&" : ch === "<" ? "<" : ">"))}</p>`;
      await sendTransactionalMail({
        to,
        purpose: "customer_alert",
        subject: "New KidEase support message",
        text: alert,
        html,
        branded: brandedNotice({
          heading: "New KidEase support message",
          text: alert,
          reason: "You get this because you own KidEase support.",
        }),
      }).catch(() => undefined);
      await input.sql`update support_threads set owner_emailed = 1 where id = ${input.thread.id}`;
      emailed = true;
    }
  }
  const phone = String(env.SUPPORT_ALERT_PHONE || "").trim();
  let sms: "sent" | "batched" | "skipped" = "skipped";
  if (phone && sendsLive(env) && supportDeskEnabled(env) && shouldSendOwnerSms(input.thread.last_owner_sms_at, nowMs)) {
    const result = await sendSms(
      {
        to: phone,
        body: ownerAlertText({
          role: input.role,
          name: input.name,
          preview: supportPreview(input.body),
          threadId: input.thread.id,
        }),
        audience: "internal",
      },
      { operatorAlert: true, env },
    );
    if (result.ok) {
      await input.sql`update support_threads set last_owner_sms_at = now() where id = ${input.thread.id}`;
      sms = "sent";
    }
  } else if (phone && !shouldSendOwnerSms(input.thread.last_owner_sms_at, nowMs)) {
    sms = "batched";
  }
  return { emailed, sms };
}

export const supportDeskStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ enabled: supportDeskEnabled() }));

export const loadSupportDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!supportDeskEnabled()) return { enabled: false as const };
    const sql = await getSql();
    const thread = await ensureThread(sql, context.userId);
    const messages = await sql<{ id: string; sender: string; body: string; created_at: string }>`
      select id, sender, body, created_at from support_messages
      where thread_id = ${thread.id} order by created_at asc limit 200
    `;
    await sql`update support_threads set user_unread = 0 where id = ${thread.id}`;
    return { enabled: true as const, threadId: thread.id, messages };
  });

export const postSupportDesk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { body?: string } | undefined) => ({ body: cleanSupportBody(input?.body || "") }))
  .handler(async ({ context, data }) => {
    if (!supportDeskEnabled()) return { enabled: false as const };
    if (!data.body) return { enabled: true as const, ok: false as const, reason: "empty" as const };
    const sql = await getSql();
    const recent = await sql<{ n: number }>`
      select count(*)::int as n from support_messages m
      join support_threads t on t.id = m.thread_id
      where t.user_id = ${context.userId} and m.sender = 'user' and m.created_at > now() - interval '1 hour'
    `;
    if (!supportRateAllows(Number(recent[0]?.n || 0))) {
      return { enabled: true as const, ok: false as const, reason: "limited" as const };
    }
    const thread = await ensureThread(sql, context.userId);
    const id = nid();
    await sql`
      insert into support_messages (id, thread_id, sender, body) values (${id}, ${thread.id}, 'user', ${data.body})
    `;
    await sql`
      update support_threads
      set updated_at = now(), last_user_at = now(), admin_unread = admin_unread + 1
      where id = ${thread.id}
    `;
    const who = await senderFacts(sql, context.userId);
    const notice = await notifySupportOwner({ sql, thread, role: who.role, name: who.name, body: data.body });
    return { enabled: true as const, ok: true as const, id, notice: { emailed: notice.emailed, sms: notice.sms } };
  });

export const listAdminSupportDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!supportDeskEnabled()) return { enabled: false as const };
    await requireSupport(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; user_id: string; preview: string | null; admin_unread: number; updated_at: string }>`
      select t.id, t.user_id, t.admin_unread, t.updated_at,
        (select body from support_messages m where m.thread_id = t.id order by m.created_at desc limit 1) as preview
      from support_threads t
      order by t.updated_at desc
      limit 100
    `;
    return {
      enabled: true as const,
      threads: rows.map((row) => ({
        id: row.id,
        unread: row.admin_unread > 0,
        preview: supportPreview(row.preview || ""),
        updatedAt: row.updated_at,
      })),
    };
  });

export const replyAdminSupportDesk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { threadId?: string; body?: string } | undefined) => ({
    threadId: String(input?.threadId || "").trim(),
    body: cleanSupportBody(input?.body || ""),
  }))
  .handler(async ({ context, data }) => {
    if (!supportDeskEnabled()) return { enabled: false as const };
    await requireSupport(context.userId);
    if (!data.threadId || !data.body) return { enabled: true as const, ok: false as const };
    const sql = await getSql();
    const found = await sql<{ id: string }>`select id from support_threads where id = ${data.threadId} limit 1`;
    if (!found[0]) return { enabled: true as const, ok: false as const };
    const id = nid();
    await sql`
      insert into support_messages (id, thread_id, sender, body) values (${id}, ${data.threadId}, 'admin', ${data.body})
    `;
    await sql`
      update support_threads
      set updated_at = now(), last_admin_at = now(), user_unread = user_unread + 1, admin_unread = 0
      where id = ${data.threadId}
    `;
    return { enabled: true as const, ok: true as const, id };
  });

/** Owner reply into a support thread. Off unless both support flags are on. Does not store the phone. */
export async function maybeRecordSupportOwnerReply(body: string): Promise<boolean> {
  if (!supportSmsReplyEnabled()) return false;
  const sql = await getSql();
  const threads = await sql<{ id: string }>`select id from support_threads order by updated_at desc limit 20`;
  const result = handleSupportOwnerReply({ flagOn: true, signatureOk: true, body, threads });
  if (!result.threadId || !result.text) return false;
  await sql`
    insert into support_messages (id, thread_id, sender, body)
    values (${nid()}, ${result.threadId}, 'admin', ${result.text})
  `;
  await sql`
    update support_threads set updated_at = now(), last_admin_at = now(), user_unread = user_unread + 1
    where id = ${result.threadId}
  `;
  return true;
}
