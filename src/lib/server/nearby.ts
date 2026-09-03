import { dbSource, getSql, type Sql } from "@/lib/db";
import { catalogNear, type CatalogDaycare } from "@/lib/catalog";
import { clampRadiusKm } from "@/lib/proximity";
import { upsertDaycare } from "./seed";

export type NearbyListing = CatalogDaycare & { distanceKm?: number };

type GeoRow = {
  id: string;
  slug: string;
  name: string;
  name_fr: string;
  city: string;
  province: string;
  postal_code: string;
  lat: number;
  lng: number;
  phone: string | null;
  hours: string | null;
  hours_fr: string | null;
  age_min_months: number;
  age_max_months: number;
  infant_monthly: number | null;
  toddler_monthly: number | null;
  preschool_monthly: number | null;
  part_time_monthly: number | null;
  spots_infant: number;
  spots_toddler: number;
  spots_preschool: number;
  waitlist: number;
  rating_x10: number;
  review_count: number;
  license_number: string | null;
  languages: string | null;
  amenities: string | null;
  photos: string | null;
  claimed_at: string | null;
  priority_until: string | null;
  ages_confirmed: number | boolean | null;
  distance_km: number;
};

/** lng, lat, radius_meters — ST_MakePoint is (lng, lat). */
export const NEARBY_SQL = `
select id, slug, name, name_fr, city, province, postal_code, lat, lng,
  phone, hours, hours_fr, age_min_months, age_max_months,
  infant_monthly, toddler_monthly, preschool_monthly, part_time_monthly,
  spots_infant, spots_toddler, spots_preschool, waitlist,
  rating_x10, review_count, license_number, languages, amenities, photos,
  claimed_at, priority_until, ages_confirmed,
  st_distance(location, st_setsrid(st_makepoint($1, $2), 4326)::geography) / 1000.0 as distance_km
from daycares
where location is not null
  and st_dwithin(
    location,
    st_setsrid(st_makepoint($1, $2), 4326)::geography,
    $3
  )
order by location <-> st_setsrid(st_makepoint($1, $2), 4326)::geography
limit 400
`;

export const POSTGIS_READY_SQL = `
select exists (
  select 1 from pg_extension where extname = 'postgis'
) and exists (
  select 1 from information_schema.columns
  where table_name = 'daycares' and column_name = 'location'
) as ok
`;

async function postgisReady(sql: Sql): Promise<boolean> {
  try {
    const rows = await sql.query<{ ok: boolean }>(POSTGIS_READY_SQL);
    return Boolean(rows[0]?.ok);
  } catch {
    return false;
  }
}

async function queryDWithin(sql: Sql, origin: { lat: number; lng: number }, radiusKm: number) {
  const meters = clampRadiusKm(radiusKm) * 1000;
  return sql.query<GeoRow>(NEARBY_SQL, [origin.lng, origin.lat, meters]);
}

function rowToListing(row: GeoRow): NearbyListing {
  const photos = String(row.photos || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameFr: row.name_fr || row.name,
    tagline: "",
    taglineFr: "",
    description: "",
    descriptionFr: "",
    address: "",
    city: row.city || "",
    province: row.province || "",
    postalCode: row.postal_code || "",
    lat: Number(row.lat),
    lng: Number(row.lng),
    phone: row.phone || "",
    hours: row.hours || "",
    hoursFr: row.hours_fr || "",
    ageMinMonths: Number(row.age_min_months) || 0,
    ageMaxMonths: Number(row.age_max_months) || 0,
    infantMonthly: row.infant_monthly,
    toddlerMonthly: row.toddler_monthly,
    preschoolMonthly: row.preschool_monthly,
    partTimeMonthly: row.part_time_monthly,
    spotsInfant: Number(row.spots_infant) || 0,
    spotsToddler: Number(row.spots_toddler) || 0,
    spotsPreschool: Number(row.spots_preschool) || 0,
    waitlist: Number(row.waitlist) || 0,
    ratingX10: Number(row.rating_x10) || 0,
    reviewCount: Number(row.review_count) || 0,
    licenseNumber: row.license_number || row.id,
    languages: row.languages || "en",
    amenities: row.amenities || "licensed",
    photos,
    reviews: [],
    googlePlaceId: null,
    feeConfirmed: Boolean(row.claimed_at),
    distanceKm: Math.round(Number(row.distance_km) * 10) / 10,
  };
}

async function importCatalogSlice(sql: Sql, rows: CatalogDaycare[]) {
  const chunk = 24;
  for (let i = 0; i < rows.length; i += chunk) {
    await Promise.all(
      rows.slice(i, i + chunk).map((d) => upsertDaycare(sql, d).catch(() => undefined)),
    );
  }
}

/**
 * Nearby licensed centres. Prefers Neon PostGIS ST_DWithin and maps DB rows
 * directly — does not load centres.json when geography already has hits.
 * JSON catalogue is only the empty-table fallback, then imported into Neon.
 */
export async function nearbyListings(
  origin: { lat: number; lng: number },
  radiusKm: number,
): Promise<NearbyListing[]> {
  if (dbSource === "neon") {
    try {
      const sql = await getSql();
      if (await postgisReady(sql)) {
        const geo = await queryDWithin(sql, origin, radiusKm);
        if (geo.length > 0) return geo.map(rowToListing);
        const fallback = await catalogNear(origin, radiusKm);
        if (fallback.length > 0) {
          await importCatalogSlice(sql, fallback).catch(() => undefined);
          const again = await queryDWithin(sql, origin, radiusKm);
          if (again.length > 0) return again.map(rowToListing);
        }
        return fallback;
      }
    } catch {
      /* fall through to catalogue */
    }
  }
  return catalogNear(origin, radiusKm);
}
