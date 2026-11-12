import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { checkConfiguredMigrations, checkMigrationLedger, migrationCheckFailureMessage } from "./check-migrations.mjs";

async function fixture(withLedger = true) {
  const pg = new PGlite();
  await pg.exec("create table sentinel(id text primary key, value text); insert into sentinel values ('keep','unchanged');");
  if (withLedger) await pg.exec("create table _migrations(name text primary key); insert into _migrations values ('0001_first.sql');");
  return pg;
}

async function snapshot(pg) {
  const tables = (await pg.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
  const rows = {};
  for (const { tablename } of tables)
    rows[tablename] = (await pg.query(`select row_to_json(t)::text as row from "${tablename}" t order by row_to_json(t)::text`)).rows;
  return { tables, rows };
}

test("caught-up ledger is checked in a real READ ONLY transaction without changing any fixture table", async () => {
  const pg = await fixture();
  try {
    const before = await snapshot(pg);
    const queries = [];
    const client = { query: async (sql) => {
      queries.push(sql);
      const result = await pg.query(sql);
      if (sql === "BEGIN READ ONLY") assert.equal((await pg.query("show transaction_read_only")).rows[0].transaction_read_only, "on");
      return result;
    } };
    assert.deepEqual(await checkMigrationLedger(client, ["0001_first.sql"]), { status: "up-to-date", expected: 1, pending: [] });
    assert.deepEqual(queries, ["BEGIN READ ONLY", "SELECT name FROM public._migrations", "ROLLBACK"]);
    assert.deepEqual(await snapshot(pg), before);
  } finally { await pg.close(); }
});

test("a pending filename fails closed, remains unapplied, and changes zero rows", async () => {
  const pg = await fixture();
  try {
    const before = await snapshot(pg);
    await assert.rejects(checkMigrationLedger(pg, ["0001_first.sql", "0002_pending.sql"]), (error) => {
      assert.equal(error.code, "MIGRATIONS_PENDING");
      assert.deepEqual(error.pending, ["0002_pending.sql"]);
      return true;
    });
    assert.deepEqual(await snapshot(pg), before);
  } finally { await pg.close(); }
});

test("a missing ledger fails without creating it or changing existing data", async () => {
  const pg = await fixture(false);
  try {
    const before = await snapshot(pg);
    await assert.rejects(checkMigrationLedger(pg, ["0001_first.sql"]), { code: "MIGRATION_LEDGER_MISSING" });
    assert.deepEqual(await snapshot(pg), before);
  } finally { await pg.close(); }
});

test("database enforcement rejects an attempted write inside the check transaction", async () => {
  const pg = await fixture();
  try {
    const before = await snapshot(pg);
    const client = { query: async (sql) => {
      const result = await pg.query(sql);
      if (sql === "BEGIN READ ONLY") await pg.query("insert into sentinel values ('must-not-exist','blocked')");
      return result;
    } };
    await assert.rejects(checkMigrationLedger(client, ["0001_first.sql"]), { code: "MIGRATION_CHECK_FAILED" });
    assert.equal((await pg.query("show transaction_read_only")).rows[0].transaction_read_only, "off");
    assert.deepEqual(await snapshot(pg), before);
  } finally { await pg.close(); }
});

test("driver failure rolls back and does not expose credential-bearing error details", async () => {
  const queries = [];
  const client = { query: async (sql) => {
    queries.push(sql);
    if (sql.startsWith("SELECT")) throw new Error("postgres://fixture-user:private-value@fixture.invalid/db");
    return { rows: [] };
  } };
  let failure;
  await assert.rejects(checkMigrationLedger(client, ["0001_first.sql"]), (error) => { failure = error; return error.code === "MIGRATION_CHECK_FAILED"; });
  assert.deepEqual(queries, ["BEGIN READ ONLY", "SELECT name FROM public._migrations", "ROLLBACK"]);
  assert.doesNotMatch(migrationCheckFailureMessage(failure), /private-value|fixture-user|fixture\.invalid|postgres:/);
});

test("cleanup failure cannot turn into a successful check", async () => {
  const client = { query: async (sql) => {
    if (sql === "ROLLBACK") throw new Error("private connection details");
    return { rows: [{ name: "0001_first.sql" }] };
  } };
  await assert.rejects(checkMigrationLedger(client, ["0001_first.sql"]), { code: "MIGRATION_CHECK_CLEANUP_FAILED" });
});

test("no configured database skips without opening a connection or reading a migration directory", async () => {
  for (const DATABASE_URL of [undefined, "", "   "]) {
    let connected = false;
    const result = await checkConfiguredMigrations({ env: { DATABASE_URL }, migrationsDir: "/does-not-exist", createPool: () => { connected = true; throw new Error("must not connect"); } });
    assert.equal(result.status, "skipped");
    assert.equal(connected, false);
  }
});

test("configured check compares repository SQL filenames and always releases its injected connection", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kidease-migration-check-"));
  const events = [];
  try {
    writeFileSync(join(dir, "0001_first.sql"), "This content must not be executed.");
    writeFileSync(join(dir, "0002_pending.sql"), "This content must not be executed either.");
    writeFileSync(join(dir, "README.md"), "Not a migration.");
    const client = { query: async (sql) => { events.push(sql); return { rows: [{ name: "0001_first.sql" }] }; }, release: () => events.push("release") };
    const createPool = (options) => {
      assert.equal(options.connectionTimeoutMillis, 10000);
      assert.equal(options.statement_timeout, 10000);
      assert.equal(options.query_timeout, 15000);
      return { connect: async () => client, end: async () => events.push("end") };
    };
    await assert.rejects(checkConfiguredMigrations({ env: { DATABASE_URL: "postgres://synthetic.invalid/fixture" }, migrationsDir: dir, createPool }), { code: "MIGRATIONS_PENDING" });
    assert.deepEqual(events, ["BEGIN READ ONLY", "SELECT name FROM public._migrations", "ROLLBACK", "release", "end"]);
  } finally { rmSync(dir, { recursive: true }); }
});

test("connection failure closes its pool and returns only a safe failure message", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kidease-migration-connection-"));
  let closed = false;
  try {
    writeFileSync(join(dir, "0001_first.sql"), "Never executed.");
    const createPool = () => ({ connect: async () => { throw new Error("password=private-value host=fixture.invalid"); }, end: async () => { closed = true; } });
    await assert.rejects(checkConfiguredMigrations({ env: { DATABASE_URL: "postgres://synthetic.invalid/fixture" }, migrationsDir: dir, createPool }), (error) => {
      assert.equal(error.code, "MIGRATION_CHECK_FAILED");
      assert.doesNotMatch(migrationCheckFailureMessage(error), /private-value|fixture\.invalid/);
      return true;
    });
    assert.equal(closed, true);
  } finally { rmSync(dir, { recursive: true }); }
});

test("normal build checks the ledger while the manual write command stays separate and cache identity changes", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.build, /&& npm run db:migrate:check$/);
  assert.doesNotMatch(pkg.scripts.build, /npm run db:migrate(?:\s|$)/);
  assert.equal(pkg.scripts["db:migrate"], "node --experimental-strip-types scripts/migrate.mjs");
  assert.equal(pkg.scripts["db:migrate:check"], "node --experimental-strip-types scripts/check-migrations.mjs");
  const cacheKey = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8").split("\n").find((line) => line.includes("key: vite-build-"));
  assert.ok(cacheKey.includes("'package.json'"));
  assert.ok(cacheKey.includes("'scripts/check-migrations.mjs'"));
});
