/**
 * Cache a public inspection extract. Does not fetch unless --url is a government host.
 * Usage: node scripts/import-inspection-cache.mjs data/inspections/on.json
 *        node scripts/import-inspection-cache.mjs --url https://data.ontario.ca/example.json
 * Writes only with --apply and DATABASE_URL. Otherwise it prints the kept row count.
 */
import { readFileSync } from "node:fs";
import { isPublicInspectionUrl, parseInspectionCache } from "../src/lib/inspection-history.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const urlFlag = args.indexOf("--url");
const url = urlFlag >= 0 ? args[urlFlag + 1] : "";
const file = args.find((arg) => !arg.startsWith("--") && arg !== url);

let raw = [];
if (url) {
  if (!isPublicInspectionUrl(url)) {
    console.error("Refusing a URL that is not a public ON, BC, or AB government host.");
    process.exit(1);
  }
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Fetch failed: ${response.status}`);
    process.exit(1);
  }
  raw = await response.json();
} else if (file) {
  raw = JSON.parse(readFileSync(file, "utf8"));
} else {
  console.error("Pass a JSON file or --url https://…");
  process.exit(1);
}

const records = parseInspectionCache(raw);
console.log(`Kept ${records.length} public inspection row(s).`);
if (!apply) {
  console.log("Dry run. Pass --apply with DATABASE_URL to cache them.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const { getSql } = await import("../src/lib/db.ts");
const { cacheInspectionRecords } = await import("../src/lib/server/inspection-history.ts");
const sql = await getSql();
const result = await cacheInspectionRecords(sql, records);
console.log(`Cached ${result.saved} row(s).`);
