/**
 * Timestamped arrival and pickup. FEATURE_CHILD_CHECKIN defaults off.
 * Pickup names are checked only when the parent already saved them.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { centreCanWriteCare } from "@/lib/centre-roles";
import { getSql } from "@/lib/db";
import { childCheckinEnabled } from "@/lib/features";
import { checkoutAllowed, nextDoorAction } from "@/lib/gap-features";
import { ENROLLED_BOOKING_STATUSES } from "@/lib/review-gate";
import { nid } from "@/lib/utils";
import { listAccessibleDaycareIds, loadCentreRole } from "./centre-access";

export const childCheckinFlag = createServerFn({ method: "GET" }).handler(async () => childCheckinEnabled());

function iso(value: string | Date | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  const text = String(value || "");
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
}

export const listDoorRoster = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!childCheckinEnabled()) return { enabled: false as const, children: [], events: [] };
    const sql = await getSql();
    const centres = await listAccessibleDaycareIds(sql, context.userId);
    if (!centres.length) return { enabled: true as const, children: [], events: [] };
    const kids = await sql
      .query<{
        booking_id: string;
        parent_user_id: string;
        child_id: string | null;
        daycare_id: string;
        child_name: string;
        daycare_name: string;
      }>(
        `select b.id as booking_id, b.user_id as parent_user_id, b.child_id, b.daycare_id,
                coalesce(c.name, 'Child') as child_name, d.name as daycare_name
         from bookings b
         join daycares d on d.id = b.daycare_id
         left join children c on c.id = b.child_id
         where b.daycare_id = any($1::text[])
           and b.status = any($2::text[])
         order by d.name, child_name
         limit 80`,
        [centres, [...ENROLLED_BOOKING_STATUSES]],
      )
      .catch(() => []);
    const childIds = kids.map((row) => row.child_id).filter((id): id is string => Boolean(id));
    const pickups = childIds.length
      ? await sql
          .query<{ child_id: string; name: string }>(
            `select child_id, name from child_care_people where kind = 'pickup' and child_id = any($1::text[])`,
            [childIds],
          )
          .catch(() => [] as { child_id: string; name: string }[])
      : [];
    const events = await sql
      .query<{
        id: string;
        booking_id: string | null;
        child_name: string;
        action: string;
        at: string | Date;
        pickup_name: string;
        daycare_name: string;
      }>(
        `select e.id, e.booking_id, e.child_name, e.action, e.at, e.pickup_name, d.name as daycare_name
         from child_check_events e
         join daycares d on d.id = e.daycare_id
         where e.daycare_id = any($1::text[])
         order by e.at desc
         limit 40`,
        [centres],
      )
      .catch(() => []);
    const lastByBooking = new Map<string, "check_in" | "check_out">();
    for (const event of [...events].reverse()) {
      if (!event.booking_id) continue;
      if (event.action === "check_in" || event.action === "check_out") lastByBooking.set(event.booking_id, event.action);
    }
    return {
      enabled: true as const,
      children: kids.map((row) => ({
        bookingId: row.booking_id,
        daycareId: row.daycare_id,
        daycareName: row.daycare_name,
        childName: row.child_name,
        pickups: pickups.filter((person) => person.child_id === row.child_id).map((person) => person.name),
        next: nextDoorAction(lastByBooking.get(row.booking_id) ?? null),
      })),
      events: events.map((row) => ({
        id: row.id,
        childName: row.child_name,
        daycareName: row.daycare_name,
        action: row.action === "check_out" ? ("check_out" as const) : ("check_in" as const),
        at: iso(row.at),
        pickupName: row.pickup_name || "",
      })),
    };
  });

export const recordChildCheck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { bookingId?: string; action?: string; pickupName?: string }) => ({
    bookingId: String(input?.bookingId || "").trim(),
    action: input?.action === "check_out" ? ("check_out" as const) : ("check_in" as const),
    pickupName: String(input?.pickupName || ""),
  }))
  .handler(async ({ context, data }) => {
    if (!childCheckinEnabled()) return { ok: false as const, reason: "off" as const };
    if (!data.bookingId) throw new Error("That child is not enrolled here");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      user_id: string;
      daycare_id: string;
      child_id: string | null;
      child_name: string;
    }>`
      select b.id, b.user_id, b.daycare_id, b.child_id, coalesce(c.name, 'Child') as child_name
      from bookings b
      left join children c on c.id = b.child_id
      where b.id = ${data.bookingId}
        and b.status in ('accepted', 'active')
      limit 1
    `;
    const booking = rows[0];
    if (!booking) throw new Error("That child is not enrolled here");
    const role = await loadCentreRole(sql, context.userId, booking.daycare_id);
    if (!centreCanWriteCare(role)) throw new Error("That centre is not on this account");
    const last = await sql<{ action: string }>`
      select action from child_check_events
      where booking_id = ${booking.id}
      order by at desc
      limit 1
    `.catch(() => [] as { action: string }[]);
    const previous = last[0]?.action === "check_in" || last[0]?.action === "check_out" ? last[0].action : null;
    if (nextDoorAction(previous) !== data.action) throw new Error("That time is already saved");
    let pickup = "";
    if (data.action === "check_out") {
      const people = booking.child_id
        ? await sql<{ name: string }>`
            select name from child_care_people
            where child_id = ${booking.child_id} and kind = 'pickup'
          `.catch(() => [] as { name: string }[])
        : [];
      const decision = checkoutAllowed(data.pickupName, people);
      if (!decision.ok) throw new Error(decision.reason === "need_pickup" ? "Choose a pickup person" : "That person is not on the pickup list");
      pickup = decision.pickup;
    }
    await sql`
      insert into child_check_events (
        id, daycare_id, booking_id, child_name, parent_user_id, action, pickup_name, recorded_by
      ) values (
        ${nid("chk")}, ${booking.daycare_id}, ${booking.id}, ${booking.child_name},
        ${booking.user_id}, ${data.action}, ${pickup}, ${context.userId}
      )
    `;
    return { ok: true as const };
  });

export const listMyCheckHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!childCheckinEnabled()) return { enabled: false as const, events: [] };
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      child_name: string;
      action: string;
      at: string | Date;
      pickup_name: string;
      daycare_name: string;
    }>`
      select e.id, e.child_name, e.action, e.at, e.pickup_name, d.name as daycare_name
      from child_check_events e
      join daycares d on d.id = e.daycare_id
      where e.parent_user_id = ${context.userId}
      order by e.at desc
      limit 40
    `.catch(() => []);
    return {
      enabled: true as const,
      events: rows.map((row) => ({
        id: row.id,
        childName: row.child_name,
        daycareName: row.daycare_name,
        action: row.action === "check_out" ? ("check_out" as const) : ("check_in" as const),
        at: iso(row.at),
        pickupName: row.pickup_name || "",
      })),
    };
  });
