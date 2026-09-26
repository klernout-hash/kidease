#!/usr/bin/env node
/**
 * Measure Winnipeg search-visible completeness and apply sourced fills.
 *
 *   node --experimental-strip-types scripts/winnipeg-live-looking.mjs
 *   node --experimental-strip-types scripts/winnipeg-live-looking.mjs --csv data/winnipeg-search-gaps.csv
 *   DATABASE_URL=… node --experimental-strip-types scripts/winnipeg-live-looking.mjs --apply filled.csv
 *   DATABASE_URL=… node --experimental-strip-types scripts/winnipeg-live-looking.mjs --apply filled.csv --write
 *
 * Prints counts only. Does not invent ages, fees, or photos.
 * --apply is a dry run until --write. Blank CSV cells are not written.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hydrateCentre } from "../src/lib/catalog-hydrate.ts";
import {
  hasRealPhoto,
  isWinnipegOutreachCity,
  mergePhotoList,
  parseGapCsv,
  planCompletenessFill,
  summarizeLiveLooking,
  winnipegGapsCsv,
} from "../src/lib/winnipeg-completeness.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function argValue(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return "";
  return argv[index + 1] || "";
}

export function parseWinnipegArgs(argv = process.argv.slice(2)) {
  return {
    csv: argv.includes("--csv") ? argValue(argv, "--csv") || join(root, "data/winnipeg-search-gaps.csv") : "",
    apply: argv.includes("--apply") ? argValue(argv, "--apply") : "",
    write: argv.includes("--write"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

async function readJson(rel) {
  return JSON.parse(await readFile(join(root, rel), "utf8"));
}

export async function loadWinnipegCatalogue() {
  const main = await readJson("src/lib/data/centres.json");
  const extras = [];
  for (let i = 1; i <= 10; i += 1) {
    try {
      const extra = await readJson(`src/lib/data/centres-extra-${i}.json`);
      if (Array.isArray(extra)) extras.push(...extra);
    } catch {
      /* optional shard */
    }
  }
  const factsFile = await readJson("src/lib/data/operator-facts.json");
  const buildings = await readJson("src/lib/data/real-storefronts.json");
  const wpg = await readJson("src/lib/data/storefronts.json");
  const seen = new Set();
  const raw = [];
  for (const row of [...main, ...extras]) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    raw.push(row);
  }
  const maps = { facts: factsFile.byLicence || {}, buildings, wpg };
  return raw
    .map((row) => hydrateCentre(row, maps))
    .filter((row) => isWinnipegOutreachCity(row.city))
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      address: row.address,
      city: row.city,
      province: row.province,
      phone: row.phone,
      website: row.website || "",
      licenseNumber: row.licenseNumber,
      ageMinMonths: row.ageMinMonths,
      ageMaxMonths: row.ageMaxMonths,
      infantMonthly: row.infantMonthly,
      toddlerMonthly: row.toddlerMonthly,
      preschoolMonthly: row.preschoolMonthly,
      partTimeMonthly: row.partTimeMonthly,
      amenities: row.amenities,
      photos: row.photos,
      feeConfirmed: Boolean(row.feeConfirmed),
      claimed: Boolean(row.claimed),
      claimedAt: row.claimedAt || null,
      claimStatus: row.claimStatus || null,
      listingActive: row.listingActive !== false,
      visibility: row.visibility,
      isTest: row.isTest,
    }));
}

function rowFromDb(row) {
  const agesConfirmed = row.ages_confirmed === 1 || row.ages_confirmed === true;
  const min = Number(row.age_min_months) || 0;
  const max = Number(row.age_max_months) || 0;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    address: row.address,
    city: row.city,
    province: row.province,
    phone: row.phone,
    website: row.website,
    licenseNumber: row.license_number,
    ageMinMonths: min,
    ageMaxMonths: max,
    agesKnown: agesConfirmed || (max > min && max > 0),
    infantMonthly: row.infant_monthly,
    toddlerMonthly: row.toddler_monthly,
    preschoolMonthly: row.preschool_monthly,
    partTimeMonthly: row.part_time_monthly,
    amenities: row.amenities,
    photos: row.photos,
    feeConfirmed: Boolean(row.claimed_at),
    claimed: Boolean(row.claimed_at),
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
    claimStatus: row.claim_status,
    listingActive: row.listing_active === 0 || row.listing_active === false ? false : true,
    ratingX10: Number(row.rating_x10) || 0,
    reviewCount: Number(row.review_count) || 0,
    visibility: row.visibility,
    isTest: row.is_test,
  };
}

const SELECT_ONE = `
select id, slug, name, address, city, province, phone, website, license_number,
  age_min_months, age_max_months, ages_confirmed,
  infant_monthly, toddler_monthly, preschool_monthly, part_time_monthly,
  amenities, photos, claimed_at, claim_status, listing_active,
  rating_x10, review_count, visibility, is_test
from daycares
where id = $1
limit 1
`;

async function applyCsv(path, write) {
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    console.error("[winnipeg-gaps] DATABASE_URL unset — cannot apply");
    process.exit(1);
  }
  const parsed = parseGapCsv(await readFile(path, "utf8"));
  if (parsed.errors.length) {
    for (const error of parsed.errors) console.error(`[winnipeg-gaps] ${error}`);
    process.exit(1);
  }
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  let applied = 0;
  let skipped = 0;
  let rejected = 0;
  try {
    if (write) await client.query("begin");
    for (const patch of parsed.patches) {
      const found = await client.query(SELECT_ONE, [patch.id]);
      const current = found.rows[0] ? rowFromDb(found.rows[0]) : null;
      if (!current || !isWinnipegOutreachCity(current.city)) {
        rejected += 1;
        console.error(`[winnipeg-gaps] reject ${patch.id}: not a Winnipeg listing`);
        continue;
      }
      const plan = planCompletenessFill(current, patch);
      if (plan.action === "reject") {
        rejected += 1;
        console.error(`[winnipeg-gaps] reject ${plan.id}: ${plan.reason}`);
        continue;
      }
      if (plan.action === "skip" || (!plan.setAges && !plan.setFees && !plan.setPhoto)) {
        skipped += 1;
        continue;
      }
      if (!write) {
        applied += 1;
        continue;
      }
      if (plan.setAges) {
        await client.query(
          `update daycares
           set age_min_months = $2, age_max_months = $3, ages_confirmed = 1
           where id = $1
             and not (age_max_months > age_min_months and age_max_months > 0)
             and coalesce(ages_confirmed, 0) = 0`,
          [plan.id, plan.setAges.min, plan.setAges.max],
        );
      }
      if (plan.setFees) {
        await client.query(
          `update daycares set
             infant_monthly = case when $2::int is null or coalesce(infant_monthly, 0) > 0 then infant_monthly else $2 end,
             toddler_monthly = case when $3::int is null or coalesce(toddler_monthly, 0) > 0 then toddler_monthly else $3 end,
             preschool_monthly = case when $4::int is null or coalesce(preschool_monthly, 0) > 0 then preschool_monthly else $4 end,
             part_time_monthly = case when $5::int is null or coalesce(part_time_monthly, 0) > 0 then part_time_monthly else $5 end
           where id = $1`,
          [
            plan.id,
            plan.setFees.infantMonthly ?? null,
            plan.setFees.toddlerMonthly ?? null,
            plan.setFees.preschoolMonthly ?? null,
            plan.setFees.partTimeMonthly ?? null,
          ],
        );
      }
      if (plan.setPhoto && !hasRealPhoto(current)) {
        await client.query(
          `update daycares
           set photos = $2, last_photo_updated_at = now()
           where id = $1`,
          [plan.id, mergePhotoList(current.photos, plan.setPhoto)],
        );
      }
      const source = (patch.source || "").trim().slice(0, 400);
      if (source) {
        await client.query(
          `update daycares set fact_source = case
             when coalesce(btrim(fact_source), '') = '' then $2
             when position($2 in fact_source) > 0 then fact_source
             else left(fact_source || ' | ' || $2, 500)
           end
           where id = $1`,
          [plan.id, source],
        );
      }
      applied += 1;
    }
    if (write) await client.query("commit");
  } catch (error) {
    if (write) await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
  console.log(
    JSON.stringify({
      mode: write ? "write" : "dry-run",
      applied,
      skipped,
      rejected,
    }),
  );
}

async function main() {
  const args = parseWinnipegArgs();
  if (args.help) {
    console.log("See scripts/winnipeg-live-looking.mjs header.");
    return;
  }
  if (args.apply) {
    await applyCsv(args.apply, args.write);
    return;
  }
  const rows = await loadWinnipegCatalogue();
  const summary = summarizeLiveLooking(rows);
  console.log(
    JSON.stringify({
      source: "repo catalogue hydrate (centres.json + operator-facts + photo maps)",
      city: "Winnipeg",
      ...summary,
      liveLookingPercent: Number((summary.liveLookingShare * 100).toFixed(1)),
    }),
  );
  if (args.csv) {
    await writeFile(args.csv, winnipegGapsCsv(rows));
    console.error(`[winnipeg-gaps] wrote ${args.csv} (${summary.searchVisible} rows)`);
  }
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "winnipeg gaps failed");
    process.exit(1);
  });
}
