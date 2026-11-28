import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { staffOnShift } from "@/lib/staff-scheduling";
import type { RoomBand } from "@/lib/provincial-ratios";
import { ENROLLED_BOOKING_STATUSES } from "@/lib/review-gate";
import { absenceReportsEnabled, absenceReportsMode, applyAbsence } from "@/lib/wiring/absence-reports";
import { daycareUserIds, deliverNotice, newId } from "@/lib/server/wiring/runtime";

const BANDS = new Set(["infant", "toddler", "preschool", "school-age"]);
const ENROLLED = ENROLLED_BOOKING_STATUSES;

export const reportAbsence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { bookingId?: string; day?: string; band?: string }) => ({
    bookingId: String(input?.bookingId || "").trim().slice(0, 100),
    day: String(input?.day || "").slice(0, 10),
    band: String(input?.band || "").slice(0, 20),
  }))
  .handler(async ({ context, data }) => {
    if (!absenceReportsEnabled()) return { ok: false as const, error: "off" };
    if (!data.bookingId || !/^\d{4}-\d{2}-\d{2}$/.test(data.day) || !BANDS.has(data.band)) {
      return { ok: false as const, error: "form" };
    }
    const sql = await getSql();
    // The centre and child name are taken from this one enrolment read and never from the request.
    const bookings = await sql<{ id: string; daycare_id: string; child_name: string; province: string }>`
      select b.id, b.daycare_id, coalesce(c.name, 'Child') as child_name, d.province
      from bookings b
      join daycares d on d.id = b.daycare_id
      left join children c on c.id = b.child_id
      where b.id = ${data.bookingId} and b.user_id = ${context.userId}
        and (c.user_id = ${context.userId} or c.id is null)
        and b.status in (${ENROLLED[0]}, ${ENROLLED[1]})
      limit 1
    `;
    const booking = bookings[0];
    if (!booking) return { ok: false as const, error: "enrol" };
    const daycareId = booking.daycare_id;
    const childName = booking.child_name;
    const current = await sql<{ status: string }>`
      select status from attendance
      where daycare_id = ${daycareId} and day = ${data.day}
        and (booking_id = ${booking.id} or (booking_id is null and child_name = ${childName}))
      order by (booking_id is null)
      limit 1
    `;
    const alreadyAbsent = current[0]?.status === "absent" || current[0]?.status === "sick" || current[0]?.status === "vacation";
    const present = await sql<{ n: number }>`
      select count(*)::int as n from attendance
      where daycare_id = ${daycareId} and day = ${data.day}
        and status in ('scheduled', 'arrived', 'departed')
    `;
    const shifts = await sql<{ room_band: string; starts_at: string; ends_at: string }>`
      select room_band, starts_at, ends_at from staff_shifts where daycare_id = ${daycareId}
    `.catch(() => []);
    const staff = shifts.length
      ? staffOnShift(
          shifts.map((row) => ({ roomBand: row.room_band, startsAt: String(row.starts_at), endsAt: String(row.ends_at) })),
          data.band,
          new Date(),
        )
      : null;
    const inRoom = Number(present[0]?.n ?? 0);
    const result = applyAbsence({
      alreadyAbsent,
      childrenPresent: alreadyAbsent || current[0] ? inRoom : inRoom + 1,
      staffOnShift: staff,
      province: booking.province,
      band: data.band as RoomBand,
    });
    const id = newId("at");
    const saved = await sql<{ id: string }>`
      insert into attendance (
        id, daycare_id, booking_id, child_name, parent_user_id, day, status, notes, updated_by
      ) values (
        ${id}, ${daycareId}, ${booking.id}, ${childName}, ${context.userId}, ${data.day},
        ${"absent"}, ${"Parent reported an absence"}, ${context.userId}
      )
      on conflict (daycare_id, booking_id, day) where booking_id is not null
      do update set status = 'absent', notes = excluded.notes, updated_by = excluded.updated_by
      where attendance.parent_user_id = ${context.userId}
      returning id
    `;
    if (!saved.length) return { ok: false as const, error: "record" };
    await sql`
      insert into absence_reports (
        id, daycare_id, parent_user_id, child_name, day, province, band, children_now, ratio_status
      ) values (
        ${newId("ab")}, ${daycareId}, ${context.userId}, ${childName}, ${data.day},
        ${booking.province}, ${data.band}, ${result.childrenNow}, ${result.ratio?.status ?? null}
      )
    `;
    const mode = absenceReportsMode();
    for (const userId of await daycareUserIds(daycareId)) {
      await deliverNotice({
        feature: "absence_reports",
        flag: "FEATURE_ABSENCE_REPORTS",
        mode,
        userId,
        role: "provider",
        title: "A child will be away",
        body: result.ratio
          ? `Absence saved. Room ratio is ${result.ratio.status}.`
          : "Absence saved. Add today's staff shifts to see the room ratio.",
        href: "/provider/absence",
        senderUserId: context.userId,
        province: booking.province,
        wantSms: true,
      });
    }
    return { ok: true as const, childrenNow: result.childrenNow, ratio: result.ratio?.status ?? null };
  });
