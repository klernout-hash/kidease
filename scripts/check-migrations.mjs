#!/usr/bin/env node
/** Build-time ledger check only. The separately invoked migrator owns all writes. */
import { readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { postgresPoolUrl } from "../src/lib/pg-url.ts";

export class MigrationCheckError extends Error {
  constructor(code, message, pending = []) {
    super(message);
    this.name = "MigrationCheckError";
    this.code = code;
    this.pending = pending;
  }
}

function databaseFailure(error) {
  if (error instanceof MigrationCheckError) return error;
  if (error?.code === "42P01")
    return new MigrationCheckError("MIGRATION_LEDGER_MISSING", "Migration ledger is missing; a separately authorized migration is required.");
  return new MigrationCheckError("MIGRATION_CHECK_FAILED", "Database migration check failed; no migrations were run.");
}

function migrationInventory(filenames) {
  if (!Array.isArray(filenames))
    throw new MigrationCheckError("MIGRATION_FILES_INVALID", "Migration filenames are invalid.");
  const expected = [...new Set(filenames)].sort();
  if (!expected.length)
    throw new MigrationCheckError("MIGRATION_FILES_EMPTY", "Repository migration inventory is empty; the build cannot verify its schema.");
  if (expected.some((name) => typeof name !== "string" || !/^[a-zA-Z0-9_.-]+\.sql$/.test(name)))
    throw new MigrationCheckError("MIGRATION_FILES_INVALID", "Migration filenames are invalid.");
  return expected;
}

/** Client injection supports mocks and isolated PGlite; only three fixed SQL statements exist. */
export async function checkMigrationLedger(client, filenames) {
  const expected = migrationInventory(filenames);
  let attemptedBegin = false;
  let outcome;
  let failure;
  try {
    attemptedBegin = true;
    await client.query("BEGIN READ ONLY");
    const result = await client.query("SELECT name FROM public._migrations");
    if (!Array.isArray(result?.rows) || result.rows.some((row) => !row || typeof row.name !== "string"))
      throw new MigrationCheckError("MIGRATION_LEDGER_INVALID", "Migration ledger returned invalid names.");
    const applied = new Set(result.rows.map((row) => row.name));
    const pending = expected.filter((name) => !applied.has(name));
    if (pending.length)
      throw new MigrationCheckError("MIGRATIONS_PENDING", "Pending SQL migrations require a separately authorized manual migration before deployment.", pending);
    outcome = { status: "up-to-date", expected: expected.length, pending: [] };
  } catch (error) {
    failure = databaseFailure(error);
  } finally {
    if (attemptedBegin) {
      try { await client.query("ROLLBACK"); }
      catch { failure = new MigrationCheckError("MIGRATION_CHECK_CLEANUP_FAILED", "The read-only migration check could not close its transaction."); }
    }
  }
  if (failure) throw failure;
  return outcome;
}

async function defaultPool(options) {
  const { default: pg } = await import("pg");
  return new pg.Pool(options);
}

export async function checkConfiguredMigrations({ env = process.env, migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations"), createPool = defaultPool } = {}) {
  const databaseUrl = String(env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    if (env.VERCEL_ENV === "production")
      throw new MigrationCheckError("MIGRATION_DATABASE_REQUIRED", "A Vercel production build requires a configured database for its read-only migration check.");
    return { status: "skipped", reason: "DATABASE_URL is unset" };
  }
  let filenames;
  try {
    filenames = (await readdir(migrationsDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name);
  } catch {
    throw new MigrationCheckError("MIGRATION_FILES_UNREADABLE", "Repository migration filenames could not be read.");
  }
  filenames = migrationInventory(filenames);
  let pool;
  let client;
  let outcome;
  let failure;
  // pg-pool can emit errors containing a client and its connection options.
  // Capture only a fixed failure; never let an unhandled event print that object.
  const connectionFailure = () => { failure ??= databaseFailure(); };
  try {
    pool = await createPool({ connectionString: postgresPoolUrl(databaseUrl), max: 1, connectionTimeoutMillis: 10000, statement_timeout: 10000, query_timeout: 15000 });
    if (typeof pool?.on === "function") pool.on("error", connectionFailure);
    client = await pool.connect();
    if (typeof client?.on === "function") client.on("error", connectionFailure);
    if (failure) throw failure;
    outcome = await checkMigrationLedger(client, filenames);
  } catch (error) {
    failure = databaseFailure(error);
  } finally {
    let cleanupFailed = false;
    try { client?.release(); } catch { cleanupFailed = true; }
    try { await pool?.end(); } catch { cleanupFailed = true; }
    if (cleanupFailed) failure = new MigrationCheckError("MIGRATION_CHECK_CLEANUP_FAILED", "The migration check connection could not be closed.");
  }
  if (failure) throw failure;
  return outcome;
}

/** Never print driver messages, connection strings, credentials, SQL parameters or row values. */
export function migrationCheckFailureMessage(error) {
  const failure = databaseFailure(error);
  return `[migration-check] ${failure.code}: ${failure.message}${failure.pending.length ? ` Pending files: ${failure.pending.join(", ")}` : ""}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await checkConfiguredMigrations();
    console.log(result.status === "skipped"
      ? "[migration-check] DATABASE_URL is unset; skipping the remote ledger check."
      : `[migration-check] ${result.expected} SQL migration filenames are recorded; read-only check passed.`);
  } catch (error) {
    console.error(migrationCheckFailureMessage(error));
    process.exitCode = 1;
  }
}
