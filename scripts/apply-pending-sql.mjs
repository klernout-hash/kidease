#!/usr/bin/env node
/**
 * Apply pending SQL files once, during an authorized Vercel deploy.
 * Does not seed accounts, reset passwords, or print connection details.
 * The read-only ledger check still runs after this and must pass.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { postgresPoolUrl } from "../src/lib/pg-url.ts";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const vercelEnv = String(process.env.VERCEL_ENV || "");

if (vercelEnv !== "preview" && vercelEnv !== "production") {
  console.log("[migrate-sql] not a Vercel deploy; skipping.");
  process.exit(0);
}
if (!databaseUrl) {
  console.error("[migrate-sql] DATABASE_URL is unset on this Vercel deploy.");
  process.exit(1);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

function safeError(err) {
  const code = err && typeof err.code === "string" ? err.code : "unknown";
  return code;
}

const pool = new pg.Pool({
  connectionString: postgresPoolUrl(databaseUrl),
  max: 1,
  connectionTimeoutMillis: 20000,
  statement_timeout: 60000,
  query_timeout: 60000,
});
const client = await pool.connect();
try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const applied = new Set(
    (await client.query("SELECT name FROM _migrations")).rows.map((row) => row.name),
  );
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  let count = 0;
  for (const name of files) {
    if (applied.has(name)) continue;
    const text = await readFile(join(migrationsDir, name), "utf8");
    try {
      await client.query("BEGIN");
      await client.query(text);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch { /* keep the original failure */ }
      console.error(`[migrate-sql] error applying ${name} (${safeError(err)})`);
      process.exitCode = 1;
      break;
    }
    console.log(`[migrate-sql] applied ${name}`);
    count += 1;
  }
  if (!process.exitCode) {
    console.log(count ? `[migrate-sql] done — ${count} migration(s) applied.` : "[migrate-sql] up to date.");
  }
} catch (err) {
  console.error(`[migrate-sql] failed (${safeError(err)})`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
