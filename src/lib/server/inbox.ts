import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { lookupUser, notifyPlatform } from "./notify";
import type { BookingStatus, Conversation } from "@/lib/types";

async function ownedCentreIds(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const rows = await sql<{ daycare_id: string }>`
    select daycare_id from provider_daycares where user_id = ${userId}
  `.catch(() => [] as { daycare_id: string }[]);
  return rows.map((r) => r.daycare_id);
}

export const listInbox = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const owned = await ownedCentreIds(sql, context.userId);
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
    }>`
      select c.id, c.daycare_id, c.user_id as parent_user_id,
             d.name, d.slug, d.photos, c.last_at, d.phone,
             u.name as parent_name, u.email as parent_email,
             (
               select b.status from bookings b
               where b.conversation_id = c.id
                  or (b.user_id = c.user_id and b.daycare_id = c.daycare_id)
               order by b.created_at desc limit 1
             ) as status
      from conversations c
      join daycares d on d.id = c.daycare_id
      left join "user" u on u.id = c.user_id
      where c.user_id = ${context.userId}
         or c.daycare_id = any(${owned.length ? owned : ["__none__"]})
      order by c.last_at desc
    `.catch(async () => {
      return sql<{
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
      }>`
        select c.id, c.daycare_id, c.user_id as parent_user_id,
               d.name, d.slug, d.photos, c.last_at, d.phone,
               u.name as parent_name, u.email as parent_email,
               null::text as status
        from conversations c
        join daycares d on d.id = c.daycare_id
        left join "user" u on u.id = c.user_id
        where c.user_id = ${context.userId}
        order by c.last_at desc
      `;
    });

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
    const owned = await ownedCentreIds(sql, context.userId);
    const conv = await sql<{
      id: string;
      user_id: string;
      daycare_id: string;
      name: string;
      slug: string;
    }>`
      select c.id, c.user_id, c.daycare_id, d.name, d.slug
      from conversations c
      join daycares d on d.id = c.daycare_id
      where c.id = ${data.conversationId}
        and (c.user_id = ${context.userId} or c.daycare_id = any(${owned.length ? owned : ["__none__"]}))
      limit 1
    `;
    const row = conv[0];
    if (!row) throw new Error("Conversation not found");

    const linked = await sql<{ id: string; status: string }>`
      select id, status from bookings
      where conversation_id = ${row.id}
         or (user_id = ${row.user_id} and daycare_id = ${row.daycare_id})
      order by created_at desc limit 1
    `;
    if (!linked[0]) throw new Error("Message centre opens after a parent requests a spot");
    if (linked[0].status === "declined" || linked[0].status === "cancelled") {
      throw new Error("This enrolment is closed");
    }

    const sender = row.user_id === context.userId ? "parent" : "provider";
    await sql`
      insert into messages (id, conversation_id, sender, body, kind)
      values (${nid("msg")}, ${row.id}, ${sender}, ${body}, ${"chat"})
    `;
    await sql`update conversations set last_at = now() where id = ${row.id}`;

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

    return { ok: true as const, sender };
  });
