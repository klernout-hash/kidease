#!/usr/bin/env node
/**
 * Import Quebec recognized home daycares from a private CSV.
 *
 * Dry-run (no database, no email, no SMS):
 *   node --experimental-strip-types scripts/import-qc-home-daycares.mjs --csv /path/to/file.csv --dry-run
 *
 * Write (never production):
 *   KIDEASE_ALLOW_QC_IMPORT=1 DATABASE_URL=postgresql://… \
 *     node --experimental-strip-types scripts/import-qc-home-daycares.mjs --csv /path/to/file.csv --apply
 *
 * The CSV is not in this repo. Do not commit it. Street addresses are dropped.
 * This script does not email or text providers.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { formatQcHomeDryRun, parseQcHomeCsv } from "../src/lib/qc-home-daycare.ts";

function arg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }
  return "";
}

function refuseProduction(databaseUrl) {
  if (process.env.VERCEL_ENV === "production" || process.env.VERCEL) {
    throw new Error("Refusing to import Quebec home daycares on Vercel.");
  }
  let host = "";
  let database = "";
  try {
    const url = new URL(databaseUrl);
    host = url.hostname.toLowerCase();
    database = url.pathname.toLowerCase();
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  if (host.includes("prod") || database.includes("prod")) {
    throw new Error("Refusing a production-looking database.");
  }
  if (process.env.KIDEASE_ALLOW_QC_IMPORT !== "1") {
    throw new Error("Set KIDEASE_ALLOW_QC_IMPORT=1 to write. This script does not run against production.");
  }
}

async function applyRows(databaseUrl, rows) {
  refuseProduction(databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const row of rows) {
      await client.query(
        `insert into qc_home_daycares (
           id, slug, provider_type, published_name, personal_name, municipality, neighbourhood,
           postal_fsa, province, phone, email, website, bureau_name, source_url, source_label,
           verified_on, capacity, open_spots, open_spots_as_of, ages_served, fees_text, fee_unit,
           area_lat, area_lng, area_radius_m, updated_at
         ) values (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25, now()
         )
         on conflict (id) do update set
           slug = excluded.slug,
           provider_type = excluded.provider_type,
           published_name = excluded.published_name,
           personal_name = excluded.personal_name,
           municipality = excluded.municipality,
           neighbourhood = excluded.neighbourhood,
           postal_fsa = excluded.postal_fsa,
           province = excluded.province,
           phone = excluded.phone,
           email = excluded.email,
           website = excluded.website,
           bureau_name = excluded.bureau_name,
           source_url = excluded.source_url,
           source_label = excluded.source_label,
           verified_on = excluded.verified_on,
           capacity = excluded.capacity,
           open_spots = excluded.open_spots,
           open_spots_as_of = excluded.open_spots_as_of,
           ages_served = excluded.ages_served,
           fees_text = excluded.fees_text,
           fee_unit = excluded.fee_unit,
           area_lat = excluded.area_lat,
           area_lng = excluded.area_lng,
           area_radius_m = excluded.area_radius_m,
           updated_at = now()`,
        [
          row.id,
          row.slug,
          row.providerType,
          row.publishedName,
          row.personalName,
          row.municipality,
          row.neighbourhood,
          row.postalFsa,
          row.province,
          row.phone,
          row.email,
          row.website,
          row.bureauName,
          row.sourceUrl,
          row.sourceLabel,
          row.verifiedOn,
          row.capacity,
          row.openSpots,
          row.openSpotsAsOf,
          row.agesServed,
          row.feesText,
          row.feeUnit,
          row.areaLat,
          row.areaLng,
          row.areaRadiusM,
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

const csvPath = arg("csv") || process.env.QC_HOME_CSV_PATH || "";
const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--apply");
const apply = process.argv.includes("--apply") && !process.argv.includes("--dry-run");

if (!csvPath) {
  console.error("Pass --csv PATH. Add --dry-run to preview, or --apply to write. No email is sent.");
  process.exit(2);
}

const parsed = parseQcHomeCsv(readFileSync(csvPath, "utf8"));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(1);
}

if (!apply || dryRun) {
  console.log(formatQcHomeDryRun(parsed.summary));
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl) {
  console.error("DATABASE_URL is required for --apply. Dry-run does not need it.");
  process.exit(1);
}

await applyRows(databaseUrl, parsed.rows);
console.log(`Wrote ${parsed.rows.length} Quebec home daycare rows. No email. No text.`);
