/**
 * Staff confirm arrival and pickup. Notices are stored and never sent.
 * A person on the notice list cannot collect a child.
 */

import type { Sql } from "../db.ts";
import { parsePickupContacts } from "../desk-features.ts";
import type { CentreMemberRole } from "../centre-roles.ts";
import {
  DEMO_CENTRE_ID,
  DEMO_CENTRE_NAME,
  DEMO_CENTRE_SLUG,
  DEMO_CHILDREN,
  DEMO_NOTICE,
  DEMO_PICKUP,
  attendanceStatus,
  canConfirmHandoff,
  canCorrectAttendance,
  centreLocalDay,
  correctionAllowed,
  correctionKey,
  effectiveDoorAction,
  handoffCheckout,
  headcount,
  idempotencyKey,
  nextHandoffAction,
  type DoorAction,
  type DoorEvent,
} from "../attendance-handoff.ts";
import {
  canReadNotice,
  eligibilityFor,
  isDemoAttendance,
  noticeRecipients,
  refuseHeldReplay,
  type ChannelGate,
  type Eligibility,
} from "../attendance-notices.ts";
import { nid } from "../utils.ts";

type BookingRow = {
  id: string;
  user_id: string;
  daycare_id: string;
  child_id: string | null;
  child_name: string;
  timezone: string | null;
};

function duplicate(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /duplicate|unique/i.test(message);
}

async function dayEvents(sql: Sql, bookingId: string, localDay: string): Promise<DoorEvent[]> {
  const rows = await sql<{
    id: string;
    action: string;
    at: string | Date;
    pickup_name: string | null;
    correction_of: string | null;
    reason: string | null;
  }>`
    select id, action, at, pickup_name, correction_of, reason
    from child_check_events
    where booking_id = ${bookingId} and local_day = ${localDay}
    order by at asc, id asc
  `;
  return rows
    .filter((row) => row.action === "check_in" || row.action === "check_out")
    .map((row) => ({
      id: row.id,
      action: row.action as DoorAction,
      at: row.at instanceof Date ? row.at.toISOString() : String(row.at),
      pickupName: row.pickup_name || "",
      correctionOf: row.correction_of,
      reason: row.reason || "",
    }));
}

async function holdNotice(sql: Sql, input: { eventId: string; daycareId: string; childId: string | null }) {
  if (!input.childId) return "none" as const;
  const people = await sql<{ id: string; name: string }>`
    select id, name from child_notice_people where child_id = ${input.childId}
  `.catch(() => [] as { id: string; name: string }[]);
  if (!people.length) return "none" as const;
  for (const person of people) {
    const dedupe = `${input.eventId}:${person.id}`;
    try {
      await sql`
        insert into attendance_notice_outbox
          (id, event_id, daycare_id, recipient_label, channel, status, dedupe_key)
        values
          (${nid("ntc")}, ${input.eventId}, ${input.daycareId}, ${person.name}, 'demo', 'held', ${dedupe})
      `;
    } catch (err) {
      if (!duplicate(err)) return "none" as const;
    }
  }
  return "held" as const;
}

async function daycareFacts(sql: Sql, daycareId: string) {
  const rows = await sql<{ name: string | null; is_test: number | boolean | null }>`
    select name, is_test from daycares where id = ${daycareId} limit 1
  `;
  const row = rows[0];
  return {
    name: row?.name || "",
    demo: isDemoAttendance({ daycareId, isTest: row?.is_test, daycareName: row?.name }),
  };
}

async function insertAccountNotice(
  sql: Sql,
  input: { eventId: string; daycareId: string; userId: string; audience: "guardian" | "centre" },
) {
  const dedupe = `${input.eventId}:${input.audience}:${input.userId}`;
  try {
    await sql`
      insert into attendance_notice_outbox
        (id, event_id, daycare_id, recipient_label, recipient_user_id, audience, channel, status, dedupe_key)
      values
        (${nid("ntc")}, ${input.eventId}, ${input.daycareId}, ${input.audience}, ${input.userId},
         ${input.audience}, 'account', 'eligible', ${dedupe})
    `;
  } catch (err) {
    if (!duplicate(err)) throw err;
  }
}

async function auditNotice(sql: Sql, input: { outboxId: string; from: string; to: string; reason: string }) {
  await sql`
    insert into attendance_notice_audit (id, outbox_id, from_status, to_status, reason)
    values (${nid("aud")}, ${input.outboxId}, ${input.from}, ${input.to}, ${input.reason})
  `;
}

export async function enqueueAttendanceNotices(
  sql: Sql,
  input: { eventId: string; daycareId: string; childId: string | null; guardianUserId: string; actorId: string },
): Promise<"held" | "waiting" | "none"> {
  const centre = await daycareFacts(sql, input.daycareId);
  if (centre.demo) return holdNotice(sql, input);
  const members = await sql<{ user_id: string; role: string }>`
    select user_id, role from centre_members
    where daycare_id = ${input.daycareId} and status = 'active'
  `.catch(() => [] as { user_id: string; role: string }[]);
  const people = noticeRecipients({
    guardianUserId: input.guardianUserId,
    centreUserIds: members.map((row) => ({ userId: row.user_id, role: row.role })),
    actorId: input.actorId,
  });
  if (!people.length) return "none";
  for (const person of people) {
    await insertAccountNotice(sql, {
      eventId: input.eventId,
      daycareId: input.daycareId,
      userId: person.userId,
      audience: person.audience,
    });
  }
  await settleAttendanceNotices(sql, { eventId: input.eventId, gateFor: () => ({
    transportLive: false,
    emailVerified: false,
    pushArmed: false,
    emailWanted: null,
    pushWanted: null,
  }) });
  return "waiting";
}

type OutboxRow = {
  id: string;
  channel: string;
  status: string;
  recipient_user_id: string | null;
  attempts: number;
};

/** Applies preference and channel gates. Does not send, and does not replay held demo rows. */
export async function settleAttendanceNotices(
  sql: Sql,
  input: {
    eventId?: string;
    gateFor: (userId: string) => ChannelGate;
    failOnce?: Set<string>;
  },
): Promise<{ settled: number; refused: number }> {
  const rows = input.eventId
    ? await sql<OutboxRow>`
        select id, channel, status, recipient_user_id, attempts
        from attendance_notice_outbox
        where event_id = ${input.eventId} and channel = 'account' and status in ('eligible', 'retry')
      `
    : await sql<OutboxRow>`
        select id, channel, status, recipient_user_id, attempts
        from attendance_notice_outbox
        where channel = 'account' and status in ('eligible', 'retry')
        order by created_at asc
        limit 40
      `;
  let settled = 0;
  let refused = 0;
  for (const row of rows) {
    const replay = refuseHeldReplay(row);
    if (!replay.ok) {
      refused += 1;
      continue;
    }
    const claimed = await sql<{ id: string }>`
      update attendance_notice_outbox
      set status = 'retry', updated_at = now()
      where id = ${row.id} and status = ${row.status}
      returning id
    `;
    if (!claimed[0]) continue;
    if (input.failOnce?.has(row.id)) {
      input.failOnce.delete(row.id);
      const attempts = Number(row.attempts || 0) + 1;
      const next = attempts >= 5 ? "suppressed" : "retry";
      await sql`
        update attendance_notice_outbox
        set status = ${next}, attempts = ${attempts}, last_error = 'transient', updated_at = now()
        where id = ${row.id}
      `;
      await auditNotice(sql, { outboxId: row.id, from: row.status, to: next, reason: "transient" });
      settled += 1;
      continue;
    }
    const gate = input.gateFor(row.recipient_user_id || "");
    const decision: Eligibility = eligibilityFor(gate);
    await sql`
      update attendance_notice_outbox
      set status = ${decision.status}, last_error = ${decision.reason}, updated_at = now()
      where id = ${row.id}
    `;
    await auditNotice(sql, { outboxId: row.id, from: row.status, to: decision.status, reason: decision.reason });
    settled += 1;
  }
  return { settled, refused };
}

export async function readMyNotice(sql: Sql, userId: string, outboxId: string) {
  const rows = await sql<{ id: string; recipient_user_id: string | null; status: string; channel: string }>`
    select id, recipient_user_id, status, channel
    from attendance_notice_outbox where id = ${outboxId} limit 1
  `;
  const row = rows[0];
  if (!row || !canReadNotice(userId, row.recipient_user_id)) return null;
  return row;
}

export async function promoteHeldNotices(): Promise<{ ok: false; reason: "held_not_live" }> {
  return { ok: false, reason: "held_not_live" };
}

export async function commitHandoff(
  sql: Sql,
  input: {
    actorId: string;
    role: CentreMemberRole | null;
    bookingId: string;
    action: DoorAction;
    pickupName: string;
    now: Date;
  },
): Promise<{ ok: true; eventId: string; duplicate: boolean; notice: "held" | "waiting" | "none" } | { ok: false; error: string }> {
  if (!canConfirmHandoff(input.role)) return { ok: false, error: "Only assigned centre staff can confirm this." };
  const rows = await sql<BookingRow>`
    select b.id, b.user_id, b.daycare_id, b.child_id, coalesce(c.name, 'Child') as child_name, d.timezone
    from bookings b
    left join children c on c.id = b.child_id
    join daycares d on d.id = b.daycare_id
    where b.id = ${input.bookingId}
      and b.status in ('accepted', 'active')
    limit 1
  `;
  const booking = rows[0];
  if (!booking) return { ok: false, error: "That child is not enrolled here." };
  const localDay = centreLocalDay(input.now, booking.timezone || "America/Winnipeg");
  const key = idempotencyKey(booking.id, localDay, input.action);
  const existing = await sql<{ id: string }>`
    select id from child_check_events
    where daycare_id = ${booking.daycare_id} and idempotency_key = ${key}
    limit 1
  `;
  if (existing[0]) return { ok: true, eventId: existing[0].id, duplicate: true, notice: "none" };
  const events = await dayEvents(sql, booking.id, localDay);
  const last = effectiveDoorAction(events);
  if (nextHandoffAction(last) !== input.action) return { ok: false, error: "That time is already saved." };
  let pickup = "";
  if (input.action === "check_out") {
    const pickupRows = booking.child_id
      ? await sql<{ name: string }>`
          select name from child_care_people where child_id = ${booking.child_id} and kind = 'pickup'
        `.catch(() => [] as { name: string }[])
      : [];
    const noticeRows = booking.child_id
      ? await sql<{ name: string }>`
          select name from child_notice_people where child_id = ${booking.child_id}
        `.catch(() => [] as { name: string }[])
      : [];
    const decision = handoffCheckout({
      pickupName: input.pickupName,
      pickupNames: pickupRows.map((row) => row.name),
      noticeNames: noticeRows.map((row) => row.name),
    });
    if (!decision.ok) {
      if (decision.reason === "notice_is_not_pickup") return { ok: false, error: "A notice does not allow pickup." };
      if (decision.reason === "need_pickup") return { ok: false, error: "Choose a pickup person." };
      return { ok: false, error: "That person is not on the pickup list." };
    }
    pickup = decision.pickup;
  }
  const eventId = nid("chk");
  try {
    await sql`
      insert into child_check_events (
        id, daycare_id, booking_id, child_name, parent_user_id, action, at, pickup_name, recorded_by,
        idempotency_key, local_day, reason
      ) values (
        ${eventId}, ${booking.daycare_id}, ${booking.id}, ${booking.child_name}, ${booking.user_id},
        ${input.action}, ${input.now.toISOString()}, ${pickup}, ${input.actorId},
        ${key}, ${localDay}, ''
      )
    `;
  } catch (err) {
    if (!duplicate(err)) throw err;
    const again = await sql<{ id: string }>`
      select id from child_check_events
      where daycare_id = ${booking.daycare_id} and idempotency_key = ${key}
      limit 1
    `;
    if (again[0]) return { ok: true, eventId: again[0].id, duplicate: true, notice: "none" };
    return { ok: false, error: "That time is already saved." };
  }
  let notice: "held" | "waiting" | "none" = "none";
  try {
    notice = await enqueueAttendanceNotices(sql, {
      eventId,
      daycareId: booking.daycare_id,
      childId: booking.child_id,
      guardianUserId: booking.user_id,
      actorId: input.actorId,
    });
  } catch {
    notice = "none";
  }
  return { ok: true, eventId, duplicate: false, notice };
}

export async function commitCorrection(
  sql: Sql,
  input: {
    actorId: string;
    role: CentreMemberRole | null;
    bookingId: string;
    action: DoorAction;
    reason: string;
    now: Date;
  },
): Promise<{ ok: true; eventId: string } | { ok: false; error: string }> {
  const allowed = correctionAllowed({ role: input.role, reason: input.reason });
  if (!allowed.ok) return allowed;
  const rows = await sql<BookingRow>`
    select b.id, b.user_id, b.daycare_id, b.child_id, coalesce(c.name, 'Child') as child_name, d.timezone
    from bookings b
    left join children c on c.id = b.child_id
    join daycares d on d.id = b.daycare_id
    where b.id = ${input.bookingId}
      and b.status in ('accepted', 'active')
    limit 1
  `;
  const booking = rows[0];
  if (!booking) return { ok: false, error: "That child is not enrolled here." };
  const localDay = centreLocalDay(input.now, booking.timezone || "America/Winnipeg");
  const events = await dayEvents(sql, booking.id, localDay);
  const target = [...events].reverse().find((event) => !event.correctionOf);
  if (!target) return { ok: false, error: "Nothing to correct yet." };
  const key = correctionKey(booking.id, localDay, target.id);
  const eventId = nid("chk");
  try {
    await sql`
      insert into child_check_events (
        id, daycare_id, booking_id, child_name, parent_user_id, action, at, pickup_name, recorded_by,
        idempotency_key, local_day, correction_of, reason
      ) values (
        ${eventId}, ${booking.daycare_id}, ${booking.id}, ${booking.child_name}, ${booking.user_id},
        ${input.action}, ${input.now.toISOString()}, '', ${input.actorId},
        ${key}, ${localDay}, ${target.id}, ${allowed.reason}
      )
    `;
  } catch (err) {
    if (duplicate(err)) return { ok: false, error: "That correction is already saved." };
    throw err;
  }
  const still = await sql<{ id: string }>`select id from child_check_events where id = ${target.id} limit 1`;
  if (!still[0]) return { ok: false, error: "The original row must stay." };
  try {
    await enqueueAttendanceNotices(sql, {
      eventId,
      daycareId: booking.daycare_id,
      childId: booking.child_id,
      guardianUserId: booking.user_id,
      actorId: input.actorId,
    });
  } catch {
    /* A failed notice does not undo the correction. */
  }
  return { ok: true, eventId };
}

export async function readCentreDay(
  sql: Sql,
  input: { centreIds: string[]; role: CentreMemberRole | null; now: Date },
) {
  if (!input.centreIds.length) return { children: [], headcount: 0, canCorrect: false };
  const kids = await sql.query<{
    booking_id: string;
    child_id: string | null;
    daycare_id: string;
    child_name: string;
    daycare_name: string;
    timezone: string | null;
    is_test: number | boolean | null;
  }>(
    `select b.id as booking_id, b.child_id, b.daycare_id, coalesce(c.name, 'Child') as child_name,
            d.name as daycare_name, d.timezone, d.is_test
     from bookings b
     join daycares d on d.id = b.daycare_id
     left join children c on c.id = b.child_id
     where b.daycare_id = any($1::text[])
       and b.status = any($2::text[])
     order by child_name
     limit 80`,
    [input.centreIds, ["accepted", "active"]],
  );
  const childIds = kids.map((row) => row.child_id).filter((id): id is string => Boolean(id));
  const notes = childIds.length
    ? await sql
        .query<{ id: string; pickup_people: string | null }>(
          `select id, pickup_people from children where id = any($1::text[])`,
          [childIds],
        )
        .catch(() => [] as { id: string; pickup_people: string | null }[])
    : [];
  const noteByChild = new Map(notes.map((row) => [row.id, row.pickup_people]));
  const pickups = childIds.length
    ? await sql
        .query<{ child_id: string; name: string }>(
          `select child_id, name from child_care_people where kind = 'pickup' and child_id = any($1::text[])`,
          [childIds],
        )
        .catch(() => [] as { child_id: string; name: string }[])
    : [];
  const cards = [];
  for (const kid of kids) {
    const localDay = centreLocalDay(input.now, kid.timezone || "America/Winnipeg");
    const events = await dayEvents(sql, kid.booking_id, localDay);
    const last = effectiveDoorAction(events);
    cards.push({
      bookingId: kid.booking_id,
      daycareId: kid.daycare_id,
      daycareName: kid.daycare_name,
      childName: kid.child_name,
      pickups: pickups.filter((person) => person.child_id === kid.child_id).map((person) => person.name),
      pickupDetails: parsePickupContacts(kid.child_id ? noteByChild.get(kid.child_id) : ""),
      status: attendanceStatus(last),
      next: nextHandoffAction(last),
      last,
      demo: isDemoAttendance({ daycareId: kid.daycare_id, isTest: kid.is_test, daycareName: kid.daycare_name }),
    });
  }
  return {
    children: cards,
    headcount: headcount(cards),
    canCorrect: canCorrectAttendance(input.role),
  };
}

export async function readParentDay(sql: Sql, userId: string, now: Date) {
  const kids = await sql<{
    booking_id: string;
    child_name: string;
    daycare_name: string;
    timezone: string | null;
    is_test: number | boolean | null;
    daycare_id: string;
  }>`
    select b.id as booking_id, coalesce(c.name, 'Child') as child_name, d.name as daycare_name, d.timezone, d.is_test, b.daycare_id
    from bookings b
    join daycares d on d.id = b.daycare_id
    left join children c on c.id = b.child_id
    where b.user_id = ${userId}
      and b.status in ('accepted', 'active')
      and (c.user_id = ${userId} or c.id is null)
    order by child_name
    limit 20
  `;
  const cards = [];
  for (const kid of kids) {
    const localDay = centreLocalDay(now, kid.timezone || "America/Winnipeg");
    const events = await dayEvents(sql, kid.booking_id, localDay);
    const last = effectiveDoorAction(events);
    cards.push({
      bookingId: kid.booking_id,
      childName: kid.child_name,
      daycareName: kid.daycare_name,
      status: attendanceStatus(last),
      demo: isDemoAttendance({ daycareId: kid.daycare_id, isTest: kid.is_test, daycareName: kid.daycare_name }),
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        at: event.at,
        pickupName: event.pickupName,
        reason: event.reason,
        correction: Boolean(event.correctionOf),
      })),
    });
  }
  return cards;
}

export async function seedDemoChildren(sql: Sql, userId: string) {
  await sql`
    insert into daycares (
      id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
      address, city, province, postal_code, lat, lng, hours, hours_fr,
      age_min_months, age_max_months, photos, visibility, is_test, timezone
    ) values (
      ${DEMO_CENTRE_ID}, ${DEMO_CENTRE_SLUG}, ${DEMO_CENTRE_NAME}, ${DEMO_CENTRE_NAME},
      'Demo only', 'Démo seulement',
      'Fictional centre for attendance preview. Not a real daycare.',
      'Centre fictif pour l’aperçu des présences. Ce n’est pas une vraie garderie.',
      'Not a street', 'Sample', 'MB', 'R0A 0A0', 0, 0,
      'Closed', 'Fermé', 0, 60, '', 'admin_only', 1, 'America/Winnipeg'
    )
    on conflict (id) do nothing
  `;
  await sql`
    insert into provider_daycares (user_id, daycare_id)
    values (${userId}, ${DEMO_CENTRE_ID})
    on conflict (user_id, daycare_id) do nothing
  `;
  for (const child of DEMO_CHILDREN) {
    const childId = `demo-att-${userId}-${child.key}`.slice(0, 80);
    const bookingId = `demo-bk-${userId}-${child.key}`.slice(0, 80);
    await sql`
      insert into children (id, user_id, name, birthdate, notes)
      values (
        ${childId}, ${userId}, ${child.name}, ${child.birthdate},
        'Fictional demo child. Not a real person.'
      )
      on conflict (id) do nothing
    `;
    await sql`
      insert into bookings (
        id, user_id, daycare_id, child_id, start_month, schedule, age_group, status, monthly_amount
      ) values (
        ${bookingId}, ${userId}, ${DEMO_CENTRE_ID}, ${childId}, '2026-11', 'full', 'preschool', 'accepted', 0
      )
      on conflict (id) do nothing
    `;
    await sql`
      insert into child_care_people (id, child_id, kind, name)
      values (${`demo-pk-${childId}`.slice(0, 80)}, ${childId}, 'pickup', ${DEMO_PICKUP})
      on conflict (id) do nothing
    `;
    await sql`
      insert into child_notice_people (id, child_id, name, may_pickup)
      values (${`demo-nt-${childId}`.slice(0, 80)}, ${childId}, ${DEMO_NOTICE}, false)
      on conflict (id) do nothing
    `;
  }
  return { centreId: DEMO_CENTRE_ID, children: DEMO_CHILDREN.map((child) => child.name) };
}
