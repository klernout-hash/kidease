/**
 * Host listing calendar and family-guide notes.
 * FEATURE_HOST_LISTING defaults off. Today's row also updates public spots.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { hostListingEnabled } from "@/lib/features";
import {
  centreDateISO,
  clampSpots,
  dayKey,
  isIsoDate,
  isIsoMonth,
  monthOf,
  publicSpotsFromCalendar,
  shiftMonth,
  spotsChanged,
  type PublicSpotOverlay,
  type SpotCounts,
} from "@/lib/host-calendar";
import { EMPTY_GUIDE, type FamilyGuide } from "@/lib/host-listing";
import {
  assertCentreCanMutateListing,
  assertCentreCanMutateVacancies,
} from "@/lib/server/centre-access";
import { resolveListingTourTimezone } from "@/lib/tour-calendar";
import { effectiveTourStatus } from "@/lib/tour-hold";
import type { Daycare } from "@/lib/types";

export type HostCalendarDay = SpotCounts & { day: string; closed: boolean };

export type HostCalendarPayload = {
  enabled: boolean;
  timezone: string;
  today: string;
  month: string;
  standing: SpotCounts;
  days: HostCalendarDay[];
  enrolments: Record<string, number>;
  tours: Record<string, number>;
  closures: string[];
  waitlistCount: number;
};

const EMPTY_SPOTS: SpotCounts = { infant: 0, toddler: 0, preschool: 0 };

function clipNote(value: unknown): string {
  return String(value ?? "")
    .split("\0")
    .join("")
    .trim()
    .slice(0, 2000);
}

function emptyPayload(month: string): HostCalendarPayload {
  const today = centreDateISO("America/Winnipeg");
  return {
    enabled: false,
    timezone: "America/Winnipeg",
    today,
    month: isIsoMonth(month) ? month : monthOf(today),
    standing: EMPTY_SPOTS,
    days: [],
    enrolments: {},
    tours: {},
    closures: [],
    waitlistCount: 0,
  };
}

async function centreZone(
  sql: Sql,
  daycareId: string,
): Promise<{ timezone: string; province: string; standing: SpotCounts } | null> {
  const rows = await sql<{
    timezone: string | null;
    province: string | null;
    spots_infant: number | null;
    spots_toddler: number | null;
    spots_preschool: number | null;
  }>`
    select timezone, province, spots_infant, spots_toddler, spots_preschool
    from daycares where id = ${daycareId} limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    timezone: resolveListingTourTimezone(row.timezone, row.province),
    province: String(row.province || ""),
    standing: {
      infant: clampSpots(row.spots_infant),
      toddler: clampSpots(row.spots_toddler),
      preschool: clampSpots(row.spots_preschool),
    },
  };
}

function bump(map: Record<string, number>, day: string) {
  if (!isIsoDate(day)) return;
  map[day] = (map[day] ?? 0) + 1;
}

export const loadHostCalendar = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; month: string }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    month: String(input?.month || "").trim(),
  }))
  .handler(async ({ context, data }): Promise<HostCalendarPayload> => {
    if (!hostListingEnabled() || !data.daycareId) return emptyPayload(data.month);
    const sql = await getSql();
    await assertCentreCanMutateVacancies(sql, context.userId, data.daycareId);
    const centre = await centreZone(sql, data.daycareId);
    if (!centre) return emptyPayload(data.month);
    const today = centreDateISO(centre.timezone);
    const month = isIsoMonth(data.month) ? data.month : monthOf(today);
    const rangeStart = `${month}-01`;
    const rangeEnd = `${shiftMonth(month, 14)}-01`;
    const monthEnd = `${shiftMonth(month, 1)}-01`;
    const dayRows = await sql<{
      day: string | Date;
      spots_infant: number;
      spots_toddler: number;
      spots_preschool: number;
      closed: boolean | number;
    }>`
      select day::text as day, spots_infant, spots_toddler, spots_preschool, closed
      from host_calendar_days
      where daycare_id = ${data.daycareId}
        and day >= ${rangeStart}::date
        and day < ${rangeEnd}::date
    `.catch(() => []);
    const days: HostCalendarDay[] = dayRows
      .map((row) => ({
        day: dayKey(row.day),
        infant: clampSpots(row.spots_infant),
        toddler: clampSpots(row.spots_toddler),
        preschool: clampSpots(row.spots_preschool),
        closed: row.closed === true || row.closed === 1,
      }))
      .filter((row) => row.day);
    const attendance = await sql<{ day: string | Date; n: number }>`
      select day::text as day, count(*)::int as n
      from attendance
      where daycare_id = ${data.daycareId}
        and day >= ${rangeStart}::date
        and day < ${monthEnd}::date
        and status in ('scheduled', 'arrived', 'departed')
      group by day
    `.catch(() => []);
    const enrolments: Record<string, number> = {};
    for (const row of attendance) {
      const day = dayKey(row.day);
      if (day) enrolments[day] = Number(row.n) || 0;
    }
    const tours: Record<string, number> = {};
    const windows = await sql<{ day: string | Date }>`
      select window_date::text as day
      from tour_windows
      where daycare_id = ${data.daycareId}
        and window_date >= ${rangeStart}::date
        and window_date < ${monthEnd}::date
    `.catch(() => []);
    for (const row of windows) bump(tours, dayKey(row.day));
    const requests = await sql<{
      preferred_times: string | null;
      status: string;
      created_at: string;
      hold_expires_at: string | null;
    }>`
      select preferred_times, status, created_at, hold_expires_at
      from tour_requests
      where daycare_id = ${data.daycareId}
        and status in ('pending', 'accepted')
    `.catch(() => []);
    const now = Date.now();
    for (const row of requests) {
      if (
        effectiveTourStatus(
          {
            status: row.status,
            createdAt: row.created_at,
            holdExpiresAt: row.hold_expires_at,
          },
          now,
        ) === "expired"
      )
        continue;
      let parsed: unknown = [];
      try {
        parsed = JSON.parse(row.preferred_times || "[]");
      } catch {
        parsed = [];
      }
      if (!Array.isArray(parsed)) continue;
      for (const slot of parsed) {
        const date =
          slot && typeof slot === "object" && "date" in slot
            ? String((slot as { date?: string }).date || "")
            : "";
        if (date.slice(0, 7) === month) bump(tours, date.slice(0, 10));
      }
    }
    const interests = await sql<{ n: number }>`
      select count(*)::int as n from waitlist_interests where daycare_id = ${data.daycareId}
    `.catch(() => [{ n: 0 }]);
    const bookings = await sql<{ n: number }>`
      select count(*)::int as n from bookings
      where daycare_id = ${data.daycareId}
        and status in ('requested', 'under_review', 'waitlist')
    `.catch(() => [{ n: 0 }]);
    return {
      enabled: true,
      timezone: centre.timezone,
      today,
      month,
      standing: centre.standing,
      days,
      enrolments,
      tours,
      closures: days.filter((row) => row.closed && row.day >= today).map((row) => row.day),
      waitlistCount: (interests[0]?.n ?? 0) + (bookings[0]?.n ?? 0),
    };
  });

export const saveHostCalendarDay = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      day: string;
      infant: number;
      toddler: number;
      preschool: number;
      closed: boolean;
    }) => ({
      daycareId: String(input?.daycareId || "").trim(),
      day: String(input?.day || "").trim(),
      infant: clampSpots(input?.infant),
      toddler: clampSpots(input?.toddler),
      preschool: clampSpots(input?.preschool),
      closed: Boolean(input?.closed),
    }),
  )
  .handler(async ({ context, data }) => {
    if (!hostListingEnabled())
      return { ok: false as const, reason: "off" as const, offerNotify: false };
    if (!isIsoDate(data.day)) throw new Error("Pick a real day");
    const sql = await getSql();
    await assertCentreCanMutateVacancies(sql, context.userId, data.daycareId);
    const centre = await centreZone(sql, data.daycareId);
    if (!centre) throw new Error("Listing not found");
    const today = centreDateISO(centre.timezone);
    const beforeRow = await sql<{
      spots_infant: number;
      spots_toddler: number;
      spots_preschool: number;
    }>`
      select spots_infant, spots_toddler, spots_preschool
      from host_calendar_days
      where daycare_id = ${data.daycareId} and day = ${data.day}::date
      limit 1
    `.catch(() => []);
    const before: SpotCounts = beforeRow[0]
      ? {
          infant: clampSpots(beforeRow[0].spots_infant),
          toddler: clampSpots(beforeRow[0].spots_toddler),
          preschool: clampSpots(beforeRow[0].spots_preschool),
        }
      : centre.standing;
    await sql`
      insert into host_calendar_days (daycare_id, day, spots_infant, spots_toddler, spots_preschool, closed, updated_at)
      values (
        ${data.daycareId},
        ${data.day}::date,
        ${data.infant},
        ${data.toddler},
        ${data.preschool},
        ${data.closed},
        now()
      )
      on conflict (daycare_id, day) do update set
        spots_infant = excluded.spots_infant,
        spots_toddler = excluded.spots_toddler,
        spots_preschool = excluded.spots_preschool,
        closed = excluded.closed,
        updated_at = now()
    `;
    const next: SpotCounts = data.closed
      ? EMPTY_SPOTS
      : { infant: data.infant, toddler: data.toddler, preschool: data.preschool };
    const isToday = data.day === today;
    if (isToday) {
      await sql`
        update daycares set
          spots_infant = ${next.infant},
          spots_toddler = ${next.toddler},
          spots_preschool = ${next.preschool},
          last_vacancy_updated_at = now(),
          spots_updated_at = now(),
          open_spots_hidden_at = null
        where id = ${data.daycareId}
      `;
      const month = monthOf(data.day);
      await sql`
        insert into availability (daycare_id, month, infant, toddler, preschool)
        values (${data.daycareId}, ${month}, ${next.infant}, ${next.toddler}, ${next.preschool})
        on conflict (daycare_id, month) do update set
          infant = excluded.infant,
          toddler = excluded.toddler,
          preschool = excluded.preschool
      `.catch(() => undefined);
    }
    const offerNotify = isToday && !data.closed && spotsChanged(before, next);
    return { ok: true as const, offerNotify, publicUpdated: isToday };
  });

export const loadFamilyGuide = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((daycareId: string) => String(daycareId || "").trim())
  .handler(async ({ context, data: daycareId }): Promise<FamilyGuide> => {
    if (!hostListingEnabled() || !daycareId) return EMPTY_GUIDE;
    const sql = await getSql();
    await assertCentreCanMutateListing(sql, context.userId, daycareId);
    const rows = await sql<{
      dropoff_note: string | null;
      bring_note: string | null;
      handbook_note: string | null;
    }>`
      select dropoff_note, bring_note, handbook_note
      from daycare_family_guides
      where daycare_id = ${daycareId}
      limit 1
    `.catch(() => []);
    const row = rows[0];
    if (!row) return EMPTY_GUIDE;
    return {
      dropoff: clipNote(row.dropoff_note),
      bring: clipNote(row.bring_note),
      handbook: clipNote(row.handbook_note),
    };
  });

export const saveFamilyGuide = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string } & FamilyGuide) => ({
    daycareId: String(input?.daycareId || "").trim(),
    dropoff: clipNote(input?.dropoff),
    bring: clipNote(input?.bring),
    handbook: clipNote(input?.handbook),
  }))
  .handler(async ({ context, data }) => {
    if (!hostListingEnabled()) return { ok: false as const, reason: "off" as const };
    if (!data.daycareId) throw new Error("Listing not found");
    const sql = await getSql();
    await assertCentreCanMutateListing(sql, context.userId, data.daycareId);
    await sql`
      insert into daycare_family_guides (daycare_id, dropoff_note, bring_note, handbook_note, updated_at)
      values (${data.daycareId}, ${data.dropoff}, ${data.bring}, ${data.handbook}, now())
      on conflict (daycare_id) do update set
        dropoff_note = excluded.dropoff_note,
        bring_note = excluded.bring_note,
        handbook_note = excluded.handbook_note,
        updated_at = now()
    `;
    return { ok: true as const };
  });

export async function readPublicHostDay(
  sql: Sql,
  daycare: Pick<Daycare, "id" | "timezone" | "province">,
): Promise<{ spots: PublicSpotOverlay | null; month: string; familyGuide: FamilyGuide | null }> {
  const zone = resolveListingTourTimezone(daycare.timezone, daycare.province);
  const today = centreDateISO(zone);
  if (!hostListingEnabled()) return { spots: null, month: monthOf(today), familyGuide: null };
  const rows = await sql<{
    spots_infant: number;
    spots_toddler: number;
    spots_preschool: number;
    closed: boolean | number;
    updated_at: string | Date | null;
  }>`
    select spots_infant, spots_toddler, spots_preschool, closed, updated_at
    from host_calendar_days
    where daycare_id = ${daycare.id} and day = ${today}::date
    limit 1
  `.catch(() => []);
  const row = rows[0];
  const spots = row
    ? publicSpotsFromCalendar(
        {
          day: today,
          infant: clampSpots(row.spots_infant),
          toddler: clampSpots(row.spots_toddler),
          preschool: clampSpots(row.spots_preschool),
          closed: row.closed === true || row.closed === 1,
        },
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at
            ? String(row.updated_at)
            : today,
      )
    : null;
  const notes = await sql<{
    dropoff_note: string | null;
    bring_note: string | null;
    handbook_note: string | null;
  }>`
    select dropoff_note, bring_note, handbook_note
    from daycare_family_guides
    where daycare_id = ${daycare.id}
    limit 1
  `.catch(() => []);
  const guide = notes[0]
    ? {
        dropoff: clipNote(notes[0].dropoff_note),
        bring: clipNote(notes[0].bring_note),
        handbook: clipNote(notes[0].handbook_note),
      }
    : null;
  const familyGuide = guide && (guide.dropoff || guide.bring || guide.handbook) ? guide : null;
  return { spots, month: monthOf(today), familyGuide };
}
