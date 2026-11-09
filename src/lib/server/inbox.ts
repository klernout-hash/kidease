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
import { customerAlertSummary, sameMailbox } from "@/lib/customer-alert-policy";
import { QA_TOUR_CENTRE_ID, QA_TOUR_CENTRE_SLUG } from "@/lib/qa-tour-access";
import { chatBodyWithoutSmsFooter, daycareReplySms, parentMessageSms } from "@/lib/sms-copy";
import { messageAlertFor, notificationSourceKey } from "@/lib/notifications";
import { saveParentInAppNotice } from "@/lib/server/parent-notice";
import { nid } from "@/lib/utils";
import { ClientInputError } from "@/lib/observe";
import { lookupUser, notifyPlatform, notifyThreadParty } from "./notify";
import {
  listCentreOwnerEmails,
  markConversationRead,
  requireConversationWrite,
} from "./thread-access";
import type { BookingStatus, Conversation, TourStatus } from "@/lib/types";

async function savedMessageLocale(sql: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<"en" | "fr"> {
  const rows = await sql<{ locale: string | null }>`
    select locale from profiles where user_id = ${userId} limit 1
  `.catch(() => [] as Array<{ locale: string | null }>);
  return String(rows[0]?.locale || "").toLowerCase().startsWith("fr") ? "fr" : "en";
}

export const listInbox = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input?: { view?: "family" | "centre" }) => ({
    view: input?.view === "centre" ? ("centre" as const) : input?.view === "family" ? ("family" as const) : undefined,
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { familyScopeFor } = await import("@/lib/server/coparent");
    const parentId = (await familyScopeFor(context.userId)).dataUserId;
    const view = data.view ?? "all";
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
      starred: boolean | null;
      archived_at: string | null;
      marked_unread: boolean | null;
      member_names: string | null;
      start_date: string | null;
      last_body: string | null;
      last_sender: string | null;
    }>`
      select c.id, c.daycare_id, c.user_id as parent_user_id,
             d.name, d.slug, d.photos, c.last_at, d.phone,
             u.name as parent_name, u.email as parent_email,
             d.claim_status, d.claimed_at, d.screening_on_file,
             d.financial_flags, d.schedule_options,
             c.staff_note as conversation_staff_note,
             s.starred as starred,
             s.archived_at as archived_at,
             s.marked_unread as marked_unread,
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
               select case
                 when coalesce(s.marked_unread, false) then 1
                 when exists (
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
             ) as info_count,
             (
               select b.start_date from bookings b
               where b.conversation_id = c.id
                  or (b.user_id = c.user_id and b.daycare_id = c.daycare_id)
               order by b.created_at desc limit 1
             ) as start_date,
             (
               select string_agg(name, ', ')
               from (
                 select u2.name as name
                 from centre_members m
                 join "user" u2 on u2.id = m.user_id
                 where m.daycare_id = c.daycare_id and m.status = 'active' and m.user_id <> c.user_id
                 order by case m.role when 'owner' then 0 when 'manager' then 1 else 2 end, u2.name
                 limit 3
               ) members
             ) as member_names,
             lm.body as last_body,
             lm.sender as last_sender
      from conversations c
      join daycares d on d.id = c.daycare_id
      left join "user" u on u.id = c.user_id
      left join conversation_user_state s
        on s.conversation_id = c.id and s.user_id = ${context.userId}
      left join lateral (
        select m.body, m.sender
        from messages m
        where m.conversation_id = c.id
          and m.sender <> 'system'
          and coalesce(m.kind, 'chat') = 'chat'
        order by m.created_at desc
        limit 1
      ) lm on true
      where (
          ${view} <> 'centre' and c.user_id = ${parentId}
        )
        or (
          ${view} <> 'family'
          and c.user_id <> ${parentId}
          and (
            exists (
              select 1 from provider_daycares p
              where p.user_id = ${context.userId} and p.daycare_id = c.daycare_id
            )
            or exists (
              select 1 from centre_members m
              where m.user_id = ${context.userId} and m.daycare_id = c.daycare_id and m.status = 'active'
            )
          )
          and (
            c.user_id = ${context.userId}
            or exists (
              select 1 from centre_members m
              where m.user_id = ${context.userId} and m.daycare_id = c.daycare_id and m.status = 'active'
                and m.role in ('owner', 'manager')
            )
            or exists (
              select 1 from provider_daycares p
              where p.user_id = ${context.userId} and p.daycare_id = c.daycare_id
            )
            or c.assigned_user_id is null
            or c.assigned_user_id = ${context.userId}
          )
        )
      order by c.last_at desc
      limit 50
    `;

    const out: Conversation[] = [];
    for (const r of rows) {
      const lastBody = r.last_body ?? "";
      const lastSender = r.last_sender ?? null;
      const isParent = r.parent_user_id === parentId;
      if (data.view === "centre" && isParent) continue;
      if (data.view === "family" && !isParent) continue;
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
        daycareName: isParent ? r.name : (r.parent_name || "").trim() || "Parent",
        daycareSlug: r.slug,
        photo: splitPhotoList(r.photos)[0] || "/photos/cottage.jpg",
        lastAt: String(r.last_at),
        lastBody,
        preview: maskInboxPreview(lastBody),
        status: r.status,
        tourStatus,
        phone: r.phone,
        unread: Number(r.unread) > 0,
        parentName: (r.parent_name || "").trim() || "Parent",
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
        subsidyNote: financial.subsidy ? "Provincial subsidy / $10-a-day: ask on tour" : null,
        scheduleNote: schedules.length ? schedules.join(" · ") : null,
        requestInfoCount: Number(r.info_count) || 0,
        centreName: r.name,
        memberNames: r.member_names,
        lastSender,
        archived: Boolean(r.archived_at),
        starred: r.starred === true || Number(r.starred) === 1,
        startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
        childName: r.child_name,
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
  .validator((input: { conversationId: string; body: string } | undefined) => {
    if (!input?.conversationId) throw new ClientInputError();
    return input;
  })
  .handler(async ({ context, data }) => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("message");
    const { assertFacebookContactEmail } = await import("@/lib/server/facebook-contact");
    await assertFacebookContactEmail(context.userId);
    const sql = await getSql();
    const body = chatBodyWithoutSmsFooter(data.body);
    if (!body) return { ok: false as const };
    const access = await requireConversationWrite(sql, data.conversationId, context.userId);
    const row = access.conversation;
    const { assertChatNotBlocked } = await import("@/lib/server/safety");
    try {
      await assertChatNotBlocked(sql, {
        senderId: context.userId,
        parentUserId: row.user_id,
        daycareId: row.daycare_id,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "safety_blocked") {
        return { ok: false as const, blocked: true as const };
      }
      throw err;
    }

    const sender = access.role === "parent" ? "parent" : "provider";
    const prior = await sql<{ last_at: string }>`select last_at from conversations where id = ${row.id} limit 1`;
    const priorAt = String(prior[0]?.last_at || "");
    const messageId = nid("msg");
    await sql`
      insert into messages (id, conversation_id, sender, body, kind)
      values (${messageId}, ${row.id}, ${sender}, ${body}, ${"chat"})
    `;
    await sql`update conversations set last_at = now() where id = ${row.id}`;
    await markConversationRead(sql, row.id, context.userId);

    const actor = await lookupUser(context.userId);
    const hiddenQa = row.daycare_id === QA_TOUR_CENTRE_ID || row.slug === QA_TOUR_CENTRE_SLUG;
    if (hiddenQa) return { ok: true as const, sender };
    void import("@/lib/server/admin-tools")
      .then((mod) => mod.maybeQueueSpam({ kind: "message", text: body, email: actor.email, sourceId: row.id }))
      .catch(() => undefined);
    void import("@/lib/server/engagement")
      .then((mod) =>
        mod.noteSentMessage({
          messageId,
          sender,
          actorId: context.userId,
          centreId: row.daycare_id,
          threadId: row.id,
          conversationUserId: row.user_id,
          priorAt,
        }),
      )
      .catch(() => undefined);
    void import("@/lib/server/unified-alerts")
      .then((mod) =>
        mod.emitMessageAlert({
          messageId,
          sender,
          parentUserId: row.user_id,
          daycareId: row.daycare_id,
          centreName: "",
        }),
      )
      .catch(() => undefined);
    if (sender === "parent") {
      void import("@/lib/server/sms-notify")
        .then((mod) => mod.notifyCentreSms({ daycareId: row.daycare_id, body: parentMessageSms(row.name) }))
        .catch(() => undefined);
    } else {
      void import("@/lib/server/sms-notify")
        .then((mod) => mod.notifyConsentedUserSms({ userId: row.user_id, body: daycareReplySms(row.name) }))
        .catch(() => undefined);
    }

    void notifyPlatform({
      kind: "chat",
      title: sender === "parent" ? `Parent message: ${row.name}` : `Daycare message: ${row.name}`,
      daycareName: row.name,
      slug: row.slug,
      actorName: actor.name,
      actorEmail: actor.email,
      detail: "A message was sent. The note stays in the thread.",
    }).catch(() => undefined);

    const origin = process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://kidease.ca";
    const threadUrl = `${origin}/inbox/${row.id}`;
    const { dispatchCustomerAlert } = await import("@/lib/server/alert-dispatch");
    if (sender === "parent") {
      const owners = await listCentreOwnerEmails(sql, row.daycare_id);
      const extras = (row.contact_email || "").trim();
      const recipients = [...owners];
      if (extras && !recipients.some((r) => r.email.toLowerCase() === extras.toLowerCase())) {
        recipients.push({ email: extras, name: row.name });
      }
      for (const r of recipients) {
        if (sameMailbox(actor.email, r.email)) continue;
        const centreLocale = r.userId ? await savedMessageLocale(sql, r.userId) : "en";
        const centreMail = customerAlertSummary({ kind: "message", centreName: row.name, locale: centreLocale });
        void notifyThreadParty({
          to: r.email,
          name: r.name,
          subject: centreMail.subject,
          preview: centreMail.preview,
          threadUrl,
          daycareName: row.name,
        }).catch(() => undefined);
        if (r.userId) {
          const alert = messageAlertFor({ senderId: context.userId, recipientId: r.userId });
          if (alert) {
            await saveParentInAppNotice(sql, {
              userId: alert.userId,
              kind: alert.kind,
              titleKey: alert.titleKey,
              href: `/inbox/${row.id}?view=centre&detail=1`,
              sourceKey: notificationSourceKey("inbox", messageId, "incoming"),
              daycareName: row.name,
              status: "unread",
            });
          }
          void dispatchCustomerAlert({
            userId: r.userId,
            category: "message",
            vars: { name: row.name },
            href: `/inbox/${row.id}?view=centre&detail=1`,
            dedupeKey: `message:${messageId}:${r.userId}`,
            emailFallback: false,
          });
        }
      }
    } else {
      const alert = messageAlertFor({ senderId: context.userId, recipientId: row.user_id });
      if (alert) {
        await saveParentInAppNotice(sql, {
          userId: alert.userId,
          kind: alert.kind,
          titleKey: alert.titleKey,
          href: `/inbox/${row.id}`,
          sourceKey: notificationSourceKey("inbox", messageId, "reply"),
          daycareName: row.name,
          status: "unread",
        });
      }
      const parent = await lookupUser(row.user_id);
      if (!sameMailbox(actor.email, parent.email)) {
        const parentLocale = await savedMessageLocale(sql, row.user_id);
        const parentMail = customerAlertSummary({ kind: "message", centreName: row.name, locale: parentLocale });
        void notifyThreadParty({
          to: parent.email,
          name: parent.name,
          subject: parentMail.subject,
          preview: parentMail.preview,
          threadUrl,
          daycareName: row.name,
        }).catch(() => undefined);
      }
      void dispatchCustomerAlert({
        userId: row.user_id,
        category: "message",
        vars: { name: row.name },
        href: `/inbox/${row.id}`,
        dedupeKey: `message:${messageId}:${row.user_id}`,
        emailFallback: false,
      });
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
    await sql`
      update conversations set staff_note = ${data.note || null} where id = ${data.conversationId}
    `;
    return { ok: true as const, note: data.note || null };
  });
