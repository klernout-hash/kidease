import { getSql } from "@/lib/db";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import {
  AGE_VACANCY_SITEMAP_PATH,
  buildAgeVacancyPages,
  cityAgeSlug,
  isAgeVacancyGroup,
  renderAgeVacancySitemapXml,
  type AgeVacancyInput,
  type AgeVacancyPage,
} from "@/lib/age-vacancy";

type Row = {
  id: string;
  slug: string | null;
  name: string | null;
  city: string | null;
  province: string | null;
  age_min_months: number | null;
  age_max_months: number | null;
  spots_infant: number | null;
  spots_toddler: number | null;
  spots_preschool: number | null;
  infant_monthly: number | null;
  toddler_monthly: number | null;
  preschool_monthly: number | null;
};

const TTL_MS = 60_000;
let cache: { at: number; rows: AgeVacancyInput[] } | null = null;

function mapRow(row: Row): AgeVacancyInput {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    province: row.province,
    ageMinMonths: row.age_min_months,
    ageMaxMonths: row.age_max_months,
    spotsInfant: row.spots_infant,
    spotsToddler: row.spots_toddler,
    spotsPreschool: row.spots_preschool,
    infantMonthly: row.infant_monthly,
    toddlerMonthly: row.toddler_monthly,
    preschoolMonthly: row.preschool_monthly,
  };
}

export async function loadAgeVacancyRows(): Promise<AgeVacancyInput[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.rows;
  const sql = await getSql();
  const rows = await sql.query<Row>(
    `select id, slug, name, city, province, age_min_months, age_max_months,
            spots_infant, spots_toddler, spots_preschool,
            infant_monthly, toddler_monthly, preschool_monthly
       from daycares
      where ${PUBLIC_LISTING_SQL}
        and age_min_months is not null
        and age_max_months is not null`,
  ).catch(() => [] as Row[]);
  const mapped = rows.map(mapRow);
  cache = { at: now, rows: mapped };
  return mapped;
}

export async function loadAgeVacancyPage(city: string, age: string): Promise<AgeVacancyPage | null> {
  if (!isAgeVacancyGroup(age)) return null;
  const slug = cityAgeSlug(city);
  if (!slug) return null;
  const pages = buildAgeVacancyPages(await loadAgeVacancyRows());
  return pages.find((page) => page.citySlug === slug && page.age === age) ?? null;
}

export async function ageVacancySitemapXml(): Promise<string> {
  const paths = buildAgeVacancyPages(await loadAgeVacancyRows()).map(
    (page) => `/daycare/${page.citySlug}/${page.age}`,
  );
  return renderAgeVacancySitemapXml(paths);
}

export function isAgeVacancySitemapPath(pathname: string): boolean {
  const path = String(pathname || "").split("?")[0] || "/";
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed === AGE_VACANCY_SITEMAP_PATH;
}
