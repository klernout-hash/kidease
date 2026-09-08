import { dbSource, getSql, type Sql } from "@/lib/db";
import type { CatalogDaycare } from "@/lib/catalog";
import {
  catalogSourceFromEnv,
  neonCatalogMinCount,
  preferNeonCatalog,
} from "@/lib/catalog-source";
import { clampRadiusKm } from "@/lib/proximity";
import { listingVisibilityOf } from "@/lib/listing-visibility";
import { normalizeLicenseStatus, normalizeMatchState } from "@/lib/trust";

export type CatalogDbRow = {
  id: string;
  slug: string;
  name: string;
  name_fr: string | null;
  tagline: string | null;
  tagline_fr: string | null;
  description: string | null;
  description_fr: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  hours: string | null;
  hours_fr: string | null;
  age_min_months: number | null;
  age_max_months: number | null;
  infant_monthly: number | null;
  toddler_monthly: number | null;
  preschool_monthly: number | null;
  part_time_monthly: number | null;
  spots_infant: number | null;
  spots_toddler: number | null;
  spots_preschool: number | null;
  waitlist: number | null;
  rating_x10: number | null;
  review_count: number | null;
  license_number: string | null;
  license_status?: string | null;
  registry_match_state?: string | null;
  license_verification_source?: string | null;
  languages: string | null;
  amenities: string | null;
  photos: string | null;
  claimed_at: string | null;
  visibility: string | null;
  is_test: number | boolean | null;
  google_place_id?: string | null;
  contact_email?: string | null;
  website?: string | null;
  distance_km?: number | null;
};

export const CATALOG_SELECT = `
id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
address, city, province, postal_code, lat, lng, phone, hours, hours_fr,
age_min_months, age_max_months, infant_monthly, toddler_monthly,
preschool_monthly, part_time_monthly, spots_infant, spots_toddler,
spots_preschool, waitlist, rating_x10, review_count, license_number,
license_status, registry_match_state, license_verification_source,
languages, amenities, photos, claimed_at, visibility, is_test,
google_place_id, contact_email, website
`;

export const PUBLIC_CATALOG_COUNT_SQL = `
select count(*)::int as n
from daycares
where coalesce(is_test, 0) = 0
  and coalesce(visibility, 'public') = 'public'
`;

export const POSTGIS_READY_SQL = `
select exists (
  select 1 from pg_extension where extname = 'postgis'
) and exists (
  select 1 from information_schema.columns
  where table_name = 'daycares' and column_name = 'location'
) as ok
`;

/** lng, lat, radius_meters — ST_MakePoint is (lng, lat). */
export const NEON_NEAR_SQL = `
select ${CATALOG_SELECT},
  st_distance(location, st_setsrid(st_makepoint($1, $2), 4326)::geography) / 1000.0 as distance_km
from daycares
where location is not null
  and coalesce(visibility, 'public') = 'public'
  and coalesce(is_test, 0) = 0
  and st_dwithin(
    location,
    st_setsrid(st_makepoint($1, $2), 4326)::geography,
    $3
  )
order by location <-> st_setsrid(st_makepoint($1, $2), 4326)::geography
limit 400
`;

/** lngA, latA, radius_meters, lngB, latB — intersection of two ST_DWithin circles. */
export const NEON_DUAL_NEAR_SQL = `
select ${CATALOG_SELECT},
  st_distance(location, st_setsrid(st_makepoint($1, $2), 4326)::geography) / 1000.0 as distance_km
from daycares
where location is not null
  and coalesce(visibility, 'public') = 'public'
  and coalesce(is_test, 0) = 0
  and st_dwithin(
    location,
    st_setsrid(st_makepoint($1, $2), 4326)::geography,
    $3
  )
  and st_dwithin(
    location,
    st_setsrid(st_makepoint($4, $5), 4326)::geography,
    $3
  )
order by location <-> st_setsrid(st_makepoint($1, $2), 4326)::geography
limit 400
`;

const COUNT_TTL_MS = 30_000;
let countCache: { at: number; n: number } | null = null;
let neonAllCache: CatalogDaycare[] | null = null;

export function resetNeonCatalogCache() {
  countCache = null;
  neonAllCache = null;
}

export function catalogRowRenderable(row: Pick<CatalogDbRow, "id" | "slug">): boolean {
  return Boolean(String(row.id || "").trim() && String(row.slug || "").trim());
}

export function catalogRowToListing(row: CatalogDbRow): CatalogDaycare {
  const photos = String(row.photos || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const id = String(row.id || "").trim();
  const slug = String(row.slug || "").trim() || id;
  const name = String(row.name || "").trim() || slug || id || "Licensed centre";
  const visibility = listingVisibilityOf({
    id,
    slug,
    name,
    licenseNumber: row.license_number,
    visibility: row.visibility,
    isTest: row.is_test,
  });
  return {
    id,
    slug,
    name,
    nameFr: row.name_fr || name,
    tagline: row.tagline || "",
    taglineFr: row.tagline_fr || "",
    description: row.description || "",
    descriptionFr: row.description_fr || "",
    address: row.address || "",
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
    licenseStatus: normalizeLicenseStatus(row.license_status),
    registryMatchState: normalizeMatchState(row.registry_match_state),
    licenseVerificationSource: row.license_verification_source || null,
    languages: row.languages || "en",
    amenities: row.amenities || "licensed",
    photos,
    reviews: [],
    googlePlaceId: row.google_place_id ?? null,
    feeConfirmed: Boolean(row.claimed_at),
    visibility,
    isTest: row.is_test === 1 || row.is_test === true || visibility === "admin_only",
    contactEmail: row.contact_email || "",
    website: row.website || "",
  };
}

function rejectAfter(ms: number, message: string) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

export async function postgisReady(sql: Sql): Promise<boolean> {
  try {
    const rows = await sql.query<{ ok: boolean }>(POSTGIS_READY_SQL);
    return Boolean(rows[0]?.ok);
  } catch {
    return false;
  }
}

export async function countPublicDaycares(sql: Sql): Promise<number> {
  const now = Date.now();
  if (countCache && now - countCache.at < COUNT_TTL_MS) return countCache.n;
  const rows = await sql.query<{ n: number }>(PUBLIC_CATALOG_COUNT_SQL);
  const n = Number(rows[0]?.n) || 0;
  countCache = { at: now, n };
  return n;
}

export async function isNeonCatalogPreferred(sql?: Sql): Promise<boolean> {
  if (dbSource !== "neon") return false;
  try {
    const client = sql ?? (await Promise.race([getSql(), rejectAfter(4000, "catalog-count-timeout")]));
    const publicCount = await countPublicDaycares(client);
    return preferNeonCatalog({
      source: catalogSourceFromEnv(),
      neonAvailable: true,
      publicCount,
      minCount: neonCatalogMinCount(),
    });
  } catch {
    return false;
  }
}

export async function loadNeonCatalogIfPreferred(): Promise<CatalogDaycare[] | null> {
  if (dbSource !== "neon") return null;
  try {
    const sql = await Promise.race([getSql(), rejectAfter(6000, "catalog-sql-timeout")]);
    if (!(await isNeonCatalogPreferred(sql))) return null;
    if (neonAllCache) return neonAllCache;
    const rows = await sql.query<CatalogDbRow>(`select ${CATALOG_SELECT} from daycares`);
    neonAllCache = rows.filter(catalogRowRenderable).map(catalogRowToListing);
    return neonAllCache;
  } catch {
    return null;
  }
}

export async function neonCatalogBySlug(slug: string): Promise<CatalogDaycare | null> {
  if (dbSource !== "neon") return null;
  try {
    const sql = await Promise.race([getSql(), rejectAfter(6000, "catalog-sql-timeout")]);
    if (!(await isNeonCatalogPreferred(sql))) return null;
    const rows = await sql.query<CatalogDbRow>(
      `select ${CATALOG_SELECT} from daycares where slug = $1 limit 1`,
      [slug],
    );
    return rows[0] && catalogRowRenderable(rows[0]) ? catalogRowToListing(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function neonCatalogById(id: string): Promise<CatalogDaycare | null> {
  if (dbSource !== "neon") return null;
  try {
    const sql = await Promise.race([getSql(), rejectAfter(6000, "catalog-sql-timeout")]);
    if (!(await isNeonCatalogPreferred(sql))) return null;
    const rows = await sql.query<CatalogDbRow>(
      `select ${CATALOG_SELECT} from daycares where id = $1 limit 1`,
      [id],
    );
    return rows[0] && catalogRowRenderable(rows[0]) ? catalogRowToListing(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function neonCatalogByIds(ids: string[]): Promise<CatalogDaycare[] | null> {
  if (dbSource !== "neon") return null;
  const wanted = ids.filter(Boolean);
  if (wanted.length === 0) return [];
  try {
    const sql = await Promise.race([getSql(), rejectAfter(6000, "catalog-sql-timeout")]);
    if (!(await isNeonCatalogPreferred(sql))) return null;
    const rows = await sql.query<CatalogDbRow>(
      `select ${CATALOG_SELECT} from daycares where id = any($1::text[])`,
      [wanted],
    );
    const byId = new Map(
      rows.filter(catalogRowRenderable).map((row) => [String(row.id).trim(), catalogRowToListing(row)]),
    );
    return wanted.map((id) => byId.get(id)).filter((d): d is CatalogDaycare => Boolean(d));
  } catch {
    return null;
  }
}

export async function queryNeonNearby(
  origin: { lat: number; lng: number },
  radiusKm: number,
  sql?: Sql,
): Promise<(CatalogDaycare & { distanceKm?: number })[] | null> {
  if (dbSource !== "neon") return null;
  try {
    const client = sql ?? (await Promise.race([getSql(), rejectAfter(6000, "nearby-sql-timeout")]));
    if (!(await postgisReady(client))) return null;
    const meters = clampRadiusKm(radiusKm) * 1000;
    const rows = await Promise.race([
      client.query<CatalogDbRow>(NEON_NEAR_SQL, [origin.lng, origin.lat, meters]),
      rejectAfter(6000, "nearby-dwithin-timeout"),
    ]);
    return rows.filter(catalogRowRenderable).map((row) => ({
      ...catalogRowToListing(row),
      distanceKm: Math.round(Number(row.distance_km) * 10) / 10,
    }));
  } catch {
    return null;
  }
}

export async function nearbyFromNeonIfPreferred(
  origin: { lat: number; lng: number },
  radiusKm: number,
): Promise<(CatalogDaycare & { distanceKm?: number })[] | null> {
  if (!(await isNeonCatalogPreferred())) return null;
  return queryNeonNearby(origin, radiusKm);
}

export async function queryNeonNearbyDual(
  originA: { lat: number; lng: number },
  originB: { lat: number; lng: number },
  radiusKm: number,
  sql?: Sql,
): Promise<(CatalogDaycare & { distanceKm?: number })[] | null> {
  if (dbSource !== "neon") return null;
  try {
    const client = sql ?? (await Promise.race([getSql(), rejectAfter(6000, "nearby-sql-timeout")]));
    if (!(await postgisReady(client))) return null;
    const meters = clampRadiusKm(radiusKm) * 1000;
    const rows = await Promise.race([
      client.query<CatalogDbRow>(NEON_DUAL_NEAR_SQL, [originA.lng, originA.lat, meters, originB.lng, originB.lat]),
      rejectAfter(6000, "nearby-dual-dwithin-timeout"),
    ]);
    return rows.map((row) => ({
      ...catalogRowToListing(row),
      distanceKm: Math.round(Number(row.distance_km) * 10) / 10,
    }));
  } catch {
    return null;
  }
}
