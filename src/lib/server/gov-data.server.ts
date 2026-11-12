import { getSql } from "@/lib/db";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import type { TrendFact, CityFact } from "@/lib/gov/aggregate";
import type { GovBundle } from "@/lib/gov/bundle";
import { isProvinceCode, PROVINCE_BOXES, type ProvinceCode } from "@/lib/gov/places";

const TTL_MS = 10 * 60 * 1000;

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
        coalesce(sum(case
          when last_vacancy_updated_at is not null or spots_updated_at is not null
            then coalesce(spots_infant, 0) + coalesce(spots_toddler, 0) + coalesce(spots_preschool, 0)
          when confirmed_open_spots is not null then confirmed_open_spots
          else 0
        end), 0)::int as "openSpots",
        count(*) filter (where btrim(coalesce(fee_program, '')) <> '')::int as "cwelccKnown",
        count(*) filter (where btrim(coalesce(fact_source, '')) <> '' and (infant_monthly is not null or toddler_monthly is not null or preschool_monthly is not null))::int as "feesConfirmed",
        count(*) filter (where btrim(coalesce(fact_source, '')) = '' and (infant_monthly is not null or toddler_monthly is not null or preschool_monthly is not null))::int as "feesUncited",
        count(*) filter (where
          coalesce(languages, '') ilike '%fr%'
          or coalesce(staff_languages::text, '') ilike '%fr%'
          or coalesce(amenities, '') ~* '(^|,)[[:space:]]*(french|bilingual)[[:space:]]*(,|$)'
        )::int as french,
        count(*) filter (where
          coalesce(languages, '') ilike '%en%'
          or coalesce(staff_languages::text, '') ilike '%en%'
        )::int as english,
        count(*) filter (where
          coalesce(amenities, '') ~* 'inclus|special[- ]need|besoins particuliers'
          or coalesce(programs::text, '') ~* 'inclus|special[- ]need'
        )::int as inclusion,
        count(*) filter (where lat is not null and lng is not null and not (lat = 0 and lng = 0))::int as "coordinateCount",
        avg(lat) filter (where lat is not null and lng is not null and not (lat = 0 and lng = 0))::float8 as lat,
        avg(lng) filter (where lat is not null and lng is not null and not (lat = 0 and lng = 0))::float8 as lng
      from daycares
      where ${PUBLIC_LISTING_SQL}
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
    .query<{ province: string; age: string; start: string; n: number; label: string | null }>(
      `
      select
        ${provinceCaseSql()} as province,
        age_band as age,
        '' as start,
        count(*)::int as n,
        max(center_label) as label
      from saved_searches
      where kind = 'waitlist_area'
      group by 1, 2
      `,
    )
    .catch(() => []);

  const listingTrend = await sql
    .query<{ province: string; city: string; month: string; n: number }>(
      `
      select upper(btrim(province)) as province, btrim(city) as city,
        to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
        count(*)::int as n
      from daycares
      where ${PUBLIC_LISTING_SQL}
        and created_at >= now() - interval '18 months'
      group by 1, 2, 3
      `,
    )
    .catch(() => []);

  const vacancyTrend = await sql
    .query<{ province: string; city: string; month: string; n: number }>(
      `
      select upper(btrim(province)) as province, btrim(city) as city,
        to_char(date_trunc('month', last_vacancy_updated_at), 'YYYY-MM') as month,
        count(*)::int as n
      from daycares
      where ${PUBLIC_LISTING_SQL}
        and last_vacancy_updated_at is not null
        and last_vacancy_updated_at >= now() - interval '18 months'
      group by 1, 2, 3
      `,
    )
    .catch(() => []);

  const jobTrend = await sql
    .query<{ province: string; city: string; month: string; n: number }>(
      `
      select upper(btrim(daycares.province)) as province, btrim(daycares.city) as city,
        to_char(date_trunc('month', centre_job_posts.created_at), 'YYYY-MM') as month,
        count(*)::int as n
      from centre_job_posts
      join (select * from daycares where ${PUBLIC_LISTING_SQL}) daycares
        on daycares.id = centre_job_posts.daycare_id
      where true
        and centre_job_posts.created_at >= now() - interval '18 months'
      group by 1, 2, 3
      `,
    )
    .catch(() => []);

  const jobCounts = await sql
    .query<{ province: string; city: string; n: number }>(
      `
      select upper(btrim(daycares.province)) as province, btrim(daycares.city) as city, count(*)::int as n
      from centre_job_posts
      join (select id, province, city from daycares where ${PUBLIC_LISTING_SQL}) daycares
        on daycares.id = centre_job_posts.daycare_id
      group by 1, 2
      `,
    )
    .catch(() => []);

  const fillRows = await sql
    .query<{ province: string; city: string; n: number; avg_days: number | null }>(
      `
      select upper(btrim(daycares.province)) as province, btrim(daycares.city) as city,
        count(*)::int as n,
        avg(extract(epoch from (spot_offers.responded_at - spot_offers.offered_at)) / 86400.0)::float8 as avg_days
      from spot_offers
      join (select id, province, city from daycares where ${PUBLIC_LISTING_SQL}) daycares
        on daycares.id = spot_offers.daycare_id
      where spot_offers.status = 'accepted'
        and spot_offers.responded_at is not null
      group by 1, 2
      `,
    )
    .catch(() => []);

  const trendKey = new Map<string, TrendFact & { province: string; city: string }>();
  function trend(province: string, city: string, month: string): TrendFact & { province: string; city: string } {
    province = String(province || "");
    city = String(city || "");
    const key = `${province}|${city}|${month}`;
    const found = trendKey.get(key);
    if (found) return found;
    const row = { province, city, month, listings: 0, vacancyUpdates: 0, jobs: 0 };
    trendKey.set(key, row);
    return row;
  }
  for (const row of listingTrend) trend(row.province, row.city, row.month).listings = num(row.n);
  for (const row of vacancyTrend) trend(row.province, row.city, row.month).vacancyUpdates = num(row.n);
  for (const row of jobTrend) trend(row.province, row.city, row.month).jobs = num(row.n);

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
      coordinateCount: num(row.coordinateCount),
    })),
    fees: feeRows.map((row) => ({
      province: String(row.province || ""),
      city: String(row.city || ""),
      kind: row.kind === "confirmed" ? "confirmed" : "uncited",
      bucket: String(row.bucket || ""),
      n: num(row.n),
    })),
    waitlist: waitRows
      .map((row) => {
        const fromBox = String(row.province || "").trim().toUpperCase();
        const fromLabel = String(row.label || "").match(/,\s*([A-Za-z]{2})\s*$/)?.[1]?.toUpperCase() || "";
        const province = isProvinceCode(fromBox) ? fromBox : isProvinceCode(fromLabel) ? fromLabel : "";
        return {
          province,
          age: String(row.age || "any"),
          start: String(row.start || ""),
          n: num(row.n),
        };
      })
      .filter((row) => row.province),
    trends: [...trendKey.values()],
    fill: fillRows.map((row) => ({
      province: String(row.province || ""),
      city: String(row.city || ""),
      n: num(row.n),
      avgDays: row.avg_days == null ? null : num(row.avg_days),
    })),
    jobCounts: jobCounts.map((row) => ({ province: String(row.province || ""), city: String(row.city || ""), n: num(row.n) })),
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

export type StoredLicenceFlag = {
  slug: string;
  name: string;
  city: string;
  status: "expired" | "suspended" | "revoked";
  expiry: string | null;
};

/** Listing status only. This is not a provincial register and has no past events. */
export async function loadStoredLicenceFlags(province: string): Promise<StoredLicenceFlag[]> {
  const code = String(province || "").trim().toUpperCase();
  if (code !== "ALL" && !isProvinceCode(code)) return [];
  const sql = await getSql();
  const whereProvince = code === "ALL" ? "true" : `upper(btrim(province)) = '${code}'`;
  const rows = await sql
    .query<{ slug: string; name: string; city: string; status: string; expiry: string | null }>(
      `
      select slug, name, btrim(city) as city, lower(btrim(license_status)) as status,
        license_expiry::text as expiry
      from daycares
      where ${PUBLIC_LISTING_SQL}
        and lower(btrim(coalesce(license_status, ''))) in ('expired', 'suspended', 'revoked')
        and ${whereProvince}
      order by city, name
      limit 40
      `,
    )
    .catch(() => []);
  return rows
    .map((row) => {
      const status = String(row.status || "");
      if (status !== "expired" && status !== "suspended" && status !== "revoked") return null;
      const slug = String(row.slug || "").trim();
      const name = String(row.name || "").trim();
      if (!slug || !name) return null;
      const expiry = String(row.expiry || "").slice(0, 10);
      return { slug, name, city: String(row.city || "").trim(), status, expiry: expiry || null };
    })
    .filter((row): row is StoredLicenceFlag => Boolean(row));
}
