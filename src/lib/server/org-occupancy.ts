import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { orgDashboardEnabled } from "@/lib/features";
import { ENROLLED_BOOKING_STATUSES } from "@/lib/review-gate";
import { knownSum, pickCentre } from "@/lib/gap-features";
import { orgTotals, siteOccupancy, type SiteFacts } from "@/lib/org-occupancy";

export const orgDeskStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ enabled: orgDashboardEnabled() }));

export const listOrgOccupancy = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!orgDashboardEnabled()) return { enabled: false as const, sites: [], totals: orgTotals([]) };
    const sql = await getSql();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    if (!ids.length) return { enabled: true as const, sites: [], totals: orgTotals([]) };
    const rows = await sql.query<{
      id: string;
      name: string;
      city: string | null;
      province: string | null;
      licensed_capacity: number | null;
      confirmed_open_spots: number | null;
      spots_infant: number | null;
      spots_toddler: number | null;
      spots_preschool: number | null;
    }>(
      `select id, name, city, province, licensed_capacity, confirmed_open_spots,
              spots_infant, spots_toddler, spots_preschool
       from daycares where id = any($1::text[]) order by name`,
      [ids],
    ).catch(() => []);
    const counts = await sql.query<{ daycare_id: string; n: number }>(
      `select daycare_id, count(distinct child_id)::int as n
       from bookings
       where daycare_id = any($1::text[])
         and status = any($2::text[])
         and child_id is not null
       group by daycare_id`,
      [ids, [...ENROLLED_BOOKING_STATUSES]],
    ).catch(() => null);
    const enrolledById = new Map((counts || []).map((row) => [row.daycare_id, Number(row.n)]));
    const ageSpots = (row: (typeof rows)[number]) => {
      const parts = [row.spots_infant, row.spots_toddler, row.spots_preschool];
      if (parts.every((value) => value == null)) {
        return row.confirmed_open_spots == null ? null : Number(row.confirmed_open_spots);
      }
      return parts.reduce<number>((sum, value) => sum + (value == null ? 0 : Number(value)), 0);
    };
    const facts: SiteFacts[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      city: row.city || "",
      province: row.province || "",
      licensedCapacity: row.licensed_capacity == null ? null : Number(row.licensed_capacity),
      enrolled: counts == null ? null : enrolledById.get(row.id) ?? 0,
      openSpots: ageSpots(row),
    }));
    const requestRows = await sql
      .query<{ daycare_id: string; n: number }>(
        `select daycare_id, count(*)::int as n from bookings
         where daycare_id = any($1::text[]) and status in ('requested', 'under_review', 'waitlist')
         group by daycare_id`,
        [ids],
      )
      .catch(() => null);
    const staffRows = await sql
      .query<{ daycare_id: string; n: number }>(
        `select daycare_id, count(distinct user_id)::int as n from (
           select daycare_id, user_id from centre_members
           where status = 'active' and daycare_id = any($1::text[])
           union
           select daycare_id, user_id from provider_daycares
           where daycare_id = any($1::text[])
         ) people
         group by daycare_id`,
        [ids],
      )
      .catch(() => null);
    const requestsById = requestRows ? new Map(requestRows.map((row) => [row.daycare_id, Number(row.n)])) : null;
    const staffById = staffRows ? new Map(staffRows.map((row) => [row.daycare_id, Number(row.n)])) : null;
    const focus = await sql<{ daycare_id: string }>`
      select daycare_id from org_centre_focus where user_id = ${context.userId} limit 1
    `.catch(() => [] as { daycare_id: string }[]);
    const sites = facts.map((fact) => ({
      ...siteOccupancy(fact),
      requests: requestsById ? (requestsById.get(fact.id) ?? 0) : null,
      staff: staffById ? (staffById.get(fact.id) ?? 0) : null,
    }));
    return {
      enabled: true as const,
      sites,
      totals: {
        ...orgTotals(sites),
        requests: knownSum(sites.map((site) => site.requests)),
        staff: knownSum(sites.map((site) => site.staff)),
        openSpots: knownSum(sites.map((site) => site.openSpots)),
      },
      focusId: pickCentre(ids, focus[0]?.daycare_id),
    };
  });

export const setOrgCentre = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: String(input?.daycareId || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!orgDashboardEnabled()) return { ok: false as const, reason: "off" as const };
    const sql = await getSql();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    const daycareId = pickCentre(ids, data.daycareId);
    if (!daycareId) throw new Error("That centre is not on this account");
    await sql`
      insert into org_centre_focus (user_id, daycare_id, updated_at)
      values (${context.userId}, ${daycareId}, now())
      on conflict (user_id) do update set daycare_id = excluded.daycare_id, updated_at = now()
    `;
    return { ok: true as const, daycareId };
  });
