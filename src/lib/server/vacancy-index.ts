import { getPublicCatalog } from "@/lib/catalog";
import { dbSource, getSql } from "@/lib/db";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import {
  buildVacancyIndex,
  vacancyConfirmed,
  type VacancyIndex,
  type VacancySourceRow,
} from "@/lib/vacancy-index";

export type VacancyIndexPage = VacancyIndex & { source: "database" | "directory" };

const SQL = `
select province, age_min_months, age_max_months, coalesce(ages_confirmed, 0) as ages_confirmed,
  spots_infant, spots_toddler, spots_preschool, last_vacancy_updated_at, spots_updated_at
from daycares
where ${PUBLIC_LISTING_SQL}
`;

function countedOnToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function stamp(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const text = String(value).trim();
  return text || null;
}

function fromDb(row: {
  province: string | null;
  age_min_months: number | null;
  age_max_months: number | null;
  ages_confirmed: number | boolean | null;
  spots_infant: number | null;
  spots_toddler: number | null;
  spots_preschool: number | null;
  last_vacancy_updated_at: string | Date | null;
  spots_updated_at: string | Date | null;
}): VacancySourceRow {
  const confirmedAges = row.ages_confirmed === 1 || row.ages_confirmed === true;
  return {
    province: row.province,
    ageMinMonths: row.age_min_months,
    ageMaxMonths: row.age_max_months,
    agesKnown: confirmedAges,
    spotsInfant: row.spots_infant,
    spotsToddler: row.spots_toddler,
    spotsPreschool: row.spots_preschool,
    vacancyConfirmed: vacancyConfirmed({
      lastVacancyUpdatedAt: stamp(row.last_vacancy_updated_at),
      spotsUpdatedAt: stamp(row.spots_updated_at),
    }),
  };
}

async function rowsFromDatabase(): Promise<VacancySourceRow[] | null> {
  if (dbSource === "none") return null;
  try {
    const sql = await Promise.race([
      getSql(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("vacancy-index-timeout")), 6000);
      }),
    ]);
    const rows = await sql.query<Parameters<typeof fromDb>[0]>(SQL);
    if (!rows.length) return null;
    return rows.map(fromDb);
  } catch {
    return null;
  }
}

export async function loadVacancyIndex(): Promise<VacancyIndexPage> {
  const countedOn = countedOnToday();
  const live = await rowsFromDatabase();
  if (live) return { ...buildVacancyIndex(live, countedOn), source: "database" };
  const catalog = await getPublicCatalog();
  const rows: VacancySourceRow[] = catalog.map((row) => ({
    province: row.province,
    ageMinMonths: row.ageMinMonths,
    ageMaxMonths: row.ageMaxMonths,
    spotsInfant: row.spotsInfant,
    spotsToddler: row.spotsToddler,
    spotsPreschool: row.spotsPreschool,
    vacancyConfirmed: false,
  }));
  return { ...buildVacancyIndex(rows, countedOn), source: "directory" };
}
