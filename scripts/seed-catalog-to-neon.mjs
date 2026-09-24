#!/usr/bin/env node
/**
 * Idempotent bulk seed of centres.json (+ extras) into Neon daycares.
 * With MASTER_CSV_PATH, also appends Canada master rows that are not already
 * in the catalogue. Never deletes a row and never blanks a filled contact.
 *
 *   DATABASE_URL=… npm run ops:seed-catalog
 *   DATABASE_URL=… npm run ops:seed-catalog -- --offset=400 --limit=200
 *   MASTER_CSV_PATH=/path/to/master.csv DATABASE_URL=… npm run ops:seed-catalog
 *
 * Does not run on `npm run build`. Never logs phone / email / website values.
 * Never commits or fetches the private master CSV.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dropStoredDuplicateAdditions, syncMasterCatalogue } from "../src/lib/catalog-master-sync.ts";
import { catalogRowsForSeed, clampSeedLimit, clampSeedOffset, seedCatalogChunk } from "../src/lib/catalog-seed.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CHECKPOINT = join(root, "tmp", "seed-catalog-offset.txt");

export function parseSeedArgs(argv = process.argv.slice(2), env = process.env) {
  const opts = {
    offset: Number(env.SEED_CATALOG_OFFSET || 0),
    limit: env.SEED_CATALOG_LIMIT ? Number(env.SEED_CATALOG_LIMIT) : null,
    chunk: Number(env.SEED_CATALOG_CHUNK || 200),
    checkpoint: env.SEED_CATALOG_CHECKPOINT || DEFAULT_CHECKPOINT,
    resume: false,
    dryRun: false,
    help: false,
    masterCsvPath: (env.MASTER_CSV_PATH || "").trim(),
    expectMaster: env.SEED_EXPECT_MASTER ? Number(env.SEED_EXPECT_MASTER) : null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--resume") opts.resume = true;
    else if (arg === "--offset" && next) {
      opts.offset = Number(next);
      i += 1;
    } else if (arg.startsWith("--offset=")) opts.offset = Number(arg.slice("--offset=".length));
    else if (arg === "--limit" && next) {
      opts.limit = Number(next);
      i += 1;
    } else if (arg.startsWith("--limit=")) opts.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--chunk" && next) {
      opts.chunk = Number(next);
      i += 1;
    } else if (arg.startsWith("--chunk=")) opts.chunk = Number(arg.slice("--chunk=".length));
    else if (arg === "--checkpoint" && next) {
      opts.checkpoint = next;
      i += 1;
    } else if (arg.startsWith("--checkpoint=")) opts.checkpoint = arg.slice("--checkpoint=".length);
    else if (arg === "--master-csv" && next) {
      opts.masterCsvPath = next;
      i += 1;
    } else if (arg.startsWith("--master-csv=")) opts.masterCsvPath = arg.slice("--master-csv=".length);
    else if (arg === "--expect-master" && next) {
      opts.expectMaster = Number(next);
      i += 1;
    } else if (arg.startsWith("--expect-master=")) {
      opts.expectMaster = Number(arg.slice("--expect-master=".length));
    }
  }
  return opts;
}

export function seedHelpText() {
  return `Seed centres.json (+ extras) into Neon daycares.

Usage:
  DATABASE_URL=… npm run ops:seed-catalog
  DATABASE_URL=… npm run ops:seed-catalog -- --resume
  DATABASE_URL=… npm run ops:seed-catalog -- --offset=0 --limit=500
  MASTER_CSV_PATH=/secure/path.csv DATABASE_URL=… npm run ops:seed-catalog

Flags:
  --offset N        Skip the first N rows (stable catalogue order)
  --limit N         Stop after N upserts (omit to finish the file)
  --chunk N         Rows per batch (default 200, max 500)
  --resume          Continue from the checkpoint file
  --checkpoint PATH Offset file (default tmp/seed-catalog-offset.txt)
  --dry-run         Load + count only. No DATABASE_URL writes
  --master-csv PATH Private master CSV. Blank-only contacts, plus new Canada rows
  --expect-master N Fail unless the CSV has N rows and the catalogue stays >= N
  --help

The master CSV is not in this repo. Pass MASTER_CSV_PATH or --master-csv.
New rows are appended. Existing rows are never deleted. Filled phone, email,
and website are never replaced with blank. Ages, fees, photos, open spots,
and Live/claim fields are not taken from the CSV.

Claimed, provider-owned, and staffed listings are left unchanged by the upsert.
/api/seed-catalog does not read the private CSV — use this script for the
master close. Never pass secrets on the query string; Authorization: Bearer
$CRON_SECRET is the HTTP seed.
`;
}

function checkpointPath(raw) {
  if (!raw) return DEFAULT_CHECKPOINT;
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

async function readCheckpoint(path) {
  try {
    const n = Number((await readFile(path, "utf8")).trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

async function writeCheckpoint(path, offset) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${offset}\n`, "utf8");
}

async function loadMasterText(path) {
  if (!path) return "";
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  return readFile(abs, "utf8");
}

export function assertMasterLock(summary, expectMaster) {
  if (expectMaster == null || !Number.isFinite(expectMaster)) return;
  const expected = Math.floor(expectMaster);
  if (!summary) throw new Error(`--expect-master=${expected} requires MASTER_CSV_PATH`);
  const accounted =
    summary.matched + summary.added + summary.skippedNoGeo + summary.skippedNonCanada + summary.skippedInvalid;
  if (summary.masterRows !== expected) {
    throw new Error(`master rows ${summary.masterRows} !== lock ${expected}`);
  }
  if (accounted !== summary.masterRows) {
    throw new Error(`master accounting ${accounted} !== ${summary.masterRows} (rows would be dropped)`);
  }
  if (summary.catalogueRows < expected) {
    throw new Error(`catalogue ${summary.catalogueRows} is below master lock ${expected}`);
  }
}

async function defaultLoadCatalog() {
  const { loadJsonCatalogFromDisk } = await import("../src/lib/catalog-hydrate.ts");
  return loadJsonCatalogFromDisk();
}

export async function prepareCatalogRows(opts, loadCatalog = defaultLoadCatalog, loadMaster = loadMasterText) {
  const catalog = catalogRowsForSeed(await loadCatalog());
  const masterText = await loadMaster(opts.masterCsvPath);
  if (!masterText) {
    return { rows: catalog, masterKeys: 0, enriched: 0, summary: null };
  }
  const plan = syncMasterCatalogue(catalog, masterText);
  const rows = catalogRowsForSeed(plan.rows);
  if (rows.length < catalog.length) {
    throw new Error("seed catalogue shrank while applying the master");
  }
  return {
    rows,
    masterKeys: plan.summary.masterRows,
    enriched: plan.summary.contactsFilled,
    summary: plan.summary,
  };
}

async function main() {
  const opts = parseSeedArgs();
  if (opts.help) {
    process.stdout.write(seedHelpText());
    return;
  }

  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!opts.dryRun && !databaseUrl) {
    throw new Error("DATABASE_URL is required (omit only with --dry-run)");
  }

  const prepared = await prepareCatalogRows(opts);
  let seedRows = prepared.rows;
  const file = checkpointPath(opts.checkpoint);
  const databaseUrlReady = !opts.dryRun;
  let pool = null;
  let sql = null;
  try {
    if (databaseUrlReady) {
      const { default: pg } = await import("pg");
      pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
      sql = {
        query: async (text, params = []) => {
          const res = await pool.query(text, params);
          return res.rows;
        },
      };
      const stored = await sql.query(
        `select id, slug, name, city, province, postal_code as "postalCode", license_number as "licenseNumber" from daycares`,
      );
      const filtered = dropStoredDuplicateAdditions(seedRows, stored);
      if (filtered.rows.length + filtered.dropped !== seedRows.length) {
        throw new Error("seed catalogue shrank while skipping rows already in Neon");
      }
      seedRows = filtered.rows;
      console.log(`[seed-catalog] alreadyInNeon=${filtered.dropped} (kept; not inserted again)`);
    }
    const total = seedRows.length;
    let offset = clampSeedOffset(opts.resume ? await readCheckpoint(file) : opts.offset, total);
    const stopAt =
      opts.limit == null ? total : Math.min(total, offset + clampSeedLimit(opts.limit, opts.limit, 1_000_000));
    const chunk = clampSeedLimit(opts.chunk);

    const summary = prepared.summary;
    console.log(
      `[seed-catalog] rows=${total} offset=${offset} stop=${stopAt} chunk=${chunk} dryRun=${opts.dryRun} masterKeys=${prepared.masterKeys} enriched=${prepared.enriched}`,
    );
    if (summary) {
      console.log(
        `[seed-catalog] masterRows=${summary.masterRows} matched=${summary.matched} added=${summary.added} skippedNoGeo=${summary.skippedNoGeo} skippedNonCanada=${summary.skippedNonCanada} skippedInvalid=${summary.skippedInvalid} catalogueRows=${summary.catalogueRows} publicSlugs=${summary.publicSlugs}`,
      );
    }
    assertMasterLock(summary, opts.expectMaster);

    if (opts.dryRun) return;

    while (offset < stopAt) {
      const result = await seedCatalogChunk(sql, seedRows, {
        offset,
        limit: Math.min(chunk, stopAt - offset),
      });
      offset = result.nextOffset;
      await writeCheckpoint(file, offset);
      console.log(
        `[seed-catalog] upserted=${result.upserted} failed=${result.failed} next=${offset}/${total} done=${result.done}`,
      );
      if (result.failed && result.upserted === 0) {
        throw new Error("seed-catalog stopped: a full chunk failed (is 0035_listing_website.sql applied?)");
      }
    }
  } finally {
    if (pool) await pool.end();
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[seed-catalog] failed:", err?.message || err);
    process.exit(1);
  });
}
