import type { Sql } from "@/lib/db";
import { catalogMonths, type CatalogDaycare } from "@/lib/catalog";
import { DAYCARE_UPSERT_SQL, daycareUpsertParams } from "@/lib/catalog-upsert";

/** Nationwide catalogue is seeded explicitly. SQL does not auto-import 20k rows. */
export async function ensureSeed(_sql: Sql) {
  return;
}

export async function upsertDaycare(
  sql: Sql,
  d: CatalogDaycare,
  opts: { availability?: boolean } = {},
) {
  await sql.query(DAYCARE_UPSERT_SQL, daycareUpsertParams(d));
  if (opts.availability === false) return;
  const months = catalogMonths();
  for (const month of months) {
    await sql.query(
      `insert into availability (daycare_id, month, infant, toddler, preschool)
       values ($1, $2, $3, $4, $5)
       on conflict (daycare_id, month) do nothing`,
      [d.id, month, d.spotsInfant, d.spotsToddler, d.spotsPreschool],
    );
  }
}
