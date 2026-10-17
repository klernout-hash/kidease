import { createServerFn } from "@tanstack/react-start";
import type { Sql } from "@/lib/db";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { splitPhotoList } from "@/lib/listing-photo";
import { parsePreferredTimes } from "@/lib/threads";
import type { ConversationDetails, InboxParticipant, InboxParticipantRole } from "@/lib/inbox-thread-ui";
import type { BookingStatus } from "@/lib/types";
import { requireConversationRead } from "./thread-access";

const CREATE_STATE = `
create table if not exists conversation_user_state (
  conversation_id text not null references conversations(id) on delete cascade,
  user_id text not null,
  starred boolean not null default false,
  archived_at timestamptz,
  marked_unread boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
)`;

export async function ensureConversationUserState(sql: Sql) {
  await sql.query(CREATE_STATE).catch(() => undefined);
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "t" || value === "true";
}

function roleOf(raw: string): InboxParticipantRole {
  return raw === "owner" ? "owner" : "staff";
}

export const getConversationDetails = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { conversationId?: string }) => ({
    conversationId: String(input?.conversationId || "").trim(),
  }))
  .handler(async ({ context, data }): Promise<ConversationDetails | null> => {
    if (!data.conversationId) return null;
    const sql = await getSql();
    await ensureConversationUserState(sql);
    let access;
    try {
      access = await requireConversationRead(sql, data.conversationId, context.userId);
    } catch {
      return null;
    }
    const conv = access.conversation;
    const parent = await sql<{ id: string; name: string | null; image: string | null }>`
      select u.id, u.name, u.image
      from "user" u
      where u.id = ${conv.user_id}
      limit 1
    `;
    const members = await sql<{ id: string; name: string | null; image: string | null; role: string }>`
      select u.id, u.name, u.image, m.role
      from centre_members m
      join "user" u on u.id = m.user_id
      where m.daycare_id = ${conv.daycare_id} and m.status = 'active'
    `.catch(() => []);
    const owners = await sql<{ id: string; name: string | null; image: string | null }>`
      select u.id, u.name, u.image
      from provider_daycares p
      join "user" u on u.id = p.user_id
      where p.daycare_id = ${conv.daycare_id}
    `.catch(() => []);

    const people: InboxParticipant[] = [];
    const seen = new Set<string>();
    const push = (id: string, name: string | null, image: string | null, role: InboxParticipantRole) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      people.push({ id, name: (name || "").trim() || "KidEase", image: image || null, role });
    };
    if (parent[0]) push(parent[0].id, parent[0].name, parent[0].image, "parent");
    else push(conv.user_id, "Parent", null, "parent");
    for (const member of members) {
      if (member.id === conv.user_id) continue;
      push(member.id, member.name, member.image, roleOf(member.role));
    }
    for (const owner of owners) {
      if (owner.id === conv.user_id) continue;
      push(owner.id, owner.name, owner.image, "owner");
    }
    people.sort((a, b) => {
      const rank = { parent: 0, owner: 1, staff: 2 };
      return rank[a.role] - rank[b.role];
    });

    const reads = await sql<{ user_id: string; name: string | null; last_read_at: string }>`
      select r.user_id, u.name, r.last_read_at
      from conversation_reads r
      left join "user" u on u.id = r.user_id
      where r.conversation_id = ${conv.id}
    `.catch(() => []);

    const state = await sql<{ starred: boolean | null; archived_at: string | null; marked_unread: boolean | null }>`
      select starred, archived_at, marked_unread
      from conversation_user_state
      where conversation_id = ${conv.id} and user_id = ${context.userId}
      limit 1
    `.catch(() => []);

    const booking = await sql<{
      status: BookingStatus | null;
      start_date: string | null;
      child_name: string | null;
    }>`
      select b.status, b.start_date, ch.name as child_name
      from bookings b
      left join children ch on ch.id = b.child_id
      where b.conversation_id = ${conv.id}
         or (b.user_id = ${conv.user_id} and b.daycare_id = ${conv.daycare_id})
      order by b.created_at desc
      limit 1
    `;
    const tour = await sql<{ status: string | null; preferred_times: string | null; child_name: string | null }>`
      select status, preferred_times, child_name
      from tour_requests
      where conversation_id = ${conv.id}
      order by created_at desc
      limit 1
    `;

    return {
      conversationId: conv.id,
      viewerRole: access.role,
      daycareName: conv.name,
      daycareSlug: conv.slug,
      photo: splitPhotoList(conv.photos)[0] || "",
      childName: booking[0]?.child_name || tour[0]?.child_name || null,
      status: booking[0]?.status ?? null,
      tourStatus: tour[0]?.status ?? null,
      startDate: booking[0]?.start_date ? String(booking[0].start_date).slice(0, 10) : null,
      preferredTimes: parsePreferredTimes(tour[0]?.preferred_times),
      participants: people,
      reads: reads.map((row) => ({
        userId: row.user_id,
        name: (row.name || "").trim(),
        lastReadAt: String(row.last_read_at),
      })),
      starred: flag(state[0]?.starred),
      archived: Boolean(state[0]?.archived_at),
      markedUnread: flag(state[0]?.marked_unread),
    };
  });

export const setConversationUserState = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId?: string; action?: string }) => {
    const action = input?.action === "star" || input?.action === "archive" || input?.action === "unread" ? input.action : "";
    return {
      conversationId: String(input?.conversationId || "").trim(),
      action,
    };
  })
  .handler(async ({ context, data }) => {
    if (!data.conversationId || !data.action) return { ok: false as const };
    const sql = await getSql();
    await ensureConversationUserState(sql);
    try {
      await requireConversationRead(sql, data.conversationId, context.userId);
    } catch {
      return { ok: false as const };
    }
    const current = await sql<{ starred: boolean | null; archived_at: string | null; marked_unread: boolean | null }>`
      select starred, archived_at, marked_unread
      from conversation_user_state
      where conversation_id = ${data.conversationId} and user_id = ${context.userId}
      limit 1
    `;
    const starred = data.action === "star" ? !flag(current[0]?.starred) : flag(current[0]?.starred);
    const markedUnread = data.action === "unread" ? true : flag(current[0]?.marked_unread);
    const archived = data.action === "archive" ? !current[0]?.archived_at : Boolean(current[0]?.archived_at);
    if (archived) {
      await sql`
        insert into conversation_user_state (conversation_id, user_id, starred, marked_unread, archived_at, updated_at)
        values (${data.conversationId}, ${context.userId}, ${starred}, ${markedUnread}, now(), now())
        on conflict (conversation_id, user_id) do update
        set starred = ${starred}, marked_unread = ${markedUnread}, archived_at = now(), updated_at = now()
      `;
    } else {
      await sql`
        insert into conversation_user_state (conversation_id, user_id, starred, marked_unread, archived_at, updated_at)
        values (${data.conversationId}, ${context.userId}, ${starred}, ${markedUnread}, null, now())
        on conflict (conversation_id, user_id) do update
        set starred = ${starred}, marked_unread = ${markedUnread}, archived_at = null, updated_at = now()
      `;
    }
    return { ok: true as const, starred, archived, markedUnread };
  });
