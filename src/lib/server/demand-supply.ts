import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  buildDemandSupplyRows,
  previousWinnipegDay,
  type DemandEvent,
  type DemandSupplyRow,
  type SupplyListing,
} from "@/lib/ranking/demand";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import { requireAdmin } from "@/lib/server/roles";

export type DemandSupplyReport = {
  ok: true;
  day: string;
  rows: DemandSupplyRow[];
  built: boolean;
};

function mapEvent(row: { name: string; city: string | null; age_group: string | null }): DemandEvent {
  return {
    name: row.name,
    city: row.city || "",
    ageGroup: row.age_group || "any",
  };
}

function mapListing(row: {
  city: string | null;
  age_min_months: number | null;
  age_max_months: number | null;
  spots_infant: number | null;
  spots_toddler: number | null;
  spots_preschool: number | null;
  last_vacancy_updated_at: string | null;
  spots_updated_at: string | null;
}): SupplyListing {
  return {
    city: row.city || "",
    ageMinMonths: Number(row.age_min_months) || 0,
    ageMaxMonths: Number(row.age_max_months) || 0,
    spotsInfant: Number(row.spots_infant) || 0,
    spotsToddler: Number(row.spots_toddler) || 0,
    spotsPreschool: Number(row.spots_preschool) || 0,
    vacancyAt: row.last_vacancy_updated_at || row.spots_updated_at || null,
  };
}

export async function runDemandSupplyJob(input: { day?: string; dryRun?: boolean; sql?: Sql } = {}) {
  const sql = input.sql ?? (await getSql());
  const day = input.day && /^\d{4}-\d{2}-\d{2}$/.test(input.day) ? input.day : previousWinnipegDay();
  const events = await sql.query<{ name: string; city: string | null; age_group: string | null }>(
    `select name, city, age_group
     from ranking_events
     where (created_at at time zone 'America/Winnipeg')::date = $1::date`,
    [day],
  );
  const listings = await sql.query<{
    city: string | null;
    age_min_months: number | null;
    age_max_months: number | null;
    spots_infant: number | null;
    spots_toddler: number | null;
    spots_preschool: number | null;
    last_vacancy_updated_at: string | null;
    spots_updated_at: string | null;
  }>(
    `select city, age_min_months, age_max_months,
            spots_infant, spots_toddler, spots_preschool,
            last_vacancy_updated_at::text, spots_updated_at::text
     from daycares
     where ${PUBLIC_LISTING_SQL}`,
  );
  const rows = buildDemandSupplyRows({
    day,
    events: events.map(mapEvent),
    listings: listings.map(mapListing),
  });
  if (!input.dryRun) {
    await sql.query(`delete from demand_supply_daily where day = $1::date`, [day]);
    const size = 200;
    for (let i = 0; i < rows.length; i += size) {
      const part = rows.slice(i, i + size);
      await sql.query(
        `insert into demand_supply_daily (
           day, city, age_group, searches, saves, spot_requests, listings, confirmed_openings
         )
         select * from unnest(
           $1::date[], $2::text[], $3::text[], $4::int[], $5::int[], $6::int[], $7::int[], $8::int[]
         )`,
        [
          part.map((row) => row.day),
          part.map((row) => row.city),
          part.map((row) => row.ageGroup),
          part.map((row) => row.searches),
          part.map((row) => row.saves),
          part.map((row) => row.spotRequests),
          part.map((row) => row.listings),
          part.map((row) => row.confirmedOpenings),
        ],
      );
    }
  }
  return { ok: true as const, day, rows: rows.length, dryRun: Boolean(input.dryRun) };
}

function toRow(row: {
  day: string;
  city: string;
  age_group: string;
  searches: number;
  saves: number;
  spot_requests: number;
  listings: number;
  confirmed_openings: number;
}): DemandSupplyRow {
  return {
    day: String(row.day).slice(0, 10),
    city: row.city,
    ageGroup: row.age_group,
    searches: Number(row.searches) || 0,
    saves: Number(row.saves) || 0,
    spotRequests: Number(row.spot_requests) || 0,
    listings: Number(row.listings) || 0,
    confirmedOpenings: Number(row.confirmed_openings) || 0,
  };
}

export const listDemandSupply = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DemandSupplyReport> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const latest = await sql.query<{ day: string }>(
      `select day::text as day from demand_supply_daily order by day desc limit 1`,
    ).catch(() => [] as Array<{ day: string }>);
    const day = latest[0]?.day?.slice(0, 10) || "";
    if (!day) return { ok: true, day: "", rows: [], built: false };
    const rows = await sql.query<{
      day: string;
      city: string;
      age_group: string;
      searches: number;
      saves: number;
      spot_requests: number;
      listings: number;
      confirmed_openings: number;
    }>(
      `select day::text as day, city, age_group, searches, saves, spot_requests, listings, confirmed_openings
       from demand_supply_daily
       where day = $1::date
       order by searches desc, spot_requests desc, city asc
       limit 500`,
      [day],
    );
    return { ok: true, day, rows: rows.map(toRow), built: true };
  });

export const rebuildDemandSupply = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const result = await runDemandSupplyJob();
    return result;
  });
