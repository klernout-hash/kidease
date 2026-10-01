/**
 * Nightly demand vs supply snapshot. Rows are city + age group only.
 */

import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import {
  buildMarketRows,
  previousWinnipegDay,
  rankingAgeGroup,
  rankingCity,
  type DemandCount,
  type MarketRow,
  type SupplyListing,
} from "@/lib/ranking/market";

export async function recordRankingSearch(input: { city?: string | null; ageGroup?: string | null }) {
  const city = rankingCity(input.city);
  if (!city) return;
  try {
    const sql = await getSql();
    await sql`
      insert into ranking_search_facts (id, city, age_group, created_on)
      values (
        ${nid("rk")},
        ${city},
        ${rankingAgeGroup(input.ageGroup)},
        (timezone('America/Winnipeg', now()))::date
      )
    `;
  } catch (err) {
    console.error("[kidease-ranking] search fact skipped", err instanceof Error ? err.message : "failed");
  }
}

export async function runRankingMarketJob(options: { dryRun?: boolean; asOf?: string } = {}) {
  const asOf = options.asOf || previousWinnipegDay();
  const sql = await getSql();
  const listings = await sql<{
    city: string;
    age_min_months: number;
    age_max_months: number;
    ages_confirmed: boolean | number | null;
    spots_infant: number;
    spots_toddler: number;
    spots_preschool: number;
    last_vacancy_updated_at: string | null;
  }>`
    select city, age_min_months, age_max_months, ages_confirmed,
      spots_infant, spots_toddler, spots_preschool, last_vacancy_updated_at
    from daycares
    where coalesce(visibility, 'public') <> 'admin_only'
      and coalesce(is_test, 0) = 0
      and coalesce(listing_active, 1) <> 0
  `;
  const searches = await sql<DemandCount & { age_group: string }>`
    select city, age_group, count(*)::int as n
    from ranking_search_facts
    where created_on = ${asOf}::date
    group by city, age_group
  `;
  const saves = await sql<{ city: string; n: number }>`
    select d.city, count(*)::int as n
    from saved_daycares s
    join daycares d on d.id = s.daycare_id
    where s.created_at >= (${asOf}::date::timestamp at time zone 'America/Winnipeg')
      and s.created_at < ((${asOf}::date + interval '1 day')::timestamp at time zone 'America/Winnipeg')
    group by d.city
  `;
  const spotRequests = await sql<{ city: string; age_group: string; n: number }>`
    select d.city, b.age_group, count(*)::int as n
    from bookings b
    join daycares d on d.id = b.daycare_id
    where b.created_at >= (${asOf}::date::timestamp at time zone 'America/Winnipeg')
      and b.created_at < ((${asOf}::date + interval '1 day')::timestamp at time zone 'America/Winnipeg')
    group by d.city, b.age_group
  `;

  const supply: SupplyListing[] = listings.map((row) => ({
    city: row.city,
    ageMinMonths: Number(row.age_min_months) || 0,
    ageMaxMonths: Number(row.age_max_months) || 0,
    agesKnown: row.ages_confirmed === true || row.ages_confirmed === 1,
    spotsInfant: Number(row.spots_infant) || 0,
    spotsToddler: Number(row.spots_toddler) || 0,
    spotsPreschool: Number(row.spots_preschool) || 0,
    vacancyUpdatedAt: row.last_vacancy_updated_at,
  }));
  const rows = buildMarketRows({
    asOf,
    listings: supply,
    searches: searches.map((row) => ({ city: row.city, ageGroup: row.age_group, n: Number(row.n) || 0 })),
    saves: saves.map((row) => ({ city: row.city, ageGroup: "any", n: Number(row.n) || 0 })),
    spotRequests: spotRequests.map((row) => ({
      city: row.city,
      ageGroup: row.age_group,
      n: Number(row.n) || 0,
    })),
  });

  if (!options.dryRun) {
    for (const row of rows) {
      await sql`
        insert into ranking_market_daily (
          city, age_group, as_of, searches, saves, spot_requests, listings, confirmed_openings
        ) values (
          ${row.city}, ${row.ageGroup}, ${row.asOf}::date,
          ${row.searches}, ${row.saves}, ${row.spotRequests}, ${row.listings}, ${row.confirmedOpenings}
        )
        on conflict (city, age_group, as_of) do update set
          searches = excluded.searches,
          saves = excluded.saves,
          spot_requests = excluded.spot_requests,
          listings = excluded.listings,
          confirmed_openings = excluded.confirmed_openings
      `;
    }
  }
  return { ok: true as const, asOf, rows: rows.length, dryRun: Boolean(options.dryRun) };
}

export async function listRankingMarket(): Promise<MarketRow[]> {
  const sql = await getSql();
  const rows = await sql<{
    city: string;
    age_group: string;
    as_of: string;
    searches: number;
    saves: number;
    spot_requests: number;
    listings: number;
    confirmed_openings: number;
  }>`
    select city, age_group, as_of::text as as_of, searches, saves, spot_requests, listings, confirmed_openings
    from ranking_market_daily
    order by as_of desc, city asc, age_group asc
    limit 500
  `;
  return rows.map((row) => ({
    city: row.city,
    ageGroup: rankingAgeGroup(row.age_group),
    asOf: String(row.as_of).slice(0, 10),
    searches: Number(row.searches) || 0,
    saves: Number(row.saves) || 0,
    spotRequests: Number(row.spot_requests) || 0,
    listings: Number(row.listings) || 0,
    confirmedOpenings: Number(row.confirmed_openings) || 0,
  }));
}
