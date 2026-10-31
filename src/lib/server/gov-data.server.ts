import { getSql } from "@/lib/db";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import type { FeeBucketFact, FillFact, TrendFact, WaitlistFact, CityFact } from "@/lib/gov/aggregate";
import { PROVINCE_BOXES, type ProvinceCode } from "@/lib/gov/places";

const TTL_MS = 10 * 60 * 1000;

export type GovBundle = {
  cities: CityFact[];
  fees: Array<FeeBucketFact & { province: string; city: string }>;
  waitlist: Array<WaitlistFact & { province: string }>;
  trends: Array<TrendFact & { province: string }>;
  fill: Array<FillFact & { province: string }>;
  generatedAt: string;
};

let cache: { at: number; value: GovBundle } | null = null;

const LICENSED_SQL = `
  btrim(coalesce(license_number, '')) <> ''
  and lower(btrim(coalesce(license_status, ''))) not in ('expired', 'suspended', 'revoked')
`;

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function provinceCaseSql(): string {
  const parts: string[] = [];
  for (const [code, box] of Object.entries(PROVINCE_BOXES) as Array<[ProvinceCode, (typeof PROVINCE_BOXES)[ProvinceCode]]>) {
    parts.push(
      `when center_lat between ${box.minLat} and ${box.maxLat} and center_lng between ${box.minLng} and ${box.maxLng} then '${code}'`,
    );
  }
  return `case ${parts.join(" ")} else '' end`;
}

async function loadUncached(): Promise<GovBundle> {
  const sql = await getSql();
  // .query inlines the public-listing predicate. That text is code, not user input.
  const cityRows = await sql
    .query<CityFact & Record<string, unknown>>(
      `
      select
        upper(btrim(province)) as province,
        btrim(city) as city,
        count(*)::int as centres,
        count(*) filter (where ${LICENSED_SQL})::int as licensed,
        coalesce(sum(licensed_capacity) filter (where licensed_capacity is not null), 0)::int as capacity,
        count(*) filter (where licensed_capacity is not null)::int as "capacityKnown",
        count(*) filter (where last_vacancy_updated_at is not null or spots_updated_at is not null or confirmed_open_spots is not null)::int as "vacancyReporters",
        count(*) filter (where last_vacancy_updated_at >= now() - interval '30 days')::int as "vacancyFresh30",
        coalesce(sum(case when last_vacancy_updated_at is not null then coalesce(spots_infant, 0) + coalesce(spots_toddler, 0) + coalesce(spots_preschool, 0) else 0 end), 0)::int as "openSpots",
        count(*) filter (where btrim(coalesce(fee_program, '')) <> '')::int as "cwelccKnown",
        count(*) filter (where btrim(coalesce(fact_source, '')) <> '' and (infant_monthly is not null or toddler_monthly is not null or preschool_monthly is not null))::int as "feesConfirmed",
        count(*) filter (where btrim(coalesce(fact_source, '')) = '' and (infant_monthly is not null or toddler_monthly is not null or preschool_monthly is not null))::int as "feesUncited",
        count(*) filter (where coalesce(languages, '') ilike '%fr%' or coalesce(staff_languages::text, '') ilike '%fr%')::int as french,
        count(*) filter (where coalesce(languages, '') ilike '%en%')::int as english,
        count(*) filter (where coalesce(amenities, '') ~* 'inclus|special need|besoins particuliers' or coalesce(programs::text, '') ~* 'inclus')::int as inclusion,
        avg(lat)::float8 as lat,
        avg(lng)::float8 as lng
      from daycares
      where ${PUBLIC_LISTING_SQL}
        and not (lat = 0 and lng = 0)
      group by 1, 2
      `,
    )
    .catch(() => []);

  const feeRows = await sql
    .query<{ province: string; city: string; kind: "confirmed" | "uncited"; bucket: string; n: number }>(
      `
      with fees as (
        select
          upper(btrim(province)) as province,
          btrim(city) as city,
          case when btrim(coalesce(fact_source, '')) <> '' then 'confirmed' else 'uncited' end as kind,
          (
            coalesce(infant_monthly, 0) + coalesce(toddler_monthly, 0) + coalesce(preschool_monthly, 0)
          )::float8 / nullif(
            (case when infant_monthly is not null then 1 else 0 end)
            + (case when toddler_monthly is not null then 1 else 0 end)
            + (case when preschool_monthly is not null then 1 else 0 end)
          , 0) as fee
        from daycares
        where ${PUBLIC_LISTING_SQL}
          and (infant_monthly is not null or toddler_monthly is not null or preschool_monthly is not null)
      )
      select province, city, kind,
        case
          when fee < 400 then 'under_400'
          when fee < 800 then '400_799'
          when fee < 1200 then '800_1199'
          else '1200_plus'
        end as bucket,
        count(*)::int as n
      from fees
      where fee is not null and fee > 0
      group by 1, 2, 3, 4
      `,
    )
    .catch(() => []);

  const waitRows = await sql
    .query<{ province: string; age: string; start: string; n: number }>(
      `
      select
        ${provinceCaseSql()} as province,
        age_band as age,
        coalesce(to_char(date_trunc('month', start_date), 'YYYY-MM'), '') as start,
        count(*)::int as n
      from saved_searches
      where kind = 'waitlist_area'
      group by 1, 2, 3
      `,
    )
    .catch(() => []);

  const listingTrend = await sql
    .query<{ province: string; month: string; n: number }>(
      `
      select upper(btrim(province)) as province,
        to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
        count(*)::int as n
      from daycares
      where ${PUBLIC_LISTING_SQL}
        and created_at >= now() - interval '18 months'
      group by 1, 2
      `,
    )
    .catch(() => []);

  const vacancyTrend = await sql
    .query<{ province: string; month: string; n: number }>(
      `
      select upper(btrim(province)) as province,
        to_char(date_trunc('month', last_vacancy_updated_at), 'YYYY-MM') as month,
        count(*)::int as n
      from daycares
      where ${PUBLIC_LISTING_SQL}
        and last_vacancy_updated_at is not null
        and last_vacancy_updated_at >= now() - interval '18 months'
      group by 1, 2
      `,
    )
    .catch(() => []);

  const jobTrend = await sql
    .query<{ province: string; month: string; n: number }>(
      `
      select upper(btrim(daycares.province)) as province,
        to_char(date_trunc('month', centre_job_posts.created_at), 'YYYY-MM') as month,
        count(*)::int as n
      from centre_job_posts
      join (select * from daycares where ${PUBLIC_LISTING_SQL}) daycares
        on daycares.id = centre_job_posts.daycare_id
      where true
        and centre_job_posts.created_at >= now() - interval '18 months'
      group by 1, 2
      `,
    )
    .catch(() => []);

  const fillRows = await sql
    .query<{ province: string; n: number; avg_days: number | null }>(
      `
      select upper(btrim(daycares.province)) as province,
        count(*)::int as n,
        avg(extract(epoch from (spot_offers.responded_at - spot_offers.offered_at)) / 86400.0)::float8 as avg_days
      from spot_offers
      join (select id, province from daycares where ${PUBLIC_LISTING_SQL}) daycares
        on daycares.id = spot_offers.daycare_id
      where spot_offers.status = 'accepted'
        and spot_offers.responded_at is not null
      group by 1
      `,
    )
    .catch(() => []);

  const trendKey = new Map<string, TrendFact & { province: string }>();
  function trend(province: string, month: string): TrendFact & { province: string } {
    const key = `${province}|${month}`;
    const found = trendKey.get(key);
    if (found) return found;
    const row = { province, month, listings: 0, vacancyUpdates: 0, jobs: 0 };
    trendKey.set(key, row);
    return row;
  }
  for (const row of listingTrend) trend(row.province, row.month).listings = num(row.n);
  for (const row of vacancyTrend) trend(row.province, row.month).vacancyUpdates = num(row.n);
  for (const row of jobTrend) trend(row.province, row.month).jobs = num(row.n);

  return {
    cities: cityRows.map((row) => ({
      province: String(row.province || ""),
      city: String(row.city || ""),
      centres: num(row.centres),
      licensed: num(row.licensed),
      capacity: num(row.capacity),
      capacityKnown: num(row.capacityKnown),
      vacancyReporters: num(row.vacancyReporters),
      vacancyFresh30: num(row.vacancyFresh30),
      openSpots: num(row.openSpots),
      cwelccKnown: num(row.cwelccKnown),
      feesConfirmed: num(row.feesConfirmed),
      feesUncited: num(row.feesUncited),
      french: num(row.french),
      english: num(row.english),
      inclusion: num(row.inclusion),
      lat: num(row.lat),
      lng: num(row.lng),
    })),
    fees: feeRows.map((row) => ({
      province: String(row.province || ""),
      city: String(row.city || ""),
      kind: row.kind === "confirmed" ? "confirmed" : "uncited",
      bucket: String(row.bucket || ""),
      n: num(row.n),
    })),
    waitlist: waitRows
      .filter((row) => row.province)
      .map((row) => ({
        province: String(row.province),
        age: String(row.age || "any"),
        start: String(row.start || ""),
        n: num(row.n),
      })),
    trends: [...trendKey.values()],
    fill: fillRows.map((row) => ({
      province: String(row.province || ""),
      n: num(row.n),
      avgDays: row.avg_days == null ? null : num(row.avg_days),
    })),
    generatedAt: new Date().toISOString(),
  };
}

export async function loadGovBundle(): Promise<GovBundle> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = await loadUncached();
  cache = { at: Date.now(), value };
  return value;
}

export function resetGovBundleCache(): void {
  cache = null;
}

export function bundleForProvince(bundle: GovBundle, province: string): {
  cities: CityFact[];
  fees: Array<{ bucket: string; kind: "confirmed" | "uncited"; n: number }>;
  waitlist: WaitlistFact[];
  trends: TrendFact[];
  fill: FillFact;
  jobs: number;
  generatedAt: string;
} {
  const all = province === "ALL";
  const cities = bundle.cities.filter((row) => all || row.province === province);
  const feeMap = new Map<string, { bucket: string; kind: "confirmed" | "uncited"; n: number }>();
  for (const row of bundle.fees) {
    if (!all && row.province !== province) continue;
    const key = `${row.kind}|${row.bucket}`;
    const found = feeMap.get(key) ?? { bucket: row.bucket, kind: row.kind, n: 0 };
    found.n += row.n;
    feeMap.set(key, found);
  }
  const waitMap = new Map<string, WaitlistFact>();
  for (const row of bundle.waitlist) {
    if (!all && row.province !== province) continue;
    const key = `${row.age}|${row.start}`;
    const found = waitMap.get(key) ?? { age: row.age, start: row.start, n: 0 };
    found.n += row.n;
    waitMap.set(key, found);
  }
  const trendMap = new Map<string, TrendFact>();
  let jobs = 0;
  for (const row of bundle.trends) {
    if (!all && row.province !== province) continue;
    jobs += row.jobs;
    const found = trendMap.get(row.month) ?? { month: row.month, listings: 0, vacancyUpdates: 0, jobs: 0 };
    found.listings += row.listings;
    found.vacancyUpdates += row.vacancyUpdates;
    found.jobs += row.jobs;
    trendMap.set(row.month, found);
  }
  const fills = bundle.fill.filter((row) => all || row.province === province);
  let fillN = 0;
  let weighted = 0;
  for (const row of fills) {
    fillN += row.n;
    if (row.avgDays != null) weighted += row.avgDays * row.n;
  }
  return {
    cities,
    fees: [...feeMap.values()],
    waitlist: [...waitMap.values()],
    trends: [...trendMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    fill: { n: fillN, avgDays: fillN > 0 ? weighted / fillN : null },
    jobs,
    generatedAt: bundle.generatedAt,
  };
}
