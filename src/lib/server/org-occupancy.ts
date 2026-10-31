import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { orgDashboardEnabled } from "@/lib/features";
import { ENROLLED_BOOKING_STATUSES } from "@/lib/review-gate";
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
    }>(
      `select id, name, city, province, licensed_capacity, confirmed_open_spots
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
    const facts: SiteFacts[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      city: row.city || "",
      province: row.province || "",
      licensedCapacity: row.licensed_capacity == null ? null : Number(row.licensed_capacity),
      enrolled: counts == null ? null : enrolledById.get(row.id) ?? 0,
      openSpots: row.confirmed_open_spots == null ? null : Number(row.confirmed_open_spots),
    }));
    const sites = facts.map(siteOccupancy);
    return { enabled: true as const, sites, totals: orgTotals(sites) };
  });
