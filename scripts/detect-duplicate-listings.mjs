#!/usr/bin/env node
/**
 * Dry-run only. Finds possible duplicate listings in a JSON file.
 * Refuses --apply and never opens DATABASE_URL. Kyle approves a real merge separately.
 *
 *   node --experimental-strip-types scripts/detect-duplicate-listings.mjs --input listings.json
 */

import { readFileSync } from "node:fs";
import { planSafeDuplicateGroups } from "../src/lib/duplicate-detect.ts";

if (process.argv.includes("--apply")) {
  console.error("Refusing --apply. This script does not merge listings. Kyle approves that separately.");
  process.exit(2);
}

if (process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim()) {
  console.error("Refusing to read the database. Pass --input with a JSON file.");
  process.exit(2);
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

const input = option("input");
if (!input) {
  console.error("Pass --input listings.json. Nothing is written.");
  process.exit(2);
}

const parsed = JSON.parse(readFileSync(input, "utf8"));
const rows = Array.isArray(parsed) ? parsed : parsed.listings;
if (!Array.isArray(rows)) {
  console.error("--input must be a JSON array or { listings: [] }");
  process.exit(2);
}

const result = planSafeDuplicateGroups(rows);
console.log(JSON.stringify({
  dryRun: true,
  apply: false,
  plans: result.plans,
  skipped: result.skipped,
  note: "Retired URLs stay as redirects to the keeper. No row was changed.",
}, null, 2));
