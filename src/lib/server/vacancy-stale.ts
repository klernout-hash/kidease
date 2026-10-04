import { getSql } from "@/lib/db";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import { VACANCY_STALE_DAYS, vacancyAgeDays } from "@/lib/vacancy-decay";

export type UnconfirmedVacancy = {
  id: string;
  name: string;
  city: string;
  province: string;
  slug: string;
  lastVacancyUpdatedAt: string | null;
  ageDays: number | null;
};

export type UnconfirmedVacancyList = {
  staleDays: number;
  total: number;
  rows: UnconfirmedVacancy[];
};

const EMPTY: UnconfirmedVacancyList = { staleDays: VACANCY_STALE_DAYS, total: 0, rows: [] };

function iso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const text = String(value).trim();
  return text || null;
}

/**
 * Public listings whose vacancy confirm is missing or 30+ days old.
 * This list is for the admin desk. It does not remove anyone from search.
 */
export async function listUnconfirmedVacancies(limit = 40): Promise<UnconfirmedVacancyList> {
  const cap = Math.min(80, Math.max(1, Math.round(limit)));
  try {
    const sql = await getSql();
    const where = `
      ${PUBLIC_LISTING_SQL}
      and (
        coalesce(last_vacancy_updated_at, spots_updated_at) is null
        or coalesce(last_vacancy_updated_at, spots_updated_at) < now() - interval '30 days'
      )
    `;
    const counts = await sql.query<{ total: number }>(
      `select count(*)::int as total from daycares where ${where}`,
    );
    const rows = await sql.query<{
      id: string;
      name: string | null;
      city: string | null;
      province: string | null;
      slug: string | null;
      confirmed_at: string | Date | null;
    }>(
      `select id, name, city, province, slug,
              coalesce(last_vacancy_updated_at, spots_updated_at) as confirmed_at
       from daycares
       where ${where}
       order by confirmed_at asc nulls first, name asc
       limit $1`,
      [cap],
    );
    const now = Date.now();
    return {
      staleDays: VACANCY_STALE_DAYS,
      total: Number(counts[0]?.total ?? rows.length),
      rows: rows.map((row) => {
        const lastVacancyUpdatedAt = iso(row.confirmed_at);
        const stamp = { lastVacancyUpdatedAt };
        return {
          id: row.id,
          name: row.name || "Daycare",
          city: row.city || "",
          province: row.province || "",
          slug: row.slug || "",
          lastVacancyUpdatedAt,
          ageDays: vacancyAgeDays(stamp, now),
        };
      }),
    };
  } catch {
    return EMPTY;
  }
}
