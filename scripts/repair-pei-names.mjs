#!/usr/bin/env node
/**
 * Prince Edward Island mx- rows whose name is a city and a postal code.
 *
 * Dry-run by default. Pass --apply to write. A real centre name is copied
 * only from the master CSV. When that name is not in the file, the row is
 * hidden with import_fault = pei_name_unrecoverable. Nothing is guessed.
 *
 *   node --experimental-strip-types scripts/repair-pei-names.mjs --rows rows.json
 *   node --experimental-strip-types scripts/repair-pei-names.mjs --rows rows.json --master-csv master.csv
 *   DATABASE_URL='postgresql://…' node --experimental-strip-types scripts/repair-pei-names.mjs
 *   DATABASE_URL='postgresql://…' MASTER_CSV_PATH=/secure/master.csv node --experimental-strip-types scripts/repair-pei-names.mjs --apply
 *
 * --rows is a fixture overlay for a dry-run. --apply reads daycares from DATABASE_URL.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PEI_NAME_UNRECOVERABLE, planPeiNameRepair } from "../src/lib/pei-name-repair.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "tmp", "coverage"]);

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function option(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  const next = index >= 0 ? process.argv[index + 1] : "";
  if (next && !next.startsWith("--")) return next;
  return "";
}

function walkCsv(dir, depth, found) {
  if (depth > 2) return;
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    let info;
    try {
      info = statSync(path);
    } catch {
      continue;
    }
    if (info.isDirectory()) walkCsv(path, depth + 1, found);
    else if (/^KidEase_Canada_Master.*\.csv$/i.test(name)) found.push(path);
  }
}

function resolveMaster(explicit) {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`master CSV not found: ${explicit}`);
    return explicit;
  }
  if (process.env.MASTER_CSV_PATH) {
    if (!existsSync(process.env.MASTER_CSV_PATH)) throw new Error("MASTER_CSV_PATH does not exist");
    return process.env.MASTER_CSV_PATH;
  }
  const found = [];
  walkCsv(root, 0, found);
  if (found.length > 1) {
    throw new Error(`more than one master CSV (${found.join(", ")}). Pass --master-csv.`);
  }
  return found[0] || "";
}

function loadRows(path) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows;
  if (!Array.isArray(rows)) throw new Error("--rows must be a JSON array or { rows: [] }");
  return rows;
}

async function loadLive(databaseUrl) {
  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    const result = await client.query(
      `select id, slug, name, city, province, postal_code, license_number, merged_into, address, import_fault
         from daycares
        where id like 'mx-%'
          and upper(btrim(province)) in ('PE', 'PEI')
          and merged_into is null`,
    );
    const rows = result.rows.map((row) => ({
      id: row.id,
      slug: row.slug || "",
      name: row.name || "",
      city: row.city || "",
      province: row.province || "",
      postalCode: row.postal_code || "",
      licenseNumber: row.license_number || "",
      mergedInto: row.merged_into || "",
      address: row.address || "",
      importFault: row.import_fault || "",
    }));
    return { rows, client, pool };
  } catch (error) {
    client.release();
    await pool.end();
    throw error;
  }
}

async function applyPlan(client, plan, rows) {
  const current = new Map(rows.map((row) => [row.id, row]));
  for (const row of plan.recoverable) {
    const before = current.get(row.id);
    await client.query(
      `update daycares
          set name = $1,
              city = case
                when nullif(btrim(coalesce(city, '')), '') is null then coalesce($2, city)
                else city
              end,
              postal_code = case
                when nullif(btrim(coalesce(postal_code, '')), '') is null then coalesce($3, postal_code)
                else postal_code
              end,
              address = case
                when nullif(btrim(coalesce(address, '')), '') is null
                  or address ~* '^mailing address:'
                then coalesce($4, address)
                else address
              end,
              import_fault = null
        where id = $5
          and id like 'mx-%'
          and upper(btrim(province)) in ('PE', 'PEI')
          and merged_into is null
          and name = $6`,
      [row.name, row.city, row.postalCode, row.address, row.id, before?.name || ""],
    );
  }
  for (const row of plan.hide) {
    await client.query(
      `update daycares
          set import_fault = $2,
              listing_active = 0
        where id = $1
          and id like 'mx-%'
          and merged_into is null
          and (import_fault is null or import_fault = $2)`,
      [row.id, PEI_NAME_UNRECOVERABLE],
    );
  }
}

async function main() {
  const apply = flag("apply");
  const rowsPath = option("rows");
  const masterArg = option("master-csv");
  if (apply && rowsPath) {
    console.error("[repair-pei-names] --apply reads Prince Edward Island rows from DATABASE_URL. Omit --rows.");
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL || "";
  if (apply && !databaseUrl) {
    console.error("[repair-pei-names] --apply needs DATABASE_URL. A dry-run does not.");
    process.exit(1);
  }
  if (!apply && !rowsPath && !databaseUrl) {
    console.error("[repair-pei-names] pass --rows or set DATABASE_URL.");
    process.exit(1);
  }
  const masterPath = resolveMaster(masterArg ? resolve(masterArg) : "");
  const masterCsv = masterPath ? readFileSync(masterPath, "utf8") : null;
  let live = null;
  let rows = [];
  if (rowsPath) rows = loadRows(resolve(rowsPath));
  else {
    live = await loadLive(databaseUrl);
    rows = live.rows;
  }
  const plan = planPeiNameRepair(rows, masterCsv);
  const flagged = new Set(rows.filter((row) => row.importFault === PEI_NAME_UNRECOVERABLE).map((row) => row.id));
  console.log(`[repair-pei-names] master ${masterPath ? "loaded" : "absent"}`);
  console.log(`[repair-pei-names] masterRows ${plan.masterRows}`);
  console.log(`[repair-pei-names] recoverable ${plan.recoverable.length}`);
  console.log(`[repair-pei-names] hide ${plan.hide.length}`);
  console.log(`[repair-pei-names] alreadyHidden ${plan.hide.filter((row) => flagged.has(row.id)).length}`);
  console.log(`[repair-pei-names] mode ${apply ? "apply" : "dry-run"}`);
  for (const row of plan.hide) {
    console.log(`[repair-pei-names] hide ${row.id} ${row.slug} ${row.licenseNumber} ${row.name}`);
  }
  for (const row of plan.recoverable) {
    console.log(`[repair-pei-names] recover ${row.id}`);
  }
  if (!apply) {
    if (live) {
      live.client.release();
      await live.pool.end();
    }
    return;
  }
  const backupDir = join(root, "tmp", "pei-name-repair");
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(backupDir, `${stamp}-plan.json`);
  writeFileSync(reportPath, `${JSON.stringify({ createdAt: new Date().toISOString(), masterPath, plan }, null, 2)}\n`);
  console.log(`[repair-pei-names] plan ${reportPath}`);
  try {
    await live.client.query("BEGIN");
    await applyPlan(live.client, plan, rows);
    await live.client.query("COMMIT");
  } catch (error) {
    try {
      await live.client.query("ROLLBACK");
    } catch {
      // Keep the original error when the connection is already closed.
    }
    console.error("[repair-pei-names] apply rolled back.");
    throw error;
  } finally {
    live.client.release();
    await live.pool.end();
  }
  console.log("[repair-pei-names] apply committed");
}

main().catch((error) => {
  console.error(`[repair-pei-names] ${error instanceof Error ? error.message : "failed"}`);
  process.exit(1);
});
