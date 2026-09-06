import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { lookupUser, notifyPlatform, notifyThreadParty } from "./notify";
import { listCentreOwnerEmails, markConversationRead, requireConversationWrite } from "./thread-access";
import type { BookingStatus, Conversation } from "@/lib/types";

export const listInbox = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      parent_user_id: string;
      name: string;
      slug: string;
      photos: string;
      last_at: string;
      phone: string | null;
      parent_name: string | null;
      parent_email: string | null;
      status: BookingStatus | null;
      unread: number | null;
    }>`
      select c.id, c.daycare_id, c.user_id as parent_user_id,
             d.name, d.slug, d.photos, c.last_at, d.phone,
             u.name as parent_name, u.email as parent_email,
             (
               select b.status from bookings b
               where b.conversation_id = c.id
                  or (b.user_id = c.user_id and b.daycare_id = c.daycare_id)
               order by b.created_at desc limit 1
             ) as status,
             (
               select case when exists (
                 select 1 from messages m
                 where m.conversation_id = c.id
                   and m.sender not in ('system')
                   and m.sender <> case when c.user_id = ${context.userId} then 'parent' else 'provider' end
                   and m.created_at > coalesce(
                     (select r.last_read_at from conversation_reads r
                      where r.conversation_id = c.id and r.user_id = ${context.userId}),
                     '1970-01-01'::timestamptz
                   )
               ) then 1 else 0 end
             ) as unread
      from conversations c
      join daycares d on d.id = c.daycare_id
      left join "user" u on u.id = c.user_id
      where c.user_id = ${context.userId}
         or exists (
           select 1 from provider_daycares p
           where p.user_id = ${context.userId} and p.daycare_id = c.daycare_id
         )
      order by c.last_at desc
    `;

    const out: Conversation[] = [];
    for (const r of rows) {
      const last = await sql<{ body: string }>`
        select body from messages where conversation_id = ${r.id} order by created_at desc limit 1
      `;
      const isParent = r.parent_user_id === context.userId;
      out.push({
        id: r.id,
        daycareId: r.daycare_id,
        daycareName: isParent ? r.name : r.parent_name || r.parent_email || "Parent",
        daycareSlug: r.slug,
        photo: (r.photos || "").split(",")[0] || "/photos/cottage.jpg",
        lastAt: String(r.last_at),
        lastBody: last[0]?.body ?? "",
        status: r.status,
        phone: r.phone,
        unread: Number(r.unread) > 0,
      });
    }
    return out;
  });

export const sendConnectedMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string; body: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const body = data.body.trim();
    if (!body) return { ok: false as const };
    const access = await requireConversationWrite(sql, data.conversationId, context.userId);
    const row = access.conversation;

    const sender = access.role === "parent" ? "parent" : "provider";
    await sql`
      insert into messages (id, conversation_id, sender, body, kind)
      values (${nid("msg")}, ${row.id}, ${sender}, ${body}, ${"chat"})
    `;
    await sql`update conversations set last_at = now() where id = ${row.id}`;
    await markConversationRead(sql, row.id, context.userId);

    const actor = await lookupUser(context.userId);
    void notifyPlatform({
      kind: "chat",
      title: sender === "parent" ? `Parent message: ${row.name}` : `Daycare message: ${row.name}`,
      daycareName: row.name,
      slug: row.slug,
      actorName: actor.name,
      actorEmail: actor.email,
      detail: body.slice(0, 400),
    }).catch(() => undefined);

    const origin = process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://kidease.ca";
    const threadUrl = `${origin}/inbox/${row.id}`;
    if (sender === "parent") {
      const owners = await listCentreOwnerEmails(sql, row.daycare_id);
      const extras = (row.contact_email || "").trim();
      const recipients = [...owners];
      if (extras && !recipients.some((r) => r.email.toLowerCase() === extras.toLowerCase())) {
        recipients.push({ email: extras, name: row.name });
      }
      for (const r of recipients) {
        void notifyThreadParty({
          to: r.email,
          name: r.name,
          subject: `New message about ${row.name}`,
          preview: body.slice(0, 240),
          threadUrl,
          daycareName: row.name,
        }).catch(() => undefined);
      }
    } else {
      const parent = await lookupUser(row.user_id);
      void notifyThreadParty({
        to: parent.email,
        name: parent.name,
        subject: `New message from ${row.name}`,
        preview: body.slice(0, 240),
        threadUrl,
        daycareName: row.name,
      }).catch(() => undefined);
    }

    return { ok: true as const, sender };
  });
