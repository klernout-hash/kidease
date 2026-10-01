import { getSql } from "@/lib/db";

/** Provincial vacancy tables. Server-only so the schema text is not in the browser bundle. */
export async function ensureProvincialVacancyTables() {
  const sql = await getSql();
  await sql`
    create table if not exists provincial_vacancy (
      id text primary key,
      province text not null,
      source_key text not null,
      source_url text not null,
      fetched_at timestamptz not null,
      source_as_of timestamptz,
      licence text,
      source_name text not null,
      source_address text,
      source_city text,
      daycare_id text,
      match_method text not null,
      infant integer,
      nursery integer,
      preschool integer,
      school_age integer,
      total integer,
      age_label text not null,
      changed_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `.catch(() => undefined);
  await sql`create unique index if not exists provincial_vacancy_source_uidx on provincial_vacancy (province, source_key)`.catch(
    () => undefined,
  );
  await sql`
    create table if not exists provincial_vacancy_runs (
      id text primary key,
      province text not null,
      dry_run boolean not null,
      status text not null,
      reason text,
      source_url text not null,
      fetched_at timestamptz not null,
      matched integer not null,
      unmatched integer not null,
      changed integer not null,
      created_at timestamptz not null default now()
    )
  `.catch(() => undefined);
}
