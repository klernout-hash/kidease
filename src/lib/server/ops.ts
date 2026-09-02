import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";

export type AttendanceStatus = "scheduled" | "arrived" | "departed" | "absent";

export type AttendanceRow = {
  id: string;
  daycareId: string;
  daycareName: string;
  bookingId: string | null;
  conversationId: string | null;
  childName: string;
  parentUserId: string | null;
  day: string;
  dropOff: string;
  pickUp: string;
  status: AttendanceStatus;
  notes: string;
};

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function weekDays(anchor?: string) {
  const start = anchor ? new Date(`${anchor}T12:00:00`) : new Date();
  const day = start.getDay();
  const monday = new Date(start);
  monday.setDate(start.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return ymd(d);
  });
}

export const getWeekSchedule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; weekStart?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const days = weekDays(data.weekStart);
    const owned = data.daycareId
      ? await sql<{ daycare_id: string }>`
          select daycare_id from provider_daycares
          where user_id = ${context.userId} and daycare_id = ${data.daycareId}
        `
      : [];
    const isProvider = Boolean(owned[0]);

    const kids = isProvider
      ? await sql<{
          booking_id: string;
          daycare_id: string;
          daycare_name: string;
          child_name: string;
          parent_user_id: string;
          conversation_id: string | null;
        }>`
          select b.id as booking_id, b.daycare_id, d.name as daycare_name,
                 coalesce(ch.name, b.child_name, b.parent_name, 'Child') as child_name,
                 b.user_id as parent_user_id, b.conversation_id
          from bookings b
          join daycares d on d.id = b.daycare_id
          left join children ch on ch.id = b.child_id
          where b.daycare_id = ${data.daycareId}
            and b.status in ('accepted', 'active')
          order by child_name
        `
      : await sql<{
          booking_id: string;
          daycare_id: string;
          daycare_name: string;
          child_name: string;
          parent_user_id: string;
          conversation_id: string | null;
        }>`
          select b.id as booking_id, b.daycare_id, d.name as daycare_name,
                 coalesce(ch.name, b.child_name, 'Your child') as child_name,
                 b.user_id as parent_user_id, b.conversation_id
          from bookings b
          join daycares d on d.id = b.daycare_id
          left join children ch on ch.id = b.child_id
          where b.user_id = ${context.userId}
            and b.status in ('accepted', 'active')
          order by child_name
        `;

    const rows = await sql<{
      id: string;
      daycare_id: string;
      booking_id: string | null;
      conversation_id: string | null;
      child_name: string;
      parent_user_id: string | null;
      day: string;
      drop_off: string | null;
      pick_up: string | null;
      status: AttendanceStatus;
      notes: string | null;
    }>`
      select id, daycare_id, booking_id, conversation_id, child_name, parent_user_id,
             day::text as day, drop_off, pick_up, status, notes
      from attendance
      where day >= ${days[0]} and day <= ${days[6]}
        and (
          parent_user_id = ${context.userId}
          or daycare_id in (select daycare_id from provider_daycares where user_id = ${context.userId})
        )
      order by child_name, day
    `.catch(() => []);

    const byKey = new Map(rows.map((r) => [`${r.daycare_id}:${r.child_name}:${r.day}`, r]));
    const items: AttendanceRow[] = [];
    for (const kid of kids) {
      for (const day of days) {
        const hit = byKey.get(`${kid.daycare_id}:${kid.child_name}:${day}`);
        items.push({
          id: hit?.id ?? `${kid.booking_id}-${day}`,
          daycareId: kid.daycare_id,
          daycareName: kid.daycare_name,
          bookingId: kid.booking_id,
          conversationId: kid.conversation_id,
          childName: kid.child_name,
          parentUserId: kid.parent_user_id,
          day,
          dropOff: hit?.drop_off || "07:30",
          pickUp: hit?.pick_up || "17:00",
          status: hit?.status ?? "scheduled",
          notes: hit?.notes ?? "",
        });
      }
    }
    return { days, items, role: isProvider ? ("provider" as const) : ("parent" as const) };
  });

export const saveAttendance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      bookingId?: string | null;
      conversationId?: string | null;
      childName: string;
      parentUserId?: string | null;
      day: string;
      dropOff: string;
      pickUp: string;
      status: AttendanceStatus;
      notes?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const provider = await sql<{ daycare_id: string }>`
      select daycare_id from provider_daycares
      where user_id = ${context.userId} and daycare_id = ${data.daycareId}
    `;
    const parentOk = data.parentUserId === context.userId;
    if (!provider[0] && !parentOk) {
      const ownBooking = await sql<{ id: string }>`
        select id from bookings
        where id = ${data.bookingId ?? ""} and user_id = ${context.userId}
      `;
      if (!ownBooking[0]) throw new Error("Not allowed");
    }
    const id = nid("at");
    await sql`
      insert into attendance (
        id, daycare_id, booking_id, conversation_id, child_name, parent_user_id,
        day, drop_off, pick_up, status, notes, updated_by
      )
      values (
        ${id}, ${data.daycareId}, ${data.bookingId ?? null}, ${data.conversationId ?? null},
        ${data.childName}, ${data.parentUserId ?? context.userId}, ${data.day},
        ${data.dropOff || "07:30"}, ${data.pickUp || "17:00"}, ${data.status},
        ${data.notes ?? ""}, ${context.userId}
      )
      on conflict (daycare_id, child_name, day)
      do update set
        drop_off = excluded.drop_off,
        pick_up = excluded.pick_up,
        status = excluded.status,
        notes = excluded.notes,
        updated_by = excluded.updated_by,
        booking_id = coalesce(excluded.booking_id, attendance.booking_id),
        conversation_id = coalesce(excluded.conversation_id, attendance.conversation_id)
    `;
    return { ok: true as const };
  });
