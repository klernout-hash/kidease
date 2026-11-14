import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import { checkConfiguredMigrations } from "./check-migrations.mjs";

const migrationsDir = new URL("../migrations", import.meta.url);
const inventory = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migration = "0204_centre_lead_worker.sql";

function ledgerPool(applied) {
  const state = { statements: [], released: 0, ended: 0 };
  return {
    state,
    createPool: async () => ({
      on: () => {},
      connect: async () => ({
        on: () => {},
        query: async (sql) => {
          state.statements.push(sql);
          assert.ok(
            ["BEGIN READ ONLY", "SELECT name FROM public._migrations", "ROLLBACK"].includes(sql),
            "the build must not apply schema or update the ledger",
          );
          return sql === "SELECT name FROM public._migrations"
            ? { rows: applied.map((name) => ({ name })) }
            : { rows: [] };
        },
        release: () => {
          state.released++;
        },
      }),
      end: async () => {
        state.ended++;
      },
    }),
  };
}

test("production's read-only build gate rejects pending 0204 regardless of tracker schedule opt-in", async () => {
  assert.ok(inventory.includes(migration));
  for (const schedule of [undefined, "0", "1"]) {
    const pool = ledgerPool(inventory.filter((name) => name !== migration));
    await assert.rejects(
      checkConfiguredMigrations({
        env: {
          VERCEL_ENV: "production",
          DATABASE_URL: "postgresql://fixture.invalid/local",
          CENTRE_LEAD_WORKER_SCHEDULE: schedule,
        },
        migrationsDir,
        createPool: pool.createPool,
      }),
      (error) =>
        error.code === "MIGRATIONS_PENDING" &&
        error.pending.length === 1 &&
        error.pending[0] === migration,
    );
    assert.deepEqual(pool.state.statements, [
      "BEGIN READ ONLY",
      "SELECT name FROM public._migrations",
      "ROLLBACK",
    ]);
    assert.equal(pool.state.released, 1);
    assert.equal(pool.state.ended, 1);
  }
});

test("an already recorded 0204 clears only the filename-ledger check without applying SQL", async () => {
  const pool = ledgerPool(inventory);
  const result = await checkConfiguredMigrations({
    env: { VERCEL_ENV: "production", DATABASE_URL: "postgresql://fixture.invalid/local" },
    migrationsDir,
    createPool: pool.createPool,
  });
  assert.equal(result.status, "up-to-date");
  assert.equal(result.expected, inventory.length);
  assert.deepEqual(pool.state.statements, [
    "BEGIN READ ONLY",
    "SELECT name FROM public._migrations",
    "ROLLBACK",
  ]);
});
