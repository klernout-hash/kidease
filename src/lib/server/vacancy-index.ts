import { getSql } from "@/lib/db";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import { buildVacancyIndex, type VacancyIndex, type VacancyListingRow } from "@/lib/vacancy-index";

type DbRow = {
  province: string | null;
  age_min_months: number | null;
  age_max_months: number | null;
  spots_infant: number | null;
  spots_toddler: number | null;
  spots_preschool: number | null;
  infant_monthly: number | string | null;
  toddler_monthly: number | string | null;
  preschool_monthly: number | string | null;
};

const SQL = `
select province, age_min_months, age_max_months,
  spots_infant, spots_toddler, spots_preschool,
  infant_monthly, toddler_monthly, preschool_monthly
from daycares
where ${PUBLIC_LISTING_SQL}
  and age_min_months is not null
  and age_max_months is not null
  and age_max_months > age_min_months
`;

function money(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function loadVacancyIndex(now = new Date()): Promise<VacancyIndex> {
  const sql = await getSql();
  const rows = await sql.query<DbRow>(SQL);
  const mapped: VacancyListingRow[] = rows.map((row) => ({
    province: row.province || "",
    ageMinMonths: Number(row.age_min_months) || 0,
    ageMaxMonths: Number(row.age_max_months) || 0,
    spotsInfant: row.spots_infant,
    spotsToddler: row.spots_toddler,
    spotsPreschool: row.spots_preschool,
    infantMonthly: money(row.infant_monthly),
    toddlerMonthly: money(row.toddler_monthly),
    preschoolMonthly: money(row.preschool_monthly),
  }));
  return buildVacancyIndex(mapped, now);
}
