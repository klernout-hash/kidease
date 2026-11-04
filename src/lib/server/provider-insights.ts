/**
 * Insights for the centres on this account.
 *
 * Audit (real rows only):
 * - Views: daycare_views. PostHog product events have no daycare id, and
 *   FEATURE_PRODUCT_EVENTS is off, so they are not a per-centre source.
 * - Saves: saved_daycares (not the consent-gated listing_saved event).
 * - Inquiries: a parent's message on a conversation in the range.
 * - Requests: bookings created in the range.
 * - Reply time: first parent message to first provider reply.
 * - Area average: other centres in the same city, medians only, hidden under 5.
 * - Waitlist: daycare_waitlist rows still waiting. Not daycares.waitlist.
 * - Enrolment: bookings in accepted or active. Capacity and spots only when posted.
 * - Open spots over time: vacancy_events, when a centre recorded them.
 * - Tours: tour_requests.
 * - Attendance: attendance rows marked present, or child_check_events check-ins.
 * - Staff: ratio_checks and ece_certificates. No certificate numbers.
 * - Reviews: published (or legacy approved) reviews. Not the star number stored on the listing.
 *
 * The caller's centres come from listAccessibleDaycareIds. A centre id that
 * is not on the account returns not_yours and no rows.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { providerInsightsEnabled } from "@/lib/features";
import { ENROLLED_BOOKING_STATUSES } from "@/lib/review-gate";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import {
  anonymousAreaMedians,
  assembleProviderInsights,
  insightWindow,
  isInsightRange,
  scopeCentreIds,
  type InsightCentreFact,
  type InsightFacts,
  type InsightRange,
  type ProviderInsightsModel,
} from "@/lib/provider-insights";

const AREA_ROW_CAP = 5000;

export type ProviderInsightsResult =
  | { enabled: false }
  | {
      enabled: true;
      error: "not_yours" | "load";
      centreId: string;
      centreOptions: { id: string; name: string }[];
    }
  | {
      enabled: true;
      error?: undefined;
      centreId: string;
      centreOptions: { id: string; name: string }[];
      data: ProviderInsightsModel;
    };

type CentreRow = {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
  licensed_capacity: number | null;
  spots_infant: number | null;
  spots_toddler: number | null;
  spots_preschool: number | null;
  spots_updated_at: string | null;
  confirmed_open_spots: number | null;
};

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

export const loadProviderInsights = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { range?: string; centreId?: string } | undefined) => {
    const range: InsightRange = isInsightRange(String(input?.range || ""))
      ? (input!.range as InsightRange)
      : "30d";
    const raw = String(input?.centreId || "all")
      .trim()
      .slice(0, 80);
    const centreId = raw === "all" || /^[A-Za-z0-9_-]{1,80}$/.test(raw) ? raw : "all";
    return { range, centreId };
  })
  .handler(async ({ context, data }): Promise<ProviderInsightsResult> => {
    if (!providerInsightsEnabled()) return { enabled: false };
    const sql = await getSql();
    const access = await listAccessibleDaycareIds(sql, context.userId);
    const scoped = scopeCentreIds(access, data.centreId);
    if (!scoped.ok)
      return { enabled: true, error: "not_yours", centreId: "all", centreOptions: [] };

    let centreRows: CentreRow[];
    try {
      centreRows = await sql.query<CentreRow>(
        `select id, name, city, province, licensed_capacity, confirmed_open_spots,
                spots_infant, spots_toddler, spots_preschool, spots_updated_at
         from daycares
         where id = any($1::text[])
         order by name`,
        [access],
      );
    } catch {
      return { enabled: true, error: "load", centreId: data.centreId, centreOptions: [] };
    }

    const centreOptions = centreRows.map((row) => ({ id: row.id, name: row.name }));
    const allowed = new Set(centreRows.map((row) => row.id));
    const ids = scoped.ids.filter((id) => allowed.has(id));
    if (data.centreId !== "all" && !ids.length) {
      return { enabled: true, error: "not_yours", centreId: "all", centreOptions };
    }
    const selected = centreRows.filter((row) => ids.includes(row.id));
    const window = insightWindow(data.range);
    const start = window.start.toISOString();
    const end = window.end.toISOString();

    const centres: InsightCentreFact[] = selected.map((row) => ({
      id: row.id,
      name: row.name,
      city: row.city || "",
      province: row.province || "",
      licensedCapacity: asNumber(row.licensed_capacity),
      spotsInfant: asNumber(row.spots_infant),
      spotsToddler: asNumber(row.spots_toddler),
      spotsPreschool: asNumber(row.spots_preschool),
      spotsUpdated: Boolean(row.spots_updated_at),
      confirmedOpenSpots: asNumber(row.confirmed_open_spots),
    }));

    if (!ids.length) {
      return {
        enabled: true,
        centreId: "all",
        centreOptions,
        data: assembleProviderInsights({
          range: data.range,
          now: new Date().toISOString(),
          centres: [],
          views: [],
          saves: [],
          inquiries: [],
          requests: [],
          replyHours: [],
          areaMedians: [],
          waitlist: [],
          enrolledNow: 0,
          enrolments: [],
          vacancy: [],
          tours: [],
          attendance: [],
          checkIns: [],
          ratios: [],
          certs: [],
          reviews: [],
        }),
      };
    }

    const city = centres[0]?.city.trim().toLowerCase() ?? "";
    const province = centres[0]?.province.trim().toUpperCase() ?? "";
    const oneArea = Boolean(
      city &&
      province &&
      centres.every(
        (centre) =>
          centre.city.trim().toLowerCase() === city &&
          centre.province.trim().toUpperCase() === province,
      ),
    );

    const [
      views,
      saves,
      inquiries,
      requests,
      replies,
      areaRows,
      waitlist,
      enrolledNow,
      enrolments,
      vacancy,
      tours,
      attendance,
      checkIns,
      ratios,
      certs,
      reviews,
    ] = await Promise.all([
      sql
        .query<{ day: string; n: number }>(
          `select viewed_on as day, coalesce(sum(count), 0)::int as n
           from daycare_views
           where daycare_id = any($1::text[]) and viewed_on >= $2 and viewed_on <= $3
           group by viewed_on`,
          [ids, window.startDay, window.endDay],
        )
        .catch(() => [] as { day: string; n: number }[]),
      sql
        .query<{ day: string; n: number }>(
          `select (created_at at time zone 'UTC')::date::text as day, count(*)::int as n
           from saved_daycares
           where daycare_id = any($1::text[])
             and created_at >= $2::timestamptz
             and created_at <= $3::timestamptz
           group by 1`,
          [ids, start, end],
        )
        .catch(() => [] as { day: string; n: number }[]),
      sql
        .query<{ at: string }>(
          `select min(m.created_at) as at
           from messages m
           join conversations c on c.id = m.conversation_id
           where c.daycare_id = any($1::text[])
             and m.sender = 'parent'
             and m.created_at >= $2::timestamptz
             and m.created_at <= $3::timestamptz
           group by c.id`,
          [ids, start, end],
        )
        .catch(() => [] as { at: string }[]),
      sql
        .query<{ at: string }>(
          `select created_at as at from bookings
           where daycare_id = any($1::text[])
             and created_at >= $2::timestamptz
             and created_at <= $3::timestamptz`,
          [ids, start, end],
        )
        .catch(() => [] as { at: string }[]),
      sql
        .query<{ hours: number }>(
          `select extract(epoch from (provider_at - parent_at)) / 3600.0 as hours
           from (
             select
               (select min(m.created_at) from messages m where m.conversation_id = c.id and m.sender = 'parent') as parent_at,
               (select min(m.created_at) from messages m where m.conversation_id = c.id and m.sender = 'provider') as provider_at
             from conversations c
             where c.daycare_id = any($1::text[])
           ) times
           where parent_at is not null
             and provider_at is not null
             and provider_at >= parent_at
             and parent_at >= $2::timestamptz
             and parent_at <= $3::timestamptz`,
          [ids, start, end],
        )
        .catch(() => [] as { hours: number }[]),
      oneArea
        ? sql
            .query<{ daycare_id: string; hours: number }>(
              `select daycare_id, hours from (
                 select d.id as daycare_id,
                        extract(epoch from (
                          (select min(m.created_at) from messages m where m.conversation_id = c.id and m.sender = 'provider')
                          -
                          (select min(m.created_at) from messages m where m.conversation_id = c.id and m.sender = 'parent')
                        )) / 3600.0 as hours,
                        (select min(m.created_at) from messages m where m.conversation_id = c.id and m.sender = 'parent') as parent_at
                 from conversations c
                 join daycares d on d.id = c.daycare_id
                 where lower(btrim(d.city)) = lower(btrim($1))
                   and upper(btrim(d.province)) = upper(btrim($2))
                   and not (d.id = any($3::text[]))
               ) times
               where parent_at is not null
                 and hours >= 0
                 and parent_at >= $4::timestamptz
                 and parent_at <= $5::timestamptz
               limit $6`,
              [city, province, ids, start, end, AREA_ROW_CAP],
            )
            .catch(() => [] as { daycare_id: string; hours: number }[])
        : Promise.resolve([] as { daycare_id: string; hours: number }[]),
      sql
        .query<{ age: string; joined_at: string }>(
          `select age_group as age, joined_at
           from daycare_waitlist
           where daycare_id = any($1::text[])
             and status in ('waiting', 'offered')`,
          [ids],
        )
        .catch(() => [] as { age: string; joined_at: string }[]),
      sql
        .query<{ n: number }>(
          `select count(distinct coalesce(child_id, id))::int as n
           from bookings
           where daycare_id = any($1::text[])
             and status = any($2::text[])`,
          [ids, [...ENROLLED_BOOKING_STATUSES]],
        )
        .catch(() => [] as { n: number }[]),
      sql
        .query<{ at: string }>(
          `select created_at as at from bookings
           where daycare_id = any($1::text[])
             and status = any($2::text[])
             and created_at >= $3::timestamptz
             and created_at <= $4::timestamptz`,
          [ids, [...ENROLLED_BOOKING_STATUSES], start, end],
        )
        .catch(() => [] as { at: string }[]),
      sql
        .query<{
          at: string;
          infant: number | null;
          toddler: number | null;
          preschool: number | null;
        }>(
          `select recorded_at as at, spots_infant as infant, spots_toddler as toddler, spots_preschool as preschool
           from vacancy_events
           where daycare_id = any($1::text[])
             and recorded_at >= $2::timestamptz
             and recorded_at <= $3::timestamptz`,
          [ids, start, end],
        )
        .catch(
          () =>
            [] as {
              at: string;
              infant: number | null;
              toddler: number | null;
              preschool: number | null;
            }[],
        ),
      sql
        .query<{ status: string; at: string }>(
          `select status, created_at as at from tour_requests
           where daycare_id = any($1::text[])
             and created_at >= $2::timestamptz
             and created_at <= $3::timestamptz`,
          [ids, start, end],
        )
        .catch(() => [] as { status: string; at: string }[]),
      sql
        .query<{ day: string; status: string }>(
          `select day::text as day, status from attendance
           where daycare_id = any($1::text[])
             and day >= $2::date
             and day <= $3::date`,
          [ids, window.startDay, window.endDay],
        )
        .catch(() => [] as { day: string; status: string }[]),
      sql
        .query<{ at: string }>(
          `select at from child_check_events
           where daycare_id = any($1::text[])
             and action = 'check_in'
             and at >= $2::timestamptz
             and at <= $3::timestamptz`,
          [ids, start, end],
        )
        .catch(() => [] as { at: string }[]),
      sql
        .query<{ at: string; children: number; staff: number }>(
          `select checked_at as at, children, staff_count as staff
           from ratio_checks
           where daycare_id = any($1::text[])
             and checked_at >= $2::timestamptz
             and checked_at <= $3::timestamptz`,
          [ids, start, end],
        )
        .catch(() => [] as { at: string; children: number; staff: number }[]),
      sql
        .query<{ staff_name: string; level: string; expires_on: string }>(
          `select staff_name, level, expires_on::text as expires_on
           from ece_certificates
           where daycare_id = any($1::text[])`,
          [ids],
        )
        .catch(() => [] as { staff_name: string; level: string; expires_on: string }[]),
      sql
        .query<{ at: string; rating: number }>(
          `select created_at as at, rating
           from reviews
           where daycare_id = any($1::text[])
             and created_at >= $2::timestamptz
             and created_at <= $3::timestamptz
             and status in ('published', 'approved')`,
          [ids, start, end],
        )
        .catch(() => [] as { at: string; rating: number }[]),
    ]);

    const areaMedians =
      areaRows.length >= AREA_ROW_CAP
        ? []
        : anonymousAreaMedians(
            areaRows.map((row) => ({
              daycareId: row.daycare_id,
              hours: asNumber(row.hours) ?? -1,
            })),
            ids,
          );

    const facts: InsightFacts = {
      range: data.range,
      now: new Date().toISOString(),
      centres,
      views: views.map((row) => ({ day: asText(row.day), count: asNumber(row.n) ?? 0 })),
      saves: saves.map((row) => ({ day: asText(row.day), count: asNumber(row.n) ?? 0 })),
      inquiries: inquiries.map((row) => ({ at: asText(row.at) })),
      requests: requests.map((row) => ({ at: asText(row.at) })),
      replyHours: replies
        .map((row) => asNumber(row.hours))
        .filter((n): n is number => n != null && n >= 0),
      areaMedians,
      waitlist: waitlist.map((row) => ({ age: row.age, joinedAt: asText(row.joined_at) })),
      enrolledNow: asNumber(enrolledNow[0]?.n) ?? 0,
      enrolments: enrolments.map((row) => ({ at: asText(row.at) })),
      vacancy: vacancy.map((row) => ({
        at: asText(row.at),
        infant: asNumber(row.infant),
        toddler: asNumber(row.toddler),
        preschool: asNumber(row.preschool),
      })),
      tours: tours.map((row) => ({ status: row.status, at: asText(row.at) })),
      attendance: attendance.map((row) => ({ day: asText(row.day), status: row.status })),
      checkIns: checkIns.map((row) => ({ at: asText(row.at) })),
      ratios: ratios.map((row) => ({
        at: asText(row.at),
        children: asNumber(row.children) ?? -1,
        staff: asNumber(row.staff) ?? 0,
      })),
      certs: certs.map((row) => ({
        staffName: row.staff_name,
        level: row.level || "",
        expiresOn: asText(row.expires_on),
      })),
      reviews: reviews.map((row) => ({ at: asText(row.at), rating: asNumber(row.rating) ?? 0 })),
    };

    return {
      enabled: true,
      centreId: data.centreId === "all" ? "all" : ids[0] || "all",
      centreOptions,
      data: assembleProviderInsights(facts),
    };
  });
