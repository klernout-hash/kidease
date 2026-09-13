import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { catalogByIdGet } from "@/lib/catalog";
import { isAdminOnlyListing } from "@/lib/listing-visibility";
import { callerIsAdmin } from "@/lib/server/public-listing";
import { upsertDaycare } from "@/lib/server/seed";
import { centreCanAcceptInquiry } from "@/lib/server/provider-entitlements";
import { lookupUser, notifyPlatform, notifyThreadParty } from "@/lib/server/notify";
import { notifyTourParties, syncLeadFromTour } from "@/lib/server/tour-hold-notify";
import {
  listCentreOwnerEmails,
  markConversationRead,
  requireConversationRead,
} from "@/lib/server/thread-access";
import {
  formatPreferredTimes,
  nextTourStatus,
  parsePreferredTimes,
  preferredTimesValid,
  serializePreferredTimes,
  tourRescheduleBody,
  tourStatusBody,
  tourSystemBody,
  type PreferredTime,
} from "@/lib/threads";
import { canProposeTourTime, declineReasonValid, holdExpiresAtIso } from "@/lib/tour-hold";
import { nextTourPipeline, tourStatusFromBooking } from "@/lib/tour-pipeline";
import { isTourWindowBookable, remainingTourSeats, toPublicTourSlot } from "@/lib/tour-calendar";
import type { BookingStatus, TourRequest, TourStatus } from "@/lib/types";

type TourRow = {
  id: string;
  conversation_id: string;
  daycare_id: string;
  daycare_name: string;
  slug: string;
  child_id: string | null;
  child_name: string | null;
  parent_name: string | null;
  preferred_times: string;
  parent_note: string | null;
  status: TourStatus;
  centre_note: string | null;
  created_at: string;
  responded_at: string | null;
  window_id?: string | null;
  hold_expires_at?: string | Date | null;
  parent_first_name?: string | null;
  parent_last_name?: string | null;
  parent_phone?: string | null;
  contact_email?: string | null;
};

function guestParentName(row: TourRow): string | null {
  const fromUser = (row.parent_name || "").trim();
  if (fromUser) return fromUser;
  const assembled = `${row.parent_first_name || ""} ${row.parent_last_name || ""}`.trim();
  return assembled || null;
}

function mapTour(row: TourRow): TourRequest {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    daycareId: row.daycare_id,
    daycareName: row.daycare_name,
    daycareSlug: row.slug,
    childId: row.child_id,
    childName: row.child_name,
    parentName: guestParentName(row),
    preferredTimes: parsePreferredTimes(row.preferred_times),
    parentNote: row.parent_note,
    status: row.status,
    centreNote: row.centre_note,
    createdAt: String(row.created_at),
    respondedAt: row.responded_at ? String(row.responded_at) : null,
    windowId: row.window_id ?? null,
    holdExpiresAt: row.hold_expires_at ? String(row.hold_expires_at) : null,
    parentPhone: row.parent_phone ?? null,
    parentEmail: row.contact_email ?? null,
  };
}

async function ensureConversation(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  daycareId: string,
) {
  const existing = await sql<{ id: string }>`
    select id from conversations where user_id = ${userId} and daycare_id = ${daycareId} limit 1
  `;
  if (existing[0]) return existing[0].id;
  const id = nid("cv");
  await sql`insert into conversations (id, user_id, daycare_id) values (${id}, ${userId}, ${daycareId})`;
  return id;
}

export async function listToursForConversation(
  sql: Awaited<ReturnType<typeof getSql>>,
  conversationId: string,
): Promise<TourRequest[]> {
  const rows = await sql<TourRow>`
    select t.id, t.conversation_id, t.daycare_id, d.name as daycare_name, d.slug,
           t.child_id, t.child_name, u.name as parent_name, t.preferred_times,
           t.parent_note, t.status, t.centre_note, t.created_at, t.responded_at,
           t.window_id, t.hold_expires_at, t.parent_first_name, t.parent_last_name, t.parent_phone, t.contact_email
    from tour_requests t
    join daycares d on d.id = t.daycare_id
    left join "user" u on u.id = t.user_id
    where t.conversation_id = ${conversationId}
    order by t.created_at desc
  `.catch(() => []);
  return rows.map(mapTour);
}

export const createTourRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      preferredTimes: PreferredTime[];
      childId?: string;
      childName?: string;
      note?: string;
      locale?: "en" | "fr";
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const times = parsePreferredTimes(data.preferredTimes);
    if (!preferredTimesValid(times)) throw new Error("Pick at least one preferred time");

    const sql = await getSql();
    const listed = await catalogByIdGet(data.daycareId);
    if (isAdminOnlyListing(listed ?? { id: data.daycareId }) && !(await callerIsAdmin())) {
      throw new Error("Listing not found");
    }
    if (listed) await upsertDaycare(sql, listed);

    const daycares = await sql<{
      id: string;
      name: string;
      slug: string;
      address: string | null;
      city: string | null;
      province: string | null;
      contact_email: string | null;
    }>`
      select id, name, slug, address, city, province, contact_email
      from daycares where id = ${data.daycareId} limit 1
    `;
    const d = daycares[0];
    if (!d) throw new Error("Centre not found");

    let childId = (data.childId || "").trim();
    let childName = (data.childName || "").trim();
    if (childId) {
      const owned = await sql<{ id: string; name: string }>`
        select id, name from children where id = ${childId} and user_id = ${context.userId} limit 1
      `;
      if (!owned[0]) {
        childId = "";
      } else {
        childName = childName || owned[0].name;
      }
    }

    const gate = await centreCanAcceptInquiry(sql, data.daycareId);
    if (!gate.ok) throw new Error(gate.error);
    const cid = await ensureConversation(sql, context.userId, data.daycareId);
    const tourId = nid("tr");
    const note = (data.note || "").trim() || null;
    const locale = data.locale === "fr" ? "fr" : "en";
    const actor = await lookupUser(context.userId);
    const parentName = (actor.name || "A parent").trim() || "A parent";

    await sql`
      insert into tour_requests (
        id, conversation_id, user_id, daycare_id, child_id, child_name,
        preferred_times, parent_note, status, hold_expires_at
      ) values (
        ${tourId}, ${cid}, ${context.userId}, ${data.daycareId},
        ${childId || null}, ${childName || null},
        ${serializePreferredTimes(times)}, ${note}, ${"pending"}, ${holdExpiresAtIso()}
      )
    `;
    try {
      const { recordLeadRequest } = await import("@/lib/server/lead-requests");
      await recordLeadRequest(sql, {
        userId: context.userId,
        daycareId: data.daycareId,
        kind: "tour",
        message: note,
        sourceKind: "tour_request",
        sourceId: tourId,
        conversationId: cid,
        notify: false,
      });
    } catch (err) {
      console.error("[kidease-lead] tour lead skipped", err);
    }

    const systemBody = tourSystemBody({
      parentName,
      childName,
      daycareName: d.name,
      times,
      note,
      locale,
    });
    await sql`
      insert into messages (id, conversation_id, sender, body, kind)
      values (${nid("msg")}, ${cid}, ${"system"}, ${systemBody}, ${"system"})
    `;
    await sql`update conversations set last_at = now() where id = ${cid}`;

    const slots = formatPreferredTimes(times, locale);
    const detail = [
      childName ? `Child: ${childName}` : "",
      `Preferred times: ${slots}`,
      note ? `Note: ${note}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await notifyPlatform({
        kind: "tour_request",
        title: `Tour request: ${d.name}`,
        daycareName: d.name,
        address: d.address ?? undefined,
        city: d.city ?? undefined,
        province: d.province ?? undefined,
        slug: d.slug,
        actorName: parentName,
        actorEmail: actor.email,
        detail,
      });
    } catch (err) {
      console.error("[kidease-mail] tour request notify failed", err);
    }

    const owners = await listCentreOwnerEmails(sql, data.daycareId);
    const extras = (d.contact_email || "").trim();
    const recipients = [...owners];
    if (extras && !recipients.some((r) => r.email.toLowerCase() === extras.toLowerCase())) {
      recipients.push({ email: extras, name: d.name });
    }
    const origin = process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://kidease.ca";
    const threadUrl = `${origin}/inbox/${cid}`;
    await Promise.all(
      recipients.map((r) =>
        notifyThreadParty({
          to: r.email,
          name: r.name,
          subject: `Tour request for ${d.name}`,
          preview: `${parentName} asked to tour ${d.name}. ${slots}`,
          threadUrl,
          daycareName: d.name,
        }).catch(() => undefined),
      ),
    );

    return { id: tourId, conversationId: cid, status: "pending" as const };
  });

export const listTourRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input?: { desk?: "parent" | "centre" }) => input ?? {})
  .handler(async ({ context, data }) => {
    await import("@/lib/server/tour-holds")
      .then((mod) => mod.expireDueTourHolds({ notify: true }))
      .catch(() => undefined);
    const sql = await getSql();
    const asParent = data.desk !== "centre";
    const asCentre = data.desk !== "parent";
    const rows = await sql<TourRow>`
      select t.id, t.conversation_id, t.daycare_id, d.name as daycare_name, d.slug,
             t.child_id, t.child_name, u.name as parent_name, t.preferred_times,
             t.parent_note, t.status, t.centre_note, t.created_at, t.responded_at,
             t.window_id, t.hold_expires_at, t.parent_first_name, t.parent_last_name, t.parent_phone, t.contact_email
      from tour_requests t
      join daycares d on d.id = t.daycare_id
      left join "user" u on u.id = t.user_id
      where (
          t.user_id = ${context.userId}
          and ${asParent}
        )
         or (
          ${asCentre}
          and (
            exists (
              select 1 from provider_daycares p
              where p.user_id = ${context.userId} and p.daycare_id = t.daycare_id
            )
            or exists (
              select 1 from centre_members m
              where m.user_id = ${context.userId} and m.daycare_id = t.daycare_id and m.status = 'active'
            )
         )
      )
      order by t.created_at desc
    `.catch(() => []);
    return rows.map(mapTour);
  });

export const respondTourRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { tourId: string; status: "accepted" | "declined"; note?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      status: string;
      conversation_id: string;
      user_id: string;
      daycare_id: string;
      daycare_name: string;
      slug: string;
      contact_email: string | null;
      parent_first_name: string | null;
      parent_last_name: string | null;
    }>`
      select t.id, t.status, t.conversation_id, t.user_id, t.daycare_id, d.name as daycare_name, d.slug,
             t.contact_email, t.parent_first_name, t.parent_last_name
      from tour_requests t
      join daycares d on d.id = t.daycare_id
      where t.id = ${data.tourId}
      limit 1
    `.catch(() => []);
    const tour = rows[0];
    if (!tour) throw new Error("Tour request not found");

    const { canCentreWriteLeadsFor } = await import("@/lib/server/centre-access");
    const owned = await canCentreWriteLeadsFor(sql, context.userId, tour.daycare_id);
    if (!owned) throw new Error("Not authorized");

    const next = nextTourStatus(tour.status, data.status);
    if (!next || (next !== "accepted" && next !== "declined")) throw new Error("This tour request was already answered");

    const note = (data.note || "").trim() || null;
    if (next === "declined" && !declineReasonValid(note)) {
      throw new Error("Add a reason so the parent knows why this tour was declined");
    }
    await sql`
      update tour_requests
      set status = ${next},
          centre_note = ${note},
          responded_by = ${context.userId},
          responded_at = now(),
          hold_expires_at = null
      where id = ${tour.id}
    `;

    const body = tourStatusBody({
      status: next,
      daycareName: tour.daycare_name,
      note,
    });
    await sql`
      insert into messages (id, conversation_id, sender, body, kind)
      values (${nid("msg")}, ${tour.conversation_id}, ${"system"}, ${body}, ${"status"})
    `;
    await sql`update conversations set last_at = now() where id = ${tour.conversation_id}`;
    await markConversationRead(sql, tour.conversation_id, context.userId);
    await syncLeadFromTour(sql, tour.id, next);

    const guestName = `${tour.parent_first_name || ""} ${tour.parent_last_name || ""}`.trim();
    await notifyTourParties(sql, {
      conversationId: tour.conversation_id,
      daycareId: tour.daycare_id,
      daycareName: tour.daycare_name,
      parentUserId: tour.user_id,
      parentEmail: tour.contact_email,
      parentName: guestName || null,
      subject: next === "accepted" ? `Tour confirmed — ${tour.daycare_name}` : `Tour declined — ${tour.daycare_name}`,
      preview: body,
    }).catch(() => undefined);

    try {
      const actor = await lookupUser(context.userId);
      await notifyPlatform({
        kind: "tour_request",
        title: next === "accepted" ? `Tour accepted: ${tour.daycare_name}` : `Tour declined: ${tour.daycare_name}`,
        daycareName: tour.daycare_name,
        slug: tour.slug,
        actorName: actor.name,
        actorEmail: actor.email,
        detail: note || next,
      });
    } catch {
      /* admin mail is best-effort */
    }

    return { ok: true as const, status: next, conversationId: tour.conversation_id };
  });

export const proposeTourTime = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { tourId: string; windowId: string; note?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await import("@/lib/server/tour-holds")
      .then((mod) => mod.expireDueTourHolds({ notify: true }))
      .catch(() => undefined);

    const rows = await sql<{
      id: string;
      status: string;
      conversation_id: string;
      user_id: string;
      daycare_id: string;
      daycare_name: string;
      slug: string;
      window_id: string | null;
      contact_email: string | null;
      parent_first_name: string | null;
      parent_last_name: string | null;
    }>`
      select t.id, t.status, t.conversation_id, t.user_id, t.daycare_id, d.name as daycare_name, d.slug,
             t.window_id, t.contact_email, t.parent_first_name, t.parent_last_name
      from tour_requests t
      join daycares d on d.id = t.daycare_id
      where t.id = ${data.tourId}
      limit 1
    `.catch(() => []);
    const tour = rows[0];
    if (!tour) throw new Error("Tour request not found");
    if (!canProposeTourTime(tour.status)) throw new Error("This tour cannot be rescheduled");

    const { canCentreWriteLeadsFor } = await import("@/lib/server/centre-access");
    const owned = await canCentreWriteLeadsFor(sql, context.userId, tour.daycare_id);
    if (!owned) throw new Error("Not authorized");

    const windowId = (data.windowId || "").trim();
    if (!windowId || windowId === tour.window_id) throw new Error("Pick a different posted tour time");

    const windows = await sql<{
      id: string;
      daycare_id: string;
      window_date: string | Date;
      start_time: string;
      end_time: string;
      capacity: number;
      timezone: string;
      start_at: string | Date;
      booked: number;
    }>`
      select w.id, w.daycare_id, w.window_date, w.start_time, w.end_time, w.capacity, w.timezone, w.start_at,
             coalesce((
               select count(*)::int from tour_requests t
               where t.window_id = w.id and t.status in ('pending', 'accepted') and t.id <> ${tour.id}
             ), 0) as booked
      from tour_windows w
      where w.id = ${windowId} and w.daycare_id = ${tour.daycare_id}
      limit 1
    `.catch(() => []);
    const window = windows[0];
    const slot = window
      ? toPublicTourSlot({
          id: window.id,
          date: window.window_date,
          startTime: window.start_time,
          endTime: window.end_time,
          capacity: window.capacity,
          booked: window.booked,
          timezone: window.timezone,
          startAt: window.start_at,
        })
      : null;
    if (!slot) throw new Error("That tour time is no longer available.");
    if (!isTourWindowBookable(slot, slot.timezone)) throw new Error("That tour time is no longer available.");
    if (remainingTourSeats(slot.capacity, slot.booked) < 1) throw new Error("That tour time is full. Pick another.");

    const times: PreferredTime[] = [{ date: slot.date, time: slot.startTime }];
    const note = (data.note || "").trim() || null;
    const staysPending = tour.status === "pending";
    await sql`
      update tour_requests
      set window_id = ${slot.id},
          preferred_times = ${serializePreferredTimes(times)},
          centre_note = coalesce(${note}, centre_note),
          hold_expires_at = ${staysPending ? holdExpiresAtIso() : null},
          responded_by = ${context.userId},
          responded_at = coalesce(responded_at, now())
      where id = ${tour.id}
    `;

    const body = tourRescheduleBody({ daycareName: tour.daycare_name, times, note });
    await sql`
      insert into messages (id, conversation_id, sender, body, kind)
      values (${nid("msg")}, ${tour.conversation_id}, ${"system"}, ${body}, ${"status"})
    `;
    await sql`update conversations set last_at = now() where id = ${tour.conversation_id}`;
    await markConversationRead(sql, tour.conversation_id, context.userId);
    await syncLeadFromTour(sql, tour.id, tour.status);

    const guestName = `${tour.parent_first_name || ""} ${tour.parent_last_name || ""}`.trim();
    await notifyTourParties(sql, {
      conversationId: tour.conversation_id,
      daycareId: tour.daycare_id,
      daycareName: tour.daycare_name,
      parentUserId: tour.user_id,
      parentEmail: tour.contact_email,
      parentName: guestName || null,
      subject: `Tour time updated — ${tour.daycare_name}`,
      preview: body,
    }).catch(() => undefined);

    return { ok: true as const, conversationId: tour.conversation_id, windowId: slot.id, times };
  });

export const cancelTourRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { tourId: string; note?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      status: string;
      conversation_id: string;
      user_id: string;
      daycare_id: string;
      daycare_name: string;
      slug: string;
      contact_email: string | null;
      parent_first_name: string | null;
      parent_last_name: string | null;
    }>`
      select t.id, t.status, t.conversation_id, t.user_id, t.daycare_id, d.name as daycare_name, d.slug,
             t.contact_email, t.parent_first_name, t.parent_last_name
      from tour_requests t
      join daycares d on d.id = t.daycare_id
      where t.id = ${data.tourId}
      limit 1
    `.catch(() => []);
    const tour = rows[0];
    if (!tour) throw new Error("Tour request not found");

    const { canCentreWriteLeadsFor } = await import("@/lib/server/centre-access");
    const owned = await canCentreWriteLeadsFor(sql, context.userId, tour.daycare_id);
    const isParent = tour.user_id === context.userId;
    if (!owned && !isParent) throw new Error("Not authorized");

    const next = nextTourStatus(tour.status, "lost");
    if (!next) throw new Error("This tour cannot be cancelled");

    const note = (data.note || "").trim() || null;
    await sql`
      update tour_requests
      set status = ${next},
          centre_note = coalesce(${note}, centre_note),
          responded_by = ${context.userId},
          responded_at = coalesce(responded_at, now())
      where id = ${tour.id}
    `;

    const body = tourStatusBody({ status: next, daycareName: tour.daycare_name, note });
    await sql`
      insert into messages (id, conversation_id, sender, body, kind)
      values (${nid("msg")}, ${tour.conversation_id}, ${"system"}, ${body}, ${"status"})
    `;
    await sql`update conversations set last_at = now() where id = ${tour.conversation_id}`;
    await markConversationRead(sql, tour.conversation_id, context.userId);
    await syncLeadFromTour(sql, tour.id, next);

    const guestName = `${tour.parent_first_name || ""} ${tour.parent_last_name || ""}`.trim();
    await notifyTourParties(sql, {
      conversationId: tour.conversation_id,
      daycareId: tour.daycare_id,
      daycareName: tour.daycare_name,
      parentUserId: tour.user_id,
      parentEmail: tour.contact_email,
      parentName: guestName || null,
      subject: `Tour cancelled — ${tour.daycare_name}`,
      preview: body,
    }).catch(() => undefined);

    return { ok: true as const, status: next, conversationId: tour.conversation_id };
  });

export const getThreadTours = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((conversationId: string) => conversationId)
  .handler(async ({ context, data: conversationId }) => {
    const sql = await getSql();
    await requireConversationRead(sql, conversationId, context.userId);
    return listToursForConversation(sql, conversationId);
  });

export async function syncToursFromBooking(
  sql: Awaited<ReturnType<typeof getSql>>,
  conversationId: string | null,
  bookingStatus: BookingStatus,
) {
  if (!conversationId) return;
  const next = tourStatusFromBooking(bookingStatus);
  if (!next) return;
  const rows = await sql<{ id: string; status: string }>`
    select id, status from tour_requests
    where conversation_id = ${conversationId}
    order by created_at desc
  `.catch(() => []);
  for (const row of rows) {
    if (!nextTourPipeline(row.status, next) && row.status !== next) {
      if (next === "enrolled" && (row.status === "accepted" || row.status === "completed" || row.status === "pending")) {
        /* fall through */
      } else if (next === "lost" && (row.status === "pending" || row.status === "accepted" || row.status === "completed")) {
        /* fall through */
      } else {
        continue;
      }
    }
    await sql`
      update tour_requests
      set status = ${next}, responded_at = coalesce(responded_at, now())
      where id = ${row.id} and status <> ${next}
    `.catch(() => undefined);
  }
}

export const advanceTourRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { tourId: string; status: "completed" | "enrolled" | "lost"; note?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      status: string;
      conversation_id: string;
      user_id: string;
      daycare_id: string;
      daycare_name: string;
      slug: string;
    }>`
      select t.id, t.status, t.conversation_id, t.user_id, t.daycare_id, d.name as daycare_name, d.slug
      from tour_requests t
      join daycares d on d.id = t.daycare_id
      where t.id = ${data.tourId}
      limit 1
    `.catch(() => []);
    const tour = rows[0];
    if (!tour) throw new Error("Tour request not found");

    const { canCentreWriteLeadsFor } = await import("@/lib/server/centre-access");
    const owned = await canCentreWriteLeadsFor(sql, context.userId, tour.daycare_id);
    const isParent = tour.user_id === context.userId;
    if (!owned && !(isParent && data.status === "completed")) throw new Error("Not authorized");

    const next = nextTourPipeline(tour.status, data.status);
    if (!next || next === "pending") throw new Error("This tour cannot move to that status");

    const note = (data.note || "").trim() || null;
    await sql`
      update tour_requests
      set status = ${next},
          centre_note = coalesce(${note}, centre_note),
          responded_by = ${context.userId},
          responded_at = coalesce(responded_at, now())
      where id = ${tour.id}
    `;

    const body = tourStatusBody({
      status: next,
      daycareName: tour.daycare_name,
      note,
    });
    await sql`
      insert into messages (id, conversation_id, sender, body, kind)
      values (${nid("msg")}, ${tour.conversation_id}, ${"system"}, ${body}, ${"status"})
    `;
    await sql`update conversations set last_at = now() where id = ${tour.conversation_id}`;
    await markConversationRead(sql, tour.conversation_id, context.userId);

    return { ok: true as const, status: next, conversationId: tour.conversation_id };
  });
