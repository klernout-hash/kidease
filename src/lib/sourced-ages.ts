/**
 * Owner-approved age bounds, 2026-10-02.
 * data/ops/ages-sourced-20261002.csv is matched by listing id.
 * Confirmed ages and claimed listings are never replaced.
 * A claim, provider, or staff link without a claim does not block this fill.
 * Existing ages, sources, and source URLs are never blanked.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsvRecords } from "./catalog-master.ts";

export const SOURCED_AGES_FILE = "data/ops/ages-sourced-20261002.csv";
export const SOURCED_AGES_MIGRATION = "0077_sourced_ages_20261002";
/**
 * Second pass. The first pass also skipped rows that merely had a claim,
 * provider, or staff link. Those Manitoba listings are still unclaimed and
 * still have no ages. This pass fills them. It still skips a real claim.
 */
export const SOURCED_AGES_UNCLAIMED_RETRY = "0078_sourced_ages_unclaimed_retry";
/** Left out of the approved file. Never write ages for this id. */
export const AGES_PROTECTED_LISTING_ID = "d_d85jtifbkh2t";
export const SOURCED_AGES_CHUNK = 400;
const MAX_MONTHS = 216;
const MAX_TEXT = 500;

export type SourcedAge = {
  listingId: string;
  ageMinMonths: number;
  ageMaxMonths: number;
  agesSource: string;
  agesSourceUrl: string;
};

export type AgeQueryResult = {
  rows?: readonly unknown[];
  rowCount?: number | null;
  affectedRows?: number | null;
};

export type AgeQuery = (text: string, params?: unknown[]) => Promise<AgeQueryResult>;

function repoRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function sourcedAgesFilePath(rootDir = repoRoot()) {
  return join(rootDir, SOURCED_AGES_FILE);
}

export async function readSourcedAgesCsv(rootDir = repoRoot()) {
  return readFile(sourcedAgesFilePath(rootDir), "utf8");
}

/** Integers 0 to 216, max greater than min. First row wins. The protected id is dropped. */
export function parseSourcedAges(csvText: string): Map<string, SourcedAge> {
  const map = new Map<string, SourcedAge>();
  const records = parseCsvRecords(csvText);
  if (records.length < 2) return map;
  const header = records[0].map((cell) => cell.trim().toLowerCase());
  const idAt = header.indexOf("listing_id");
  const minAt = header.indexOf("age_min_months");
  const maxAt = header.indexOf("age_max_months");
  const sourceAt = header.indexOf("ages_source");
  const urlAt = header.indexOf("ages_source_url");
  if (idAt < 0 || minAt < 0 || maxAt < 0 || sourceAt < 0 || urlAt < 0) return map;

  for (const record of records.slice(1)) {
    const listingId = (record[idAt] || "").trim();
    if (!listingId || listingId === AGES_PROTECTED_LISTING_ID || map.has(listingId)) continue;
    const ageMinMonths = Number((record[minAt] || "").trim());
    const ageMaxMonths = Number((record[maxAt] || "").trim());
    const agesSource = (record[sourceAt] || "").trim().slice(0, MAX_TEXT);
    const agesSourceUrl = (record[urlAt] || "").trim().slice(0, MAX_TEXT);
    if (!Number.isInteger(ageMinMonths) || !Number.isInteger(ageMaxMonths)) continue;
    if (ageMinMonths < 0 || ageMaxMonths > MAX_MONTHS || ageMinMonths > MAX_MONTHS) continue;
    if (ageMaxMonths <= ageMinMonths) continue;
    if (!agesSource || !agesSourceUrl) continue;
    map.set(listingId, { listingId, ageMinMonths, ageMaxMonths, agesSource, agesSourceUrl });
  }
  return map;
}

let cached: Promise<Map<string, SourcedAge>> | null = null;

export function loadSourcedAges(opts: { required?: boolean; rootDir?: string } = {}) {
  if (opts.rootDir || opts.required) {
    return readSourcedAgesCsv(opts.rootDir).then(parseSourcedAges);
  }
  cached ??= readSourcedAgesCsv()
    .then(parseSourcedAges)
    .catch(() => new Map());
  return cached;
}

export function stampSourcedAge<T extends { id: string }>(
  row: T,
  ages: ReadonlyMap<string, SourcedAge>,
): T {
  if (!row.id || row.id === AGES_PROTECTED_LISTING_ID) return row;
  const hit = ages.get(row.id);
  if (!hit) return row;
  return {
    ...row,
    ageMinMonths: hit.ageMinMonths,
    ageMaxMonths: hit.ageMaxMonths,
    agesConfirmed: 1,
    agesSource: hit.agesSource,
    agesSourceUrl: hit.agesSourceUrl,
  };
}

/**
 * One UPDATE for a chunk. Only rows that already exist, are unclaimed,
 * and are not already confirmed. A pending or approved claim is left alone.
 */
export function sourcedAgeUpdateStatement(rows: readonly SourcedAge[]) {
  const values: string[] = [];
  const params: unknown[] = [];
  let n = 1;
  for (const row of rows) {
    if (row.listingId === AGES_PROTECTED_LISTING_ID) continue;
    values.push(`($${n}, $${n + 1}::int, $${n + 2}::int, $${n + 3}, $${n + 4})`);
    params.push(row.listingId, row.ageMinMonths, row.ageMaxMonths, row.agesSource, row.agesSourceUrl);
    n += 5;
  }
  if (!values.length) return { text: "select id from daycares where false", params: [] };
  params.push(AGES_PROTECTED_LISTING_ID);
  const protectedParam = `$${n}`;
  const text = `
update daycares as d
set age_min_months = v.age_min_months,
    age_max_months = v.age_max_months,
    ages_confirmed = 1,
    ages_source = v.ages_source,
    ages_source_url = v.ages_source_url
from (values ${values.join(", ")}) as v(id, age_min_months, age_max_months, ages_source, ages_source_url)
where d.id = v.id
  and d.id <> ${protectedParam}
  and d.claimed_at is null
  and coalesce(d.ages_confirmed, 0) = 0
  and coalesce(d.claim_status, 'unclaimed') in ('unclaimed', 'declined', '')
returning d.id
`;
  return { text, params };
}

export async function applySourcedAgeUpdates(query: AgeQuery, ages: Iterable<SourcedAge>) {
  const rows = [...ages].filter((row) => row.listingId !== AGES_PROTECTED_LISTING_ID);
  let updated = 0;
  for (let i = 0; i < rows.length; i += SOURCED_AGES_CHUNK) {
    const chunk = rows.slice(i, i + SOURCED_AGES_CHUNK);
    if (!chunk.length) continue;
    const statement = sourcedAgeUpdateStatement(chunk);
    if (!statement.params.length || statement.text.includes("values )")) continue;
    const result = await query(statement.text, statement.params);
    updated += result.rows?.length ?? Number(result.rowCount ?? result.affectedRows ?? 0);
  }
  return updated;
}

/** Runs once per database, recorded in _migrations. Safe to run again. */
export async function applyRecordedSourcedAges(
  query: AgeQuery,
  rootDir = repoRoot(),
  migrationName = SOURCED_AGES_MIGRATION,
) {
  const found = await query("select name from _migrations where name = $1", [migrationName]);
  if ((found.rows?.length ?? 0) > 0) return { updated: 0, applied: false };
  const ages = parseSourcedAges(await readSourcedAgesCsv(rootDir));
  if (ages.size < 1000) {
    throw new Error(`sourced ages file has ${ages.size} rows; expected the approved 2026-10-02 file`);
  }
  const updated = await applySourcedAgeUpdates(query, ages.values());
  await query("insert into _migrations (name) values ($1) on conflict (name) do nothing", [migrationName]);
  return { updated, applied: true };
}
