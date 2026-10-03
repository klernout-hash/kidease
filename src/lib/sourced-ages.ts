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
/** Third pass. Match ids the site trims, and only skip a real claim. */
export const SOURCED_AGES_ID_TRIM = "0079_sourced_ages_id_trim";
/**
 * Runtime pass. The production site reads the same database it serves.
 * This finishes the fill there when the build migrator did not.
 */
export const SOURCED_AGES_RUNTIME = "0080_sourced_ages_runtime";
const RUNTIME_CURSOR_KEY = "sourced_ages_20261002";
/**
 * Edges JavaScript trim() removes. The public id is trimmed, so a stored id
 * with the same edges must still match the approved file.
 */
const ID_TRIM_CLASS = "\\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
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
where ${trimmedIdSql("d.id")} = ${trimmedIdSql("v.id")}
  and ${trimmedIdSql("d.id")} <> ${protectedParam}
  and d.claimed_at is null
  and coalesce(d.ages_confirmed, 0) = 0
  and lower(btrim(coalesce(d.claim_status, 'unclaimed'))) not in
    ('pending', 'waiting', 'approved', 'verified', 'live', 'active')
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
  const root = typeof rootDir === "string" && rootDir.length > 0 ? rootDir : repoRoot();
  const ages = parseSourcedAges(await readSourcedAgesCsv(root));
  if (ages.size < 1000) {
    throw new Error(`sourced ages file has ${ages.size} rows; expected the approved 2026-10-02 file`);
  }
  const updated = await applySourcedAgeUpdates(query, ages.values());
  await query("insert into _migrations (name) values ($1) on conflict (name) do nothing", [migrationName]);
  return { updated, applied: true };
}

function trimmedIdSql(column: string) {
  return `regexp_replace(${column}, '^[${ID_TRIM_CLASS}]+|[${ID_TRIM_CLASS}]+$', '', 'g')`;
}

/**
 * One slice of the approved file. Safe to call on every health check.
 * Stops after the slice is recorded. Never blanks a confirmed or claimed row.
 */
export async function advanceSourcedAgeFill(
  query: AgeQuery,
  csvText: string,
  opts: { migrationName?: string; chunk?: number; minRows?: number } = {},
) {
  const migrationName = opts.migrationName ?? SOURCED_AGES_RUNTIME;
  const chunk = opts.chunk ?? SOURCED_AGES_CHUNK;
  const minRows = opts.minRows ?? 1000;
  const found = await query("select name from _migrations where name = $1", [migrationName]);
  if ((found.rows?.length ?? 0) > 0) return { done: true, updated: 0, cursor: 0, total: 0 };

  const ages = [...parseSourcedAges(csvText).values()];
  if (ages.length < minRows) {
    throw new Error(`sourced ages file has ${ages.length} rows; expected the approved 2026-10-02 file`);
  }

  await query("create table if not exists _ops_state (key text primary key, value text not null)");
  await query(
    "insert into _ops_state (key, value) values ($1, '0') on conflict (key) do nothing",
    [RUNTIME_CURSOR_KEY],
  );
  const stepped = await query(
    "update _ops_state set value = (value::int + $2)::text where key = $1 returning value::int as cursor",
    [RUNTIME_CURSOR_KEY, chunk],
  );
  const end = Number((stepped.rows?.[0] as { cursor?: number | string } | undefined)?.cursor ?? 0);
  const start = end - chunk;
  if (start >= ages.length) {
    await query("insert into _migrations (name) values ($1) on conflict (name) do nothing", [migrationName]);
    return { done: true, updated: 0, cursor: start, total: ages.length };
  }
  const updated = await applySourcedAgeUpdates(query, ages.slice(start, end));
  const done = end >= ages.length;
  if (done) {
    await query("insert into _migrations (name) values ($1) on conflict (name) do nothing", [migrationName]);
  }
  return { done, updated, cursor: end, total: ages.length };
}

export type AgeProbeRow = {
  id: string;
  chars: number;
  claim: string;
  unclaimed: boolean;
  confirmed: number;
  min: number;
  max: number;
  slug: string;
};

/** Rows the public pages read, matched by trimmed id or slug. */
export async function probeAgeListings(
  query: AgeQuery,
  ids: readonly string[],
  slugs: readonly string[],
): Promise<AgeProbeRow[]> {
  const result = await query(
    `select id, char_length(id)::int as chars, claim_status, claimed_at is null as unclaimed,
            coalesce(ages_confirmed, 0)::int as confirmed,
            coalesce(age_min_months, 0)::int as min_months,
            coalesce(age_max_months, 0)::int as max_months,
            slug
       from daycares
      where ${trimmedIdSql("id")} = any($1::text[])
         or slug = any($2::text[])`,
    [ids, slugs],
  );
  return (result.rows ?? []).map((row) => {
    const record = row as {
      id?: string;
      chars?: number | string;
      claim_status?: string | null;
      unclaimed?: boolean | null;
      confirmed?: number | string;
      min_months?: number | string;
      max_months?: number | string;
      slug?: string | null;
    };
    return {
      id: String(record.id ?? ""),
      chars: Number(record.chars ?? 0),
      claim: String(record.claim_status ?? ""),
      unclaimed: record.unclaimed !== false,
      confirmed: Number(record.confirmed ?? 0),
      min: Number(record.min_months ?? 0),
      max: Number(record.max_months ?? 0),
      slug: String(record.slug ?? ""),
    };
  });
}
