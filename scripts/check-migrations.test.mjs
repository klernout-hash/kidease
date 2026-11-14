import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
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
  assert.deepEqual(pkg.scripts.build.split(/\s*&&\s*/), [
    "vite build",
    "node scripts/upload-posthog-sourcemaps.mjs",
    "node scripts/check-ssr-bundle.mjs",
    "node scripts/check-locale-chunks.mjs",
    "node scripts/check-client-db.mjs",
    "npm run db:migrate:check",
  ]);
  for (const lifecycle of ["prebuild", "postbuild", "preinstall", "postinstall", "prepare"])
    assert.equal(pkg.scripts[lifecycle], undefined, `${lifecycle} must not introduce an unchecked build/install side effect`);
  assert.equal(pkg.scripts["db:migrate"], "node --experimental-strip-types scripts/migrate.mjs");
  assert.equal(pkg.scripts["db:migrate:check"], "node --experimental-strip-types scripts/check-migrations.mjs");
  const cacheKey = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8").split("\n").find((line) => line.includes("key: vite-build-"));
  assert.ok(cacheKey.includes("'package.json'"));
  assert.ok(cacheKey.includes("'scripts/check-migrations.mjs'"));
  assert.ok(cacheKey.includes("'migrations/**'"));
});

test("pure gate: production missing or blank database configuration rejects before files or connection access", async () => {
  for (const DATABASE_URL of [undefined, "", "   \n\t"]) {
    let poolCreated = false;
    await assert.rejects(checkConfiguredMigrations({
      env: { VERCEL_ENV: "production", DATABASE_URL },
      migrationsDir: "/this-must-not-be-read-production-migrations",
      createPool: () => { poolCreated = true; throw new Error("must not connect"); },
    }), { code: "MIGRATION_DATABASE_REQUIRED" });
    assert.equal(poolCreated, false);
  }
});

test("pure gate: unconfigured local CI and preview builds skip without filesystem or connection access", async () => {
  for (const environment of [{}, { CI: "true" }, { NODE_ENV: "production", CI: "true" }, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }]) {
    for (const DATABASE_URL of [undefined, "", "   "]) {
      let poolCreated = false;
      const result = await checkConfiguredMigrations({
        env: { ...environment, DATABASE_URL },
        migrationsDir: "/this-must-not-be-read-unconfigured-migrations",
        createPool: () => { poolCreated = true; throw new Error("must not connect"); },
      });
      assert.equal(result.status, "skipped");
      assert.equal(poolCreated, false);
    }
  }
});

test("pure gate: an empty SQL migration inventory rejects before creating a pool", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kidease-empty-migration-check-"));
  let poolCreated = false;
  try {
    writeFileSync(join(dir, "README.md"), "Not SQL and never executed.");
    await assert.rejects(checkConfiguredMigrations({
      env: { VERCEL_ENV: "production", DATABASE_URL: "postgres://synthetic.invalid/fixture" },
      migrationsDir: dir,
      createPool: () => { poolCreated = true; throw new Error("must not connect"); },
    }), { code: "MIGRATION_FILES_EMPTY" });
    assert.equal(poolCreated, false);
  } finally { rmSync(dir, { recursive: true }); }
});

test("pure gate: malformed ledger results fail closed and always roll back without logging row values", async () => {
  for (const result of [{}, { rows: null }, { rows: "invalid" }, { rows: [null] }, { rows: [{}] }, { rows: [{ name: null }] }, { rows: [{ name: 3 }] }]) {
    const queries = [];
    const client = { query: async (sql) => {
      queries.push(sql);
      return sql.startsWith("SELECT") ? result : { rows: [] };
    } };
    await assert.rejects(checkMigrationLedger(client, ["0001_first.sql"]), { code: "MIGRATION_LEDGER_INVALID" });
    assert.deepEqual(queries, ["BEGIN READ ONLY", "SELECT name FROM public._migrations", "ROLLBACK"]);
  }
});

function syntheticDriverError() {
  return Object.assign(new Error("password=synthetic-private-value host=synthetic.invalid"), {
    client: { connectionParameters: { password: "synthetic-private-value" } },
  });
}

function assertSanitizedFailure(error, expectedCode = "MIGRATION_CHECK_FAILED") {
  assert.equal(error.code, expectedCode);
  assert.doesNotMatch(migrationCheckFailureMessage(error), /synthetic-private-value|synthetic\.invalid|connectionParameters|password=/);
  return true;
}

test("pure gate: pool and client error events fail closed with sanitized failures and connection cleanup", async () => {
  for (const errorPhase of ["pool-connect", "client-select", "pool-release", "pool-end"]) {
    const dir = mkdtempSync(join(tmpdir(), "kidease-event-migration-check-"));
    const events = [];
    try {
      writeFileSync(join(dir, "0001_first.sql"), "Deliberately not executable SQL.");
      const pool = new EventEmitter();
      const client = new EventEmitter();
      client.query = async (sql) => {
        events.push(sql);
        if (sql.startsWith("SELECT") && errorPhase === "client-select") client.emit("error", syntheticDriverError());
        return { rows: [{ name: "0001_first.sql" }] };
      };
      client.release = () => {
        events.push("release");
        if (errorPhase === "pool-release") pool.emit("error", syntheticDriverError());
      };
      pool.connect = async () => {
        events.push("connect");
        if (errorPhase === "pool-connect") pool.emit("error", syntheticDriverError());
        return client;
      };
      pool.end = async () => {
        events.push("end");
        if (errorPhase === "pool-end") pool.emit("error", syntheticDriverError());
      };
      await assert.rejects(checkConfiguredMigrations({
        env: { DATABASE_URL: "postgres://synthetic.invalid/fixture" }, migrationsDir: dir, createPool: () => pool,
      }), error => assertSanitizedFailure(error));
      assert.equal(events.filter(event => event === "release").length, 1);
      assert.equal(events.filter(event => event === "end").length, 1);
      assert.ok(events.every(event => ["connect", "BEGIN READ ONLY", "SELECT name FROM public._migrations", "ROLLBACK", "release", "end"].includes(event)));
    } finally { rmSync(dir, { recursive: true }); }
  }
});

test("pure gate: release and pool-end failures cannot report an up-to-date build", async () => {
  for (const failurePhase of ["release", "end", "both"]) {
    const dir = mkdtempSync(join(tmpdir(), "kidease-cleanup-migration-check-"));
    const events = [];
    try {
      writeFileSync(join(dir, "0001_first.sql"), "Never read or executed.");
      const client = {
        query: async (sql) => { events.push(sql); return { rows: [{ name: "0001_first.sql" }] }; },
        release: () => { events.push("release"); if (failurePhase !== "end") throw syntheticDriverError(); },
      };
      const pool = {
        connect: async () => client,
        end: async () => { events.push("end"); if (failurePhase !== "release") throw syntheticDriverError(); },
      };
      await assert.rejects(checkConfiguredMigrations({
        env: { DATABASE_URL: "postgres://synthetic.invalid/fixture" }, migrationsDir: dir, createPool: () => pool,
      }), error => assertSanitizedFailure(error, "MIGRATION_CHECK_CLEANUP_FAILED"));
      assert.deepEqual(events, ["BEGIN READ ONLY", "SELECT name FROM public._migrations", "ROLLBACK", "release", "end"]);
    } finally { rmSync(dir, { recursive: true }); }
  }
});
