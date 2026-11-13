import { createServerFn } from "@tanstack/react-start";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { getSql } from "@/lib/db";
import { govScopesEnabled } from "@/lib/features";
import { govScopeView, summarizeProvince, type GovCentreRow } from "@/lib/gov-scopes";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import type { GovActor } from "@/lib/server/gov-actor.server";

export const loadGovScope = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    const view = govScopeView({
      actor: context.gov as GovActor,
      enabled: govScopesEnabled(),
    });
    if (view.reason !== "ok") return view;
    try {
      const sql = await getSql();
      const rows = await sql.query<{ province: string | null; open_spots: number | null }>(
        `select province,
                (coalesce(spots_infant, 0) + coalesce(spots_toddler, 0) + coalesce(spots_preschool, 0))::int as open_spots
           from daycares
          where upper(btrim(coalesce(province, ''))) = $1
            and ${PUBLIC_LISTING_SQL}`,
        [view.province],
      );
      if (!Array.isArray(rows)) throw new Error("Totals could not be loaded");
      const summary = summarizeProvince(
        rows.map(
          (row): GovCentreRow => ({ province: row.province, openSpots: row.open_spots }),
        ),
        view.province,
      );
      return { ...view, centres: summary.centres, openSpots: summary.openSpots };
    } catch {
      return { show: true as const, reason: "unavailable" as const, province: view.province };
    }
  });
