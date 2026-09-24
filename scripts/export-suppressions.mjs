#!/usr/bin/env node
/**
 * Print the outreach suppression list (one lowercased email per line).
 *
 *   node --experimental-strip-types scripts/export-suppressions.mjs
 *   node --experimental-strip-types scripts/export-suppressions.mjs --json
 *
 * DATABASE_URL unset → exit 0 and write nothing to stdout (safe no-op).
 * Needs the email_suppressions table from migrations/0058_email_suppressions.sql.
 */
import pg from "pg";
import { LIST_SUPPRESSIONS_SQL } from "../src/lib/email-suppressions.ts";

const databaseUrl = (process.env.DATABASE_URL || "").trim();
const asJson = process.argv.includes("--json");

if (!databaseUrl) {
  console.error("[export-suppressions] DATABASE_URL unset — nothing to export");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
try {
  const result = await pool.query(LIST_SUPPRESSIONS_SQL);
  const emails = result.rows
    .map((row) => String(row.email || "").trim().toLowerCase())
    .filter((email) => email.includes("@"));
  if (asJson) {
    process.stdout.write(`${JSON.stringify(emails)}\n`);
  } else if (emails.length) {
    process.stdout.write(`${emails.join("\n")}\n`);
  }
} catch (err) {
  console.error("[export-suppressions] failed:", err?.message || err);
  process.exit(1);
} finally {
  await pool.end();
}
