import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  deriveInboxStage,
  deriveTourHold,
  inboxConfirmedDot,
  type CentreInboxThread,
} from "@/lib/inbox-stages";
import { maskInboxPreview } from "@/lib/inbox-secrets";
import { splitPhotoList } from "@/lib/listing-photo";
import { formatAgeLabel } from "@/lib/templates";
import { isClaimVerified } from "@/lib/trust";
import { tourSlaRemainingMs } from "@/lib/today-sla";
import { formatPreferredTimes, parsePreferredTimes } from "@/lib/threads";
import { nid } from "@/lib/utils";
import { lookupUser, notifyPlatform, notifyThreadParty } from "./notify";
import {
  listCentreOwnerEmails,
  markConversationRead,
  requireConversationWrite,
} from "./thread-access";
import type { BookingStatus, Conversation, TourStatus } from "@/lib/types";

export const listInbox = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input?: { view?: "family" | "centre" }) => ({
    view: input?.view === "centre" ? ("centre" as const) : input?.view === "family" ? ("family" as const) : undefined,
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql.query(`alter table conversations add column if not exists staff_note text`).catch(() => undefined);
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
      tour_status: string | null;
      unread: number | null;
      child_birthdate: string | null;
      child_name: string | null;
      schedule: string | null;
      tour_times: string | null;
      conversation_staff_note: string | null;
      tour_staff_note: string | null;
      tour_created_at: string | null;
      tour_hold_expires_at: string | null;
      claim_status: string | null;
      claimed_at: string | null;
      screening_on_file: boolean | number | null;
      financial_flags: unknown;
      schedule_options: unknown;
      provider_replied: number | null;
      has_parent_message: number | null;
      info_count: number | null;
    }>`
      select c.id, c.daycare_id, c.user_id as parent_user_id,
             d.name, d.slug, d.photos, c.last_at, d.phone,
             u.name as parent_name, u.email as parent_email,
             d.claim_status, d.claimed_at, d.screening_on_file,
             d.financial_flags, d.schedule_options,
             c.staff_note as conversation_staff_note,
             (
               select b.status from bookings b
               where b.conversation_id = c.id
                  or (b.user_id = c.user_id and b.daycare_id = c.daycare_id)
               order by b.created_at desc limit 1
             ) as status,
             (
               select t.status from tour_requests t
               where t.conversation_id = c.id
               order by t.created_at desc limit 1
             ) as tour_status,
             (
               select coalesce(ch.birthdate, null) from bookings b
               left join children ch on ch.id = b.child_id
               where b.conversation_id = c.id
                  or (b.user_id = c.user_id and b.daycare_id = c.daycare_id)
               order by b.created_at desc limit 1
             ) as child_birthdate,
             (
               select coalesce(
                 t.child_name,
                 (
                   select ch.name from bookings b
                   left join children ch on ch.id = b.child_id
                   where b.conversation_id = c.id
                   order by b.created_at desc
                   limit 1
                 )
               )
               from tour_requests t
               where t.conversation_id = c.id
               order by t.created_at desc limit 1
             ) as child_name,
             (
               select b.schedule from bookings b
               where b.conversation_id = c.id
                  or (b.user_id = c.user_id and b.daycare_id = c.daycare_id)
               order by b.created_at desc limit 1
             ) as schedule,
             (
               select t.preferred_times from tour_requests t
               where t.conversation_id = c.id
               order by t.created_at desc limit 1
             ) as tour_times,
             (
               select t.centre_note from tour_requests t
               where t.conversation_id = c.id
               order by t.created_at desc limit 1
             ) as tour_staff_note,
             (
               select t.created_at from tour_requests t
               where t.conversation_id = c.id
               order by t.created_at desc limit 1
             ) as tour_created_at,
             (
               select t.hold_expires_at from tour_requests t
               where t.conversation_id = c.id
               order by t.created_at desc limit 1
             ) as tour_hold_expires_at,
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
             ) as unread,
             (
               select case when exists (
                 select 1 from messages m
                 where m.conversation_id = c.id and m.sender = 'provider' and coalesce(m.kind, 'chat') = 'chat'
               ) then 1 else 0 end
             ) as provider_replied,
             (
               select case when exists (
                 select 1 from messages m
                 where m.conversation_id = c.id and m.sender = 'parent' and coalesce(m.kind, 'chat') = 'chat'
               ) then 1 else 0 end
             ) as has_parent_message,
             (
               select count(*)::int from lead_requests l
               where l.conversation_id = c.id and l.kind = 'info'
             ) as info_count
      from conversations c
      join daycares d on d.id = c.daycare_id
      left join "user" u on u.id = c.user_id
      where c.user_id = ${context.userId}
         or exists (
           select 1 from provider_daycares p
           where p.user_id = ${context.userId} and p.daycare_id = c.daycare_id
         )
         or exists (
           select 1 from centre_members m
           where m.user_id = ${context.userId} and m.daycare_id = c.daycare_id and m.status = 'active'
         )
      order by c.last_at desc
    `;

    const out: Conversation[] = [];
    for (const r of rows) {
      const last = await sql<{ body: string }>`
        select body from messages where conversation_id = ${r.id} order by created_at desc limit 1
      `;
      const isParent = r.parent_user_id === context.userId;
      if (data.view === "centre" && isParent) continue;
      if (data.view === "family" && !isParent) continue;
      const lastBody = last[0]?.body ?? "";
      const tourStatus = (r.tour_status as TourStatus | null) ?? null;
      const times = parsePreferredTimes(r.tour_times);
      const remaining =
        tourStatus === "pending" && r.tour_created_at
          ? tourSlaRemainingMs(String(r.tour_created_at), Date.now(), r.tour_hold_expires_at ? String(r.tour_hold_expires_at) : null)
          : null;
      const financial = parseFinancialFlags(r.financial_flags);
      const schedules = parseScheduleOptions(r.schedule_options);
      const childAge = r.child_birthdate ? formatAgeLabel(r.child_birthdate, "en") : null;
      const row: CentreInboxThread = {
        id: r.id,
        daycareId: r.daycare_id,
        daycareName: isParent ? r.name : r.parent_name || r.parent_email || "Parent",
        daycareSlug: r.slug,
        photo: splitPhotoList(r.photos)[0] || "/photos/cottage.jpg",
        lastAt: String(r.last_at),
        lastBody,
        preview: maskInboxPreview(lastBody),
        status: r.status,
        tourStatus,
        phone: r.phone,
        unread: Number(r.unread) > 0,
        parentName: r.parent_name || r.parent_email || "Parent",
        childAgeLabel: childAge,
        programLabel: r.schedule || schedules[0] || null,
        tourDatetime: times.length ? formatPreferredTimes(times, "en") : null,
        tourHold: deriveTourHold({ tourStatus, hasPreferredTimes: times.length > 0 }),
        listingVerified: isClaimVerified({
          claimStatus: r.claim_status,
          claimedAt: r.claimed_at,
        }),
        screeningOnFile: r.screening_on_file === true || r.screening_on_file === 1,
        stage: deriveInboxStage({
          tourStatus,
          bookingStatus: r.status,
          providerReplied: Number(r.provider_replied) > 0,
          hasParentMessage: Number(r.has_parent_message) > 0,
        }),
        slaRemainingMs: remaining,
        slaOverdue: remaining != null && remaining <= 0,
        confirmedDot: inboxConfirmedDot({ tourStatus, bookingStatus: r.status }),
        staffNote: (r.conversation_staff_note || r.tour_staff_note || "").trim() || null,
        subsidyNote: financial.subsidy ? "Provincial subsidy / $10-a-day — ask on tour" : null,
        scheduleNote: schedules.length ? schedules.join(" · ") : null,
        requestInfoCount: Number(r.info_count) || 0,
      };
      out.push(row);
    }
    return out;
  });

function parseFinancialFlags(raw: unknown): { subsidy: boolean } {
  if (!raw || typeof raw !== "object") return { subsidy: false };
  const row = raw as { subsidy?: unknown };
  return { subsidy: row.subsidy === true };
}

function parseScheduleOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item)).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
    } catch {
      return raw.trim() ? [raw.trim()] : [];
    }
  }
  return [];
}

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
      const { requestReplyCopy, requestReplyPath } = await import("@/lib/search-alert-policy");
      const reply = requestReplyCopy(row.name);
      const linkPath = requestReplyPath(row.id);
      await sql`
        insert into search_alert_notices (id, user_id, saved_search_id, daycare_id, kind, title, body, link_path)
        values (
          ${nid("san")}, ${row.user_id}, null, ${row.daycare_id}, ${"request_reply"},
          ${reply.title}, ${reply.body}, ${linkPath}
        )
      `.catch(() => undefined);
    }

    return { ok: true as const, sender };
  });

export const markInboxThreadRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string }) => ({
    conversationId: String(input?.conversationId || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireConversationWrite(sql, data.conversationId, context.userId);
    await markConversationRead(sql, data.conversationId, context.userId);
    return { ok: true as const };
  });

export const saveInboxStaffNote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string; note: string }) => ({
    conversationId: String(input?.conversationId || "").trim(),
    note: String(input?.note || "").trim().slice(0, 500),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const access = await requireConversationWrite(sql, data.conversationId, context.userId);
    if (access.role === "parent") throw new Error("Staff only");
    await sql.query(`alter table conversations add column if not exists staff_note text`).catch(() => undefined);
    await sql`
      update conversations set staff_note = ${data.note || null} where id = ${data.conversationId}
    `;
    return { ok: true as const, note: data.note || null };
  });
