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
import {
  dropStoredDuplicateAdditions,
  parseMasterFacilities,
  planStaleMasterHides,
  syncMasterCatalogue,
} from "../src/lib/catalog-master-sync.ts";
import { REMOVED_FROM_MASTER_FAULT } from "../src/lib/listing-visibility.ts";
import { catalogRowsForSeed, clampSeedLimit, clampSeedOffset, seedCatalogChunk } from "../src/lib/catalog-seed.ts";
import { loadSourcedAges, stampSourcedAge } from "../src/lib/sourced-ages.ts";

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
    hideStale: true,
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
    }     else if (arg.startsWith("--expect-master=")) {
      opts.expectMaster = Number(arg.slice("--expect-master=".length));
    } else if (arg === "--no-hide-stale") opts.hideStale = false;
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
  --no-hide-stale   Leave mx- rows whose facility_id has left the master
  --help

The master CSV is not in this repo. Pass MASTER_CSV_PATH or --master-csv.
New rows are appended. Existing rows are never deleted. Filled phone, email,
and website are never replaced with blank. Fees, photos, open spots,
and Live/claim fields are not taken from the master CSV.

Approved ages come from data/ops/ages-sourced-20261002.csv, matched by listing id.
That file sets age_min_months, age_max_months, ages_confirmed = 1, ages_source,
and ages_source_url. It never overwrites ages_confirmed = 1, a claimed listing,
or an owner-linked listing, and it never blanks an age range that is already filled.

With a master CSV, mx- rows whose facility_id is gone are hidden
(listing_active = 0, import_fault = removed_from_master). That is the default.
Claimed rows and kids-world-daycare-kh2t are not hidden. If the hide count is
above the safety cap, the seed stops and writes nothing. --no-hide-stale skips
that step. A dry-run with DATABASE_URL prints the count and does not write.

Claimed, provider-owned, and staffed listings are left unchanged by the upsert.
/api/seed-catalog does not read the private master CSV. Use this script for the
master close. Both paths apply the approved ages file when it is on disk.
Never pass secrets on the query string; Authorization: Bearer
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
  const ages = await loadSourcedAges({ required: true, rootDir: root });
  const masterText = await loadMaster(opts.masterCsvPath);
  if (!masterText) {
    return {
      rows: catalog.map((row) => stampSourcedAge(row, ages)),
      masterKeys: 0,
      enriched: 0,
      summary: null,
      sourcedAges: ages.size,
    };
  }
  const plan = syncMasterCatalogue(catalog, masterText, ages);
  const rows = catalogRowsForSeed(plan.rows);
  if (rows.length < catalog.length) {
    throw new Error("seed catalogue shrank while applying the master");
  }
  return {
    rows,
    masterKeys: plan.summary.masterRows,
    enriched: plan.summary.contactsFilled,
    summary: plan.summary,
    sourcedAges: ages.size,
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
  const databaseUrlReady = Boolean(databaseUrl);
  let pool = null;
  let sql = null;
  let staleHide = null;
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
        `select id, slug, name, city, province, address,
                postal_code as "postalCode",
                license_number as "licenseNumber",
                claimed_at as "claimedAt",
                claim_status as "claimStatus",
                merged_into as "mergedInto",
                import_fault as "importFault",
                (
                  (select count(*)::int from provider_daycares p where p.daycare_id = daycares.id)
                  + (select count(*)::int from listing_claims lc
                      where lc.daycare_id = daycares.id
                        and coalesce(lc.status, '') not in ('rejected', 'withdrawn', 'cancelled'))
                  + (select count(*)::int from centre_members cm
                      where cm.daycare_id = daycares.id and cm.status = 'active')
                ) as "ownerCount"
           from daycares`,
      );
      const filtered = dropStoredDuplicateAdditions(seedRows, stored);
      if (filtered.rows.length + filtered.dropped !== seedRows.length) {
        throw new Error("seed catalogue shrank while skipping rows already in Neon");
      }
      seedRows = filtered.rows;
      console.log(`[seed-catalog] alreadyInNeon=${filtered.dropped} (kept; not inserted again)`);
      if (opts.masterCsvPath && opts.hideStale) {
        const master = parseMasterFacilities(await loadMasterText(opts.masterCsvPath));
        const stale = planStaleMasterHides(
          stored,
          master.rows.map((row) => row.facilityId),
        );
        staleHide = stale;
        console.log(
          `[seed-catalog] staleMaster=${stale.count} cap=${stale.cap} overCap=${stale.overCap}`,
        );
        if (stale.overCap && !opts.dryRun) {
          throw new Error(
            `stale master hide count ${stale.count} is above the cap ${stale.cap}. Nothing was hidden.`,
          );
        }
      } else if (opts.masterCsvPath && !opts.hideStale) {
        console.log("[seed-catalog] staleMaster skipped (--no-hide-stale)");
      }
    } else if (opts.masterCsvPath && opts.hideStale) {
      console.log("[seed-catalog] staleMaster not counted (no DATABASE_URL)");
    }
    const total = seedRows.length;
    let offset = clampSeedOffset(opts.resume ? await readCheckpoint(file) : opts.offset, total);
    const stopAt =
      opts.limit == null ? total : Math.min(total, offset + clampSeedLimit(opts.limit, opts.limit, 1_000_000));
    const chunk = clampSeedLimit(opts.chunk);

    const summary = prepared.summary;
    console.log(
      `[seed-catalog] rows=${total} offset=${offset} stop=${stopAt} chunk=${chunk} dryRun=${opts.dryRun} masterKeys=${prepared.masterKeys} enriched=${prepared.enriched} sourcedAges=${prepared.sourcedAges ?? 0}`,
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
    if (staleHide && staleHide.count > 0 && !staleHide.overCap) {
      await sql.query(
        `update daycares
            set listing_active = 0,
                import_fault = $1
          where id = any($2::text[])
            and merged_into is null
            and import_fault is null
            and claimed_at is null
            and coalesce(claim_status, 'unclaimed') not in ('approved', 'live', 'active', 'published', 'pending', 'waiting', 'verified')
            and not exists (select 1 from provider_daycares p where p.daycare_id = daycares.id)
            and not exists (
              select 1 from listing_claims lc
               where lc.daycare_id = daycares.id
                 and coalesce(lc.status, '') not in ('rejected', 'withdrawn', 'cancelled')
            )
            and slug <> 'kids-world-daycare-kh2t'`,
        [REMOVED_FROM_MASTER_FAULT, staleHide.ids],
      );
      console.log(`[seed-catalog] staleHidden=${staleHide.count}`);
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
