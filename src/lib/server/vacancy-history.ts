/**
 * Writes a vacancy confirm only when FEATURE_PROVINCIAL_VACANCY_INDEX is on.
 * The public index still loads when this flag is off.
 */

import { getSql } from "@/lib/db";
import { provincialVacancyIndexEnabled } from "@/lib/features";
import { nid } from "@/lib/utils";
import {
  officialOpeningTotal,
  parseVacancyProvince,
  shouldRecordVacancy,
  type OfficialOpeningTotal,
  type VacancyEventSource,
  type VacancySpotSnapshot,
} from "@/lib/vacancy-history";

export type VacancyHistoryView = {
  id: string;
  name: string;
  at: string;
  source: VacancyEventSource;
  infant: number | null;
  toddler: number | null;
  preschool: number | null;
};

type Sql = Awaited<ReturnType<typeof getSql>>;

function numOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function stamp(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const text = String(value).trim();
  return text || null;
}

async function ensureVacancyEventTable(sql: Sql) {
  await sql`
    create table if not exists vacancy_events (
      id text primary key,
      daycare_id text not null,
      province text not null default '',
      recorded_at timestamptz not null default now(),
      source text not null,
      spots_infant integer,
      spots_toddler integer,
      spots_preschool integer,
      previous_updated_at timestamptz
    )
  `.catch(() => undefined);
}

export async function recordVacancyEvent(input: {
  daycareId: string;
  source: VacancyEventSource;
  before?: VacancySpotSnapshot | null;
  previousUpdatedAt?: string | null;
}): Promise<{ recorded: boolean }> {
  if (!provincialVacancyIndexEnabled()) return { recorded: false };
  const daycareId = String(input.daycareId || "").trim();
  if (!daycareId) return { recorded: false };
  try {
    const sql = await getSql();
    await ensureVacancyEventTable(sql);
    const rows = await sql<{
      province: string | null;
      spots_infant: number | null;
      spots_toddler: number | null;
      spots_preschool: number | null;
      last_vacancy_updated_at: string | Date | null;
    }>`
      select province, spots_infant, spots_toddler, spots_preschool, last_vacancy_updated_at
      from daycares
      where id = ${daycareId}
      limit 1
    `;
    const row = rows[0];
    if (!row) return { recorded: false };
    const after: VacancySpotSnapshot = {
      infant: numOrNull(row.spots_infant),
      toddler: numOrNull(row.spots_toddler),
      preschool: numOrNull(row.spots_preschool),
    };
    if (!shouldRecordVacancy({ source: input.source, before: input.before, after })) return { recorded: false };
    const previous = input.previousUpdatedAt ?? stamp(row.last_vacancy_updated_at);
    const province = parseVacancyProvince(row.province) || String(row.province || "").trim().slice(0, 40);
    await sql`
      update daycares
      set last_vacancy_updated_at = now(), spots_updated_at = now()
      where id = ${daycareId}
    `;
    await sql`
      insert into vacancy_events (
        id, daycare_id, province, source, spots_infant, spots_toddler, spots_preschool, previous_updated_at
      ) values (
        ${nid("vac")}, ${daycareId}, ${province}, ${input.source},
        ${after.infant}, ${after.toddler}, ${after.preschool}, ${previous}
      )
    `;
    return { recorded: true };
  } catch {
    return { recorded: false };
  }
}

export async function loadProvinceHistory(province: string): Promise<VacancyHistoryView[]> {
  const code = parseVacancyProvince(province);
  if (!code || !provincialVacancyIndexEnabled()) return [];
  try {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string | null;
      recorded_at: string | Date;
      source: string;
      spots_infant: number | null;
      spots_toddler: number | null;
      spots_preschool: number | null;
    }>`
      select e.id, d.name, e.recorded_at, e.source, e.spots_infant, e.spots_toddler, e.spots_preschool
      from vacancy_events e
      join daycares d on d.id = e.daycare_id
      where e.province = ${code}
        and coalesce(d.visibility, 'public') = 'public'
        and coalesce(d.is_test, 0) = 0
        and coalesce(d.is_demo, 0) = 0
      order by e.recorded_at desc
      limit 20
    `;
    return rows.flatMap((row) => {
      const source = row.source === "edit" || row.source === "import" || row.source === "confirm" ? row.source : null;
      const at = stamp(row.recorded_at);
      if (!source || !at || !row.name) return [];
      return [
        {
          id: row.id,
          name: row.name,
          at,
          source,
          infant: numOrNull(row.spots_infant),
          toddler: numOrNull(row.spots_toddler),
          preschool: numOrNull(row.spots_preschool),
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function loadOfficialOpenings(province: string): Promise<OfficialOpeningTotal | null> {
  const code = parseVacancyProvince(province);
  if (!code || !provincialVacancyIndexEnabled()) return null;
  try {
    const sql = await getSql();
    const rows = await sql<{ centres: number | string | null; openings: number | string | null; fetched_at: string | Date | null }>`
      select count(*)::int as centres, sum(total)::int as openings, max(fetched_at) as fetched_at
      from provincial_vacancy
      where province = ${code} and total is not null
    `;
    const row = rows[0];
    if (!row) return null;
    return officialOpeningTotal({
      centres: Number(row.centres),
      openings: row.openings == null ? null : Number(row.openings),
      fetchedAt: stamp(row.fetched_at),
    });
  } catch {
    return null;
  }
}
