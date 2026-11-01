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
  .validator((input: { daycareId?: string; childName?: string; day?: string; band?: string }) => ({
    daycareId: String(input?.daycareId || "").slice(0, 80),
    childName: String(input?.childName || "").trim().slice(0, 80),
    day: String(input?.day || "").slice(0, 10),
    band: String(input?.band || "").slice(0, 20),
  }))
  .handler(async ({ context, data }) => {
    if (!absenceReportsEnabled()) return { ok: false as const, error: "off" };
    if (!data.childName || !/^\d{4}-\d{2}-\d{2}$/.test(data.day) || !BANDS.has(data.band)) {
      return { ok: false as const, error: "form" };
    }
    const sql = await getSql();
    const booking = await sql<{ id: string; province: string }>`
      select b.id, d.province
      from bookings b
      join daycares d on d.id = b.daycare_id
      where b.user_id = ${context.userId} and b.daycare_id = ${data.daycareId}
        and b.status in (${ENROLLED[0]}, ${ENROLLED[1]})
      limit 1
    `;
    if (!booking[0]) return { ok: false as const, error: "enrol" };
    const current = await sql<{ status: string }>`
      select status from attendance
      where daycare_id = ${data.daycareId} and child_name = ${data.childName} and day = ${data.day}
      limit 1
    `;
    const alreadyAbsent = current[0]?.status === "absent" || current[0]?.status === "sick" || current[0]?.status === "vacation";
    const present = await sql<{ n: number }>`
      select count(*)::int as n from attendance
      where daycare_id = ${data.daycareId} and day = ${data.day}
        and status in ('scheduled', 'arrived', 'departed')
    `;
    const shifts = await sql<{ room_band: string; starts_at: string; ends_at: string }>`
      select room_band, starts_at, ends_at from staff_shifts where daycare_id = ${data.daycareId}
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
      province: booking[0].province,
      band: data.band as RoomBand,
    });
    const id = newId("at");
    await sql`
      insert into attendance (
        id, daycare_id, child_name, parent_user_id, day, status, notes, updated_by
      ) values (
        ${id}, ${data.daycareId}, ${data.childName}, ${context.userId}, ${data.day},
        ${"absent"}, ${"Parent reported an absence"}, ${context.userId}
      )
      on conflict (daycare_id, child_name, day)
      do update set status = 'absent', notes = excluded.notes, updated_by = excluded.updated_by
    `;
    await sql`
      insert into absence_reports (
        id, daycare_id, parent_user_id, child_name, day, province, band, children_now, ratio_status
      ) values (
        ${newId("ab")}, ${data.daycareId}, ${context.userId}, ${data.childName}, ${data.day},
        ${booking[0].province}, ${data.band}, ${result.childrenNow}, ${result.ratio?.status ?? null}
      )
    `;
    const mode = absenceReportsMode();
    for (const userId of await daycareUserIds(data.daycareId)) {
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
        province: booking[0].province,
        wantSms: true,
      });
    }
    return { ok: true as const, childrenNow: result.childrenNow, ratio: result.ratio?.status ?? null };
  });
