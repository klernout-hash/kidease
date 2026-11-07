import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { decideUnifiedAlert, defaultUnifiedSettings } from "../src/lib/unified-alerts.ts";

const migration = readFileSync(new URL("../migrations/0173_unified_alerts.sql", import.meta.url), "utf8");

function tri(value) {
  if (value == null) return null;
  return !(value === 0 || value === false || value === "0");
}

async function db() {
  const pg = new PGlite();
  await pg.exec(`
    create table family_documents (id text);
    create table children (id text);
    create table staff_shifts (id text, starts_at timestamptz);
  `);
  await pg.exec(migration);
  await pg.exec(`
    alter table unified_alert_prefs add column if not exists email_on int;
    alter table unified_alert_prefs add column if not exists push_on int;
  `);
  return pg;
}

async function readChoice(pg, userId, typeId) {
  const rows = await pg.query(
    "select enabled, email_on, push_on from unified_alert_prefs where user_id = $1 and type_id = $2",
    [userId, typeId],
  );
  const row = rows.rows[0];
  if (!row) return { enabled: true, email: null, push: null };
  return { enabled: tri(row.enabled), email: tri(row.email_on), push: tri(row.push_on) };
}

function decisionFor(choice, extra = {}) {
  const settings = defaultUnifiedSettings("parent");
  return decideUnifiedAlert({
    typeId: "parent_request_accepted",
    settings,
    typeEnabled: choice.enabled,
    typeEmail: choice.email,
    typePush: choice.push,
    flagOn: true,
    live: true,
    pushArmed: true,
    previewOrTest: false,
    blocked: false,
    ...extra,
  });
}

test("a saved account choice survives a second read and the sender uses it", async () => {
  const pg = await db();
  const absent = await readChoice(pg, "parent-a", "parent_request_accepted");
  assert.equal(absent.enabled, true);
  assert.equal(absent.email, null);
  assert.equal(absent.push, null);
  const kept = decisionFor(absent);
  assert.equal(kept.channels.includes("email"), true);
  assert.equal(kept.channels.includes("push"), false);

  await pg.query(
    `insert into unified_alert_prefs (user_id, type_id, enabled, email_on, push_on)
     values ($1, $2, $3, $4, $5)`,
    ["parent-a", "parent_request_accepted", 1, 0, 1],
  );
  const again = await readChoice(pg, "parent-a", "parent_request_accepted");
  assert.deepEqual(again, { enabled: true, email: false, push: true });
  const changed = decisionFor(again);
  assert.equal(changed.channels.includes("email"), false);
  assert.equal(changed.channels.includes("in_app"), true);
  assert.equal(changed.channels.includes("push"), true);
  const unarmed = decisionFor(again, { pushArmed: false });
  assert.equal(unarmed.channels.includes("push"), false);

  const other = await readChoice(pg, "parent-b", "parent_request_accepted");
  assert.equal(other.email, null);
  assert.equal(decisionFor(other).channels.includes("email"), true);

  await pg.query(
    `insert into unified_alert_prefs (user_id, type_id, enabled, email_on, push_on)
     values ($1, $2, $3, $4, $5)`,
    ["parent-a", "parent_new_message", 0, null, null],
  );
  const off = await readChoice(pg, "parent-a", "parent_new_message");
  assert.equal(decisionFor({ ...off, enabled: off.enabled }).action, "skip");
  await pg.close();
});
