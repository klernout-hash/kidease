import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { govScopesEnabled } from "@/lib/features";
import { govScopeView, summarizeProvince, type GovCentreRow } from "@/lib/gov-scopes";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";

export const loadGovScope = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const profile = await sql<{ role: string | null; gov_province: string | null }>`
      select role, gov_province from profiles where user_id = ${context.userId} limit 1
    `.catch(() => [] as { role: string | null; gov_province: string | null }[]);
    const view = govScopeView({
      role: profile[0]?.role,
      govProvince: profile[0]?.gov_province,
      enabled: govScopesEnabled(),
    });
    if (!view.show || view.reason !== "ok" || !view.province) {
      return { ...view, centres: 0, openSpots: 0 };
    }
    const rows = await sql
      .query<{ province: string | null; open_spots: number | null }>(
        `select province,
                (coalesce(spots_infant, 0) + coalesce(spots_toddler, 0) + coalesce(spots_preschool, 0))::int as open_spots
           from daycares
          where province = $1
            and ${PUBLIC_LISTING_SQL}`,
        [view.province],
      )
      .catch(() => [] as { province: string | null; open_spots: number | null }[]);
    const summary = summarizeProvince(
      (Array.isArray(rows) ? rows : []).map(
        (row): GovCentreRow => ({ province: row.province, openSpots: row.open_spots }),
      ),
      view.province,
    );
    return { ...view, centres: summary.centres, openSpots: summary.openSpots };
  });
