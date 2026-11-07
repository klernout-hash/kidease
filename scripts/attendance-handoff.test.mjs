import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  attendancePreviewEnabled,
  centreLocalDay,
  effectiveDoorAction,
  handoffCheckout,
  headcount,
  initialsFor,
} from "../src/lib/attendance-handoff.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { commitCorrection, commitHandoff, readCentreDay, readParentDay, seedDemoChildren } from "../src/lib/server/attendance-handoff.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function sqlFor(pg) {
  const run = async (text, params) => (await pg.query(text, params)).rows;
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  sql.query = run;
  return sql;
}

async function previewDb() {
  const pg = new PGlite();
  await pg.exec(`
    create table daycares (
      id text primary key,
      slug text unique,
      name text,
      name_fr text,
      tagline text,
      tagline_fr text,
      description text,
      description_fr text,
      address text,
      city text,
      province text,
      postal_code text,
      lat double precision,
      lng double precision,
      hours text,
      hours_fr text,
      age_min_months int,
      age_max_months int,
      photos text,
      visibility text,
      is_test int,
      timezone text
    );
    create table children (
      id text primary key,
      user_id text not null,
      name text not null,
      birthdate text not null,
      notes text
    );
    create table bookings (
      id text primary key,
      user_id text not null,
      daycare_id text not null,
      child_id text,
      start_month text,
      schedule text,
      age_group text,
      status text,
      monthly_amount int
    );
    create table provider_daycares (
      user_id text not null,
      daycare_id text not null,
      primary key (user_id, daycare_id)
    );
    create table child_care_people (
      id text primary key,
      child_id text not null,
      kind text not null,
      name text not null
    );
    create table child_check_events (
      id text primary key,
      daycare_id text not null,
      booking_id text,
      child_name text not null,
      parent_user_id text,
      action text not null,
      at timestamptz not null default now(),
      pickup_name text not null default '',
      recorded_by text not null,
      created_at timestamptz not null default now()
    );
  `);
  await pg.exec(read("migrations/0182_attendance_handoff.sql"));
  return { pg, sql: sqlFor(pg) };
}

test("attendance preview stays closed in production and does not send", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_CHILD_CHECKIN, false);
  assert.equal(attendancePreviewEnabled({}), false);
  assert.equal(attendancePreviewEnabled({ KIDEASE_ATTENDANCE_PREVIEW: "1" }), true);
  assert.equal(
    attendancePreviewEnabled({ VERCEL_ENV: "production", KIDEASE_ATTENDANCE_PREVIEW: "1" }),
    false,
  );
  assert.equal(centreLocalDay(new Date("2026-11-08T04:30:00.000Z"), "America/Winnipeg"), "2026-11-07");
  assert.equal(initialsFor("DEMO Avery"), "A");
  assert.equal(handoffCheckout({ pickupName: "DEMO Quinn", pickupNames: ["DEMO Parker"], noticeNames: ["DEMO Quinn"] }).reason, "notice_is_not_pickup");
  assert.equal(handoffCheckout({ pickupName: "DEMO Parker", pickupNames: ["DEMO Parker"], noticeNames: ["DEMO Quinn"] }).ok, true);
  assert.equal(headcount([{ last: "check_in" }, { last: "check_out" }, { last: null }]), 1);
  assert.equal(
    effectiveDoorAction([
      { id: "a", action: "check_in", at: "t", pickupName: "", correctionOf: null, reason: "" },
      { id: "b", action: "check_out", at: "t2", pickupName: "", correctionOf: "a", reason: "Wrong child" },
    ]),
    "check_out",
  );
  const server = read("src/lib/server/attendance-handoff.ts");
  assert.doesNotMatch(server, /sendTransactionalMail|sendSms|sendEmail|web-push|delete from child_check_events/i);
  assert.match(server, /'demo', 'held'/);
  assert.match(read("src/components/child-checkin-desk.tsx"), /data-ke="child-checkin"/);
  assert.match(read("src/components/child-checkin-desk.tsx"), /data-ke="child-check-history"/);
  assert.match(read("src/components/child-checkin-desk.tsx"), /featureCopy/);
  assert.match(read("src/lib/server/child-checkin.ts"), /childCheckinEnabled/);
  assert.doesNotMatch(read("src/lib/server/child-checkin.ts"), /photo|sendTransactionalMail|sendSms/i);
});

test("isolated preview database reloads demo attendance and refuses the wrong person", async () => {
  const { pg, sql } = await previewDb();
  const now = new Date("2026-11-07T18:00:00.000Z");
  await seedDemoChildren(sql, "parent-demo");
  const centre = await pg.query("select visibility, is_test, name from daycares where id = 'demo-att-centre'");
  assert.equal(centre.rows[0].visibility, "admin_only");
  assert.equal(Number(centre.rows[0].is_test), 1);
  assert.match(centre.rows[0].name, /DEMO/);
  const kids = await pg.query("select name from children where user_id = 'parent-demo' order by name");
  assert.deepEqual(kids.rows.map((row) => row.name), ["DEMO Avery", "DEMO Blair", "DEMO Casey"]);
  await assert.rejects(() =>
    pg.query("insert into child_notice_people (id, child_id, name, may_pickup) values ('bad', 'c', 'Nope', true)"),
  );

  const booking = await pg.query("select id from bookings where user_id = 'parent-demo' and child_id like '%avery' limit 1");
  const bookingId = booking.rows[0].id;
  assert.equal((await commitHandoff(sql, { actorId: "parent-demo", role: null, bookingId, action: "check_in", pickupName: "", now })).ok, false);
  assert.equal((await commitHandoff(sql, { actorId: "reader", role: "read_only", bookingId, action: "check_in", pickupName: "", now })).ok, false);
  assert.match(
    (await commitHandoff(sql, { actorId: "staff-1", role: "staff", bookingId, action: "check_out", pickupName: "DEMO Parker", now })).error,
    /already saved/,
  );
  const arrived = await commitHandoff(sql, { actorId: "staff-1", role: "staff", bookingId, action: "check_in", pickupName: "", now });
  assert.equal(arrived.ok, true);
  const again = await commitHandoff(sql, { actorId: "staff-1", role: "staff", bookingId, action: "check_in", pickupName: "", now });
  assert.equal(again.ok, true);
  assert.equal(again.duplicate, true);
  const blocked = await commitHandoff(sql, {
    actorId: "staff-1",
    role: "staff",
    bookingId,
    action: "check_out",
    pickupName: "DEMO Quinn",
    now,
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /notice does not allow pickup/);
  const left = await commitHandoff(sql, {
    actorId: "staff-1",
    role: "staff",
    bookingId,
    action: "check_out",
    pickupName: "DEMO Parker",
    now,
  });
  assert.equal(left.ok, true);
  assert.equal(left.notice, "held");
  const box = await pg.query("select channel, status from attendance_notice_outbox");
  assert.equal(box.rows.every((row) => row.channel === "demo" && row.status === "held"), true);
  assert.equal((await commitCorrection(sql, { actorId: "staff-1", role: "staff", bookingId, action: "check_in", reason: "Counted the wrong child", now })).ok, false);
  const corrected = await commitCorrection(sql, {
    actorId: "manager-1",
    role: "manager",
    bookingId,
    action: "check_in",
    reason: "Counted the wrong child",
    now,
  });
  assert.equal(corrected.ok, true);
  const kept = await pg.query("select count(*)::int as n from child_check_events where booking_id = $1 and correction_of is null", [bookingId]);
  assert.equal(Number(kept.rows[0].n), 2);

  const reloaded = await readParentDay(sql, "parent-demo", now);
  const avery = reloaded.find((row) => row.childName === "DEMO Avery");
  assert.equal(avery.status, "here");
  assert.equal(reloaded.length, 3);
  assert.equal((await readParentDay(sql, "other-parent", now)).length, 0);
  const roster = await readCentreDay(sql, { centreIds: ["demo-att-centre"], role: "staff", now });
  assert.equal(roster.headcount, 1);
  assert.equal(roster.canCorrect, false);
  await pg.close();
});
