#!/usr/bin/env node
/**
 * Idempotent bulk seed of centres.json (+ extras) into Neon daycares.
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
import { mergeBlankContacts, parseMasterContacts } from "../src/lib/catalog-master.ts";
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
  --master-csv PATH Optional private CSV. Fills blank phone/email/website only
  --help

Never put the master CSV in this repo. Never pass secrets on the query string
of /api/seed-catalog — use Authorization: Bearer $CRON_SECRET.
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

async function loadOptionalMaster(path) {
  if (!path) return null;
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  const text = await readFile(abs, "utf8");
  return parseMasterContacts(text);
}

async function defaultLoadCatalog() {
  const { loadJsonCatalogFromDisk } = await import("../src/lib/catalog-hydrate.ts");
  return loadJsonCatalogFromDisk();
}

export async function prepareCatalogRows(opts, loadCatalog = defaultLoadCatalog, loadMaster = loadOptionalMaster) {
  const catalog = catalogRowsForSeed(await loadCatalog());
  const master = await loadMaster(opts.masterCsvPath);
  if (!master || master.size === 0) {
    return { rows: catalog, masterKeys: 0, enriched: 0 };
  }
  let enriched = 0;
  const rows = catalog.map((row) => {
    const next = mergeBlankContacts(row, master);
    if (
      next.phone !== row.phone ||
      next.contactEmail !== row.contactEmail ||
      next.website !== row.website
    ) {
      enriched += 1;
    }
    return next;
  });
  return { rows, masterKeys: master.size, enriched };
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
  const total = prepared.rows.length;
  const file = checkpointPath(opts.checkpoint);
  let offset = clampSeedOffset(opts.resume ? await readCheckpoint(file) : opts.offset, total);
  const stopAt =
    opts.limit == null ? total : Math.min(total, offset + clampSeedLimit(opts.limit, opts.limit, 1_000_000));
  const chunk = clampSeedLimit(opts.chunk);

  console.log(
    `[seed-catalog] rows=${total} offset=${offset} stop=${stopAt} chunk=${chunk} dryRun=${opts.dryRun} masterKeys=${prepared.masterKeys} enriched=${prepared.enriched}`,
  );

  if (opts.dryRun) return;

  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  const sql = {
    query: async (text, params = []) => {
      const res = await pool.query(text, params);
      return res.rows;
    },
  };

  try {
    while (offset < stopAt) {
      const result = await seedCatalogChunk(sql, prepared.rows, {
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
    await pool.end();
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[seed-catalog] failed:", err?.message || err);
    process.exit(1);
  });
}
