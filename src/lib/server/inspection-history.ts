import type { Sql } from "@/lib/db";
import { inspectionHistoryEnabled } from "@/lib/features";
import { parseInspectionCache, type InspectionRecord, type PublicInspection } from "@/lib/inspection-history";

export async function ensureInspectionHistory(sql: Sql) {
  await sql`
    create table if not exists listing_inspections (
      id text primary key,
      province text not null,
      licence_number text not null,
      inspected_on date not null,
      outcome text not null,
      summary text not null default '',
      source_url text not null,
      fetched_at timestamptz not null default now()
    )
  `.catch(() => undefined);
  await sql`
    create unique index if not exists listing_inspections_once
      on listing_inspections (province, licence_number, inspected_on, source_url)
  `.catch(() => undefined);
}

export async function readCachedInspections(
  sql: Sql,
  province: string | null | undefined,
  licenceNumber: string | null | undefined,
): Promise<PublicInspection[]> {
  if (!inspectionHistoryEnabled()) return [];
  const code = String(province || "").trim().toUpperCase();
  const licence = String(licenceNumber || "").trim();
  if (!licence || (code !== "ON" && code !== "BC" && code !== "AB")) return [];
  await ensureInspectionHistory(sql);
  const rows = await sql<{ inspected_on: string | Date; outcome: string; summary: string; source_url: string }>`
    select inspected_on, outcome, summary, source_url
    from listing_inspections
    where province = ${code} and licence_number = ${licence}
    order by inspected_on desc
    limit 12
  `.catch(() => []);
  return rows.map((row) => ({
    inspectedOn: String(row.inspected_on).slice(0, 10),
    outcome: row.outcome,
    summary: row.summary,
    sourceUrl: row.source_url,
  }));
}

export async function cacheInspectionRecords(sql: Sql, records: InspectionRecord[]) {
  const clean = parseInspectionCache(records);
  if (!clean.length) return { saved: 0 };
  await ensureInspectionHistory(sql);
  for (const row of clean) {
    const id = inspectionId(row);
    await sql`
      insert into listing_inspections (
        id, province, licence_number, inspected_on, outcome, summary, source_url
      ) values (
        ${id}, ${row.province}, ${row.licenceNumber}, ${row.inspectedOn},
        ${row.outcome}, ${row.summary}, ${row.sourceUrl}
      )
      on conflict (province, licence_number, inspected_on, source_url) do update set
        outcome = excluded.outcome,
        summary = excluded.summary,
        fetched_at = now()
    `;
  }
  return { saved: clean.length };
}

function inspectionId(row: InspectionRecord): string {
  let hash = 0;
  const key = `${row.province}|${row.licenceNumber}|${row.inspectedOn}|${row.sourceUrl}`;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  return `ins_${hash.toString(36)}`;
}
