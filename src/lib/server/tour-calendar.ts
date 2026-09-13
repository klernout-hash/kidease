import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { catalogByIdGet } from "@/lib/catalog";
import { isAdminOnlyListing } from "@/lib/listing-visibility";
import { guestInfoUserId, normalizeInfoContact } from "@/lib/parent-listing";
import { callerIsAdmin } from "@/lib/server/public-listing";
import { upsertDaycare } from "@/lib/server/seed";
import { centreCanAcceptInquiry } from "@/lib/server/provider-entitlements";
import { lookupUser, notifyPlatform, notifyThreadParty } from "@/lib/server/notify";
import { isCentreOwner, listCentreOwnerEmails } from "@/lib/server/thread-access";
import { serializePreferredTimes, tourSystemBody, type PreferredTime } from "@/lib/threads";
import { holdExpiresAtIso } from "@/lib/tour-hold";
import {
  expandWeeklyRepeats,
  formatTourSlotRange,
  isTourWindowBookable,
  normalizeTourWindow,
  publicSlotsOpen,
  remainingTourSeats,
  resolveTourTimezone,
  toPublicTourSlot,
  tourEmptyReason,
  windowEndAt,
  windowStartAt,
  type PublicTourSlot,
  type TourWindowDraft,
} from "@/lib/tour-calendar";

type WindowRow = {
  id: string;
  daycare_id: string;
  window_date: string | Date;
  start_time: string;
  end_time: string;
  capacity: number;
  timezone: string;
  start_at: string | Date;
  booked?: number | string | null;
  pending?: number | string | null;
  accepted?: number | string | null;
};

export type CentreTourWindow = PublicTourSlot & { daycareId: string };

function clock(value: unknown): string {
  return String(value ?? "").trim().slice(0, 5);
}

function isoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value ?? "").trim().slice(0, 10);
}

function mapWindow(row: WindowRow): PublicTourSlot | null {
  return toPublicTourSlot({
    id: row.id,
    date: isoDate(row.window_date),
    startTime: clock(row.start_time),
    endTime: clock(row.end_time),
    capacity: row.capacity,
    booked: row.booked,
    pending: row.pending,
    accepted: row.accepted,
    timezone: row.timezone,
    startAt: row.start_at instanceof Date ? row.start_at.toISOString() : String(row.start_at ?? ""),
  });
}

async function windowsForDaycare(
  sql: Awaited<ReturnType<typeof getSql>>,
  daycareId: string,
  opts?: { upcomingOnly?: boolean },
): Promise<PublicTourSlot[]> {
  const upcoming = opts?.upcomingOnly !== false;
  await import("@/lib/server/tour-holds")
    .then((mod) => mod.expireDueTourHolds({ notify: true }))
    .catch(() => undefined);
  const rows = await sql<WindowRow>`
    select w.id, w.daycare_id, w.window_date, w.start_time, w.end_time, w.capacity, w.timezone, w.start_at,
           coalesce((
             select count(*)::int from tour_requests t
             where t.window_id = w.id and t.status in ('pending', 'accepted')
           ), 0) as booked,
           coalesce((
             select count(*)::int from tour_requests t
             where t.window_id = w.id and t.status = 'pending'
           ), 0) as pending,
           coalesce((
             select count(*)::int from tour_requests t
             where t.window_id = w.id and t.status = 'accepted'
           ), 0) as accepted
    from tour_windows w
    where w.daycare_id = ${daycareId}
      and (${upcoming} = false or w.start_at > now())
    order by w.start_at asc
  `.catch(() => [] as WindowRow[]);
  return rows.map(mapWindow).filter((row): row is PublicTourSlot => Boolean(row));
}

async function requireOwnedDaycare(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  daycareId: string,
) {
  const owned = await isCentreOwner(sql, userId, daycareId);
  if (!owned) throw new Error("Not authorized");
}

export const listPublicTourSlots = createServerFn({ method: "GET" })
  .validator((input: { daycareId: string }) => input)
  .handler(async ({ data }) => {
    const daycareId = (data.daycareId || "").trim();
    if (!daycareId) return { timezone: resolveTourTimezone(null), slots: [] as PublicTourSlot[], empty: "none_posted" as const };
    const listed = await catalogByIdGet(daycareId);
    if (isAdminOnlyListing(listed ?? { id: daycareId }) && !(await callerIsAdmin())) {
      return { timezone: resolveTourTimezone(null), slots: [] as PublicTourSlot[], empty: "none_posted" as const };
    }
    const sql = await getSql();
    const tzRows = await sql<{ timezone: string | null }>`
      select timezone from daycares where id = ${daycareId} limit 1
    `.catch(() => [] as { timezone: string | null }[]);
    const timezone = resolveTourTimezone(tzRows[0]?.timezone);
    const posted = await windowsForDaycare(sql, daycareId, { upcomingOnly: true });
    const slots = publicSlotsOpen(posted);
    return { timezone, slots, empty: tourEmptyReason(posted) };
  });

export const listCentreTourWindows = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireOwnedDaycare(sql, context.userId, data.daycareId);
    const tzRows = await sql<{ timezone: string | null }>`
      select timezone from daycares where id = ${data.daycareId} limit 1
    `.catch(() => [] as { timezone: string | null }[]);
    const timezone = resolveTourTimezone(tzRows[0]?.timezone);
    const slots = (await windowsForDaycare(sql, data.daycareId, { upcomingOnly: false })).map((slot) => ({
      ...slot,
      daycareId: data.daycareId,
    }));
    return { timezone, slots };
  });

export const setDaycareTimezone = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; timezone: string }) => input)
  .handler(async ({ context, data }) => {
    const timezone = resolveTourTimezone(data.timezone);
    const sql = await getSql();
    await requireOwnedDaycare(sql, context.userId, data.daycareId);
    await sql`
      update daycares set timezone = ${timezone} where id = ${data.daycareId}
    `;
    const windows = await sql<{ id: string; window_date: string | Date; start_time: string; end_time: string }>`
      select id, window_date, start_time, end_time from tour_windows where daycare_id = ${data.daycareId}
    `.catch(() => []);
    for (const row of windows) {
      const draft = normalizeTourWindow({
        date: isoDate(row.window_date),
        startTime: clock(row.start_time),
        endTime: clock(row.end_time),
        capacity: 1,
      });
      if (!draft) continue;
      const start = windowStartAt(draft, timezone);
      const end = windowEndAt(draft, timezone);
      if (!start || !end) continue;
      await sql`
        update tour_windows
        set timezone = ${timezone}, start_at = ${start.toISOString()}, end_at = ${end.toISOString()}, updated_at = now()
        where id = ${row.id}
      `;
    }
    return { ok: true as const, timezone };
  });

async function insertWindow(
  sql: Awaited<ReturnType<typeof getSql>>,
  daycareId: string,
  draft: TourWindowDraft,
  timezone: string,
) {
  const start = windowStartAt(draft, timezone);
  const end = windowEndAt(draft, timezone);
  if (!start || !end) throw new Error("Pick a valid date and time");
  const id = nid("tw");
  await sql`
    insert into tour_windows (
      id, daycare_id, window_date, start_time, end_time, capacity, timezone, start_at, end_at
    ) values (
      ${id}, ${daycareId}, ${draft.date}, ${draft.startTime}, ${draft.endTime},
      ${draft.capacity}, ${timezone}, ${start.toISOString()}, ${end.toISOString()}
    )
    on conflict (daycare_id, window_date, start_time) do update set
      end_time = excluded.end_time,
      capacity = excluded.capacity,
      timezone = excluded.timezone,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      updated_at = now()
  `;
  return id;
}

export const saveTourWindows = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      date: string;
      startTime: string;
      endTime: string;
      capacity?: number;
      repeatWeekly?: boolean;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const draft = normalizeTourWindow(data);
    if (!draft) throw new Error("Pick a date, start time, and end time");
    const sql = await getSql();
    await requireOwnedDaycare(sql, context.userId, data.daycareId);
    const tzRows = await sql<{ timezone: string | null }>`
      select timezone from daycares where id = ${data.daycareId} limit 1
    `.catch(() => [] as { timezone: string | null }[]);
    const timezone = resolveTourTimezone(tzRows[0]?.timezone);
    const drafts = data.repeatWeekly ? expandWeeklyRepeats(draft) : [draft];
    const ids: string[] = [];
    for (const item of drafts) {
      ids.push(await insertWindow(sql, data.daycareId, item, timezone));
    }
    return { ok: true as const, ids, timezone };
  });

export const deleteTourWindow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { windowId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string; daycare_id: string }>`
      select id, daycare_id from tour_windows where id = ${data.windowId} limit 1
    `.catch(() => []);
    const row = rows[0];
    if (!row) throw new Error("Tour time not found");
    await requireOwnedDaycare(sql, context.userId, row.daycare_id);
    await sql`delete from tour_windows where id = ${row.id}`;
    return { ok: true as const };
  });

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

export const bookTourSlot = createServerFn({ method: "POST" })
  .validator(
    (input: {
      daycareId: string;
      windowId: string;
      childId?: string;
      childName?: string;
      note?: string;
      locale?: "en" | "fr";
      userId?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    const listed = await catalogByIdGet(data.daycareId);
    if (isAdminOnlyListing(listed ?? { id: data.daycareId }) && !(await callerIsAdmin())) {
      throw new Error("Listing not found");
    }
    if (listed) await upsertDaycare(sql, listed);

    await import("@/lib/server/tour-holds")
      .then((mod) => mod.expireDueTourHolds({ notify: true }))
      .catch(() => undefined);
    const windows = await sql<WindowRow>`
      select w.id, w.daycare_id, w.window_date, w.start_time, w.end_time, w.capacity, w.timezone, w.start_at,
             coalesce((
               select count(*)::int from tour_requests t
               where t.window_id = w.id and t.status in ('pending', 'accepted')
             ), 0) as booked,
             coalesce((
               select count(*)::int from tour_requests t
               where t.window_id = w.id and t.status = 'pending'
             ), 0) as pending,
             coalesce((
               select count(*)::int from tour_requests t
               where t.window_id = w.id and t.status = 'accepted'
             ), 0) as accepted
      from tour_windows w
      where w.id = ${data.windowId} and w.daycare_id = ${data.daycareId}
      limit 1
    `.catch(() => [] as WindowRow[]);
    const window = windows[0];
    const slot = window ? mapWindow(window) : null;
    if (!slot) throw new Error("That tour time is no longer available.");
    if (!isTourWindowBookable(slot, slot.timezone)) throw new Error("That tour time is no longer available.");
    if (remainingTourSeats(slot.capacity, slot.booked) < 1) throw new Error("That tour time is full. Pick another.");

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

    const gate = await centreCanAcceptInquiry(sql, data.daycareId);
    if (!gate.ok) throw new Error(gate.error);

    const signedIn = (data.userId || "").trim();
    let firstName = (data.firstName || "").trim();
    let lastName = (data.lastName || "").trim();
    let phone = (data.phone || "").trim();
    let email = (data.email || "").trim();
    let userId = signedIn;
    let parentName = "";

    if (signedIn && !signedIn.startsWith("guest:")) {
      const actor = await lookupUser(signedIn);
      parentName = (actor.name || "A parent").trim() || "A parent";
      email = email || actor.email || "";
      if (parentName && parentName !== "A parent") {
        const parts = parentName.split(/\s+/);
        firstName = firstName || parts[0] || "";
        lastName = lastName || parts.slice(1).join(" ");
      }
    } else {
      const contact = normalizeInfoContact({
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        phone: data.phone || "",
        email: data.email || "",
        message: data.note,
      });
      if (!contact.ok) throw new Error("Please enter your first name, last name, phone, and email.");
      firstName = contact.firstName;
      lastName = contact.lastName;
      phone = contact.phone;
      email = contact.email;
      userId = guestInfoUserId(contact.email);
      parentName = `${contact.firstName} ${contact.lastName}`.trim();
    }

    let childId = (data.childId || "").trim();
    let childName = (data.childName || "").trim();
    if (childId && !userId.startsWith("guest:")) {
      const owned = await sql<{ id: string; name: string }>`
        select id, name from children where id = ${childId} and user_id = ${userId} limit 1
      `;
      if (!owned[0]) {
        childId = "";
      } else {
        childName = childName || owned[0].name;
      }
    } else if (userId.startsWith("guest:")) {
      childId = "";
    }

    const existingHold = await sql<{ id: string }>`
      select id from tour_requests
      where window_id = ${slot.id} and user_id = ${userId} and status in ('pending', 'accepted')
      limit 1
    `.catch(() => []);
    if (existingHold[0]) throw new Error("You already asked for this tour time.");

    const cid = await ensureConversation(sql, userId, data.daycareId);
    const tourId = nid("tr");
    const note = (data.note || "").trim() || null;
    const locale = data.locale === "fr" ? "fr" : "en";
    const times: PreferredTime[] = [{ date: slot.date, time: slot.startTime }];

    const taken = await sql<{ booked: number }>`
      select coalesce(count(*)::int, 0) as booked
      from tour_requests
      where window_id = ${slot.id} and status in ('pending', 'accepted')
    `.catch(() => [{ booked: slot.booked }]);
    if (remainingTourSeats(slot.capacity, taken[0]?.booked ?? slot.booked) < 1) {
      throw new Error("That tour time is full. Pick another.");
    }

    await sql`
      insert into tour_requests (
        id, conversation_id, user_id, daycare_id, child_id, child_name,
        preferred_times, parent_note, status, window_id,
        parent_first_name, parent_last_name, parent_phone, contact_email,
        hold_expires_at
      ) values (
        ${tourId}, ${cid}, ${userId}, ${data.daycareId},
        ${childId || null}, ${childName || null},
        ${serializePreferredTimes(times)}, ${note}, ${"pending"}, ${slot.id},
        ${firstName || null}, ${lastName || null}, ${phone || null}, ${email || null},
        ${holdExpiresAtIso()}
      )
    `;
    try {
      const { recordLeadRequest } = await import("@/lib/server/lead-requests");
      await recordLeadRequest(sql, {
        userId,
        daycareId: data.daycareId,
        kind: "tour",
        message: note,
        firstName,
        lastName,
        phone,
        email,
        sourceKind: "tour_request",
        sourceId: tourId,
        conversationId: cid,
        notify: false,
      });
    } catch (err) {
      console.error("[kidease-lead] tour slot lead skipped", err);
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

    const slots = formatTourSlotRange(slot, locale);
    const detail = [
      childName ? `Child: ${childName}` : "",
      `Tour time: ${slots}`,
      phone ? `Phone: ${phone}` : "",
      email ? `Email: ${email}` : "",
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
        actorEmail: email || null,
        detail,
      });
    } catch (err) {
      console.error("[kidease-mail] tour slot notify failed", err);
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

    return { id: tourId, conversationId: cid, status: "pending" as const, guest: userId.startsWith("guest:") };
  });
