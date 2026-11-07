import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const sql = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");

test("preview migrations 0164 then 0178-0182 apply in order and keep holds", async () => {
  const pg = new PGlite();
  await pg.exec(`
    create table daycares (id text primary key, photos text);
    create table profiles (user_id text primary key);
  `);
  const early = pg.exec(sql("0182_attendance_handoff.sql"));
  await assert.rejects(early);
  for (const name of [
    "0164_child_check_events.sql",
    "0178_listing_spaces.sql",
    "0179_meal_offerings.sql",
    "0180_profile_about.sql",
    "0181_draft_policy_workflow.sql",
    "0182_attendance_handoff.sql",
  ]) {
    await pg.exec(sql(name));
  }
  await assert.rejects(
    pg.query("insert into child_notice_people (id, child_id, name, may_pickup) values ('n', 'c', 'Quinn', true)"),
  );
  await pg.query("insert into child_notice_people (id, child_id, name, may_pickup) values ('n', 'c', 'Quinn', false)");
  await assert.rejects(
    pg.query(
      "insert into attendance_notice_outbox (id, event_id, daycare_id, recipient_label, channel, status, dedupe_key) values ('o', 'e', 'd', 'Quinn', 'email', 'held', 'k')",
    ),
  );
  await pg.query(
    "insert into attendance_notice_outbox (id, event_id, daycare_id, recipient_label, channel, status, dedupe_key) values ('o', 'e', 'd', 'Quinn', 'demo', 'held', 'k')",
  );
  await assert.rejects(
    pg.query(
      "insert into draft_cancellation_policies (id, daycare_id, province, program, topic, body, status, in_force, version, created_by) values ('p', 'd', 'MB', 'x', 'cancel', 'body', 'counsel-review', true, 1, 'u')",
    ),
  );
  const rooms = await pg.query("select to_regclass('listing_spaces') as name");
  assert.equal(rooms.rows[0].name, "listing_spaces");
  await pg.close();
});
