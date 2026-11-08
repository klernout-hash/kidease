import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { eligibilityFor, noticeGrantsPickup, noticeRecipients, refuseHeldReplay } from "../src/lib/attendance-notices.ts";
import {
  commitHandoff,
  enqueueAttendanceNotices,
  promoteHeldNotices,
  readMyNotice,
  settleAttendanceNotices,
} from "../src/lib/server/attendance-handoff.ts";

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

async function db() {
  const pg = new PGlite();
  await pg.exec(`
    create table daycares (id text primary key, name text, is_test int, timezone text, visibility text);
    create table children (id text primary key, user_id text, name text, birthdate text, notes text);
    create table bookings (
      id text primary key, user_id text, daycare_id text, child_id text, status text,
      start_month text, schedule text, age_group text, monthly_amount int
    );
    create table child_care_people (id text primary key, child_id text, kind text, name text);
    create table centre_members (user_id text, daycare_id text, role text, status text);
    create table child_check_events (
      id text primary key, daycare_id text not null, booking_id text, child_name text not null,
      parent_user_id text, action text not null, at timestamptz not null default now(),
      pickup_name text not null default '', recorded_by text not null, created_at timestamptz not null default now()
    );
  `);
  await pg.exec(read("migrations/0182_attendance_handoff.sql"));
  await pg.exec(read("migrations/0183_attendance_notice_eligibility.sql"));
  await pg.exec(`
    insert into daycares (id, name, is_test, timezone, visibility) values
      ('centre-real', 'Maple Room', 0, 'America/Winnipeg', 'public'),
      ('demo-att-centre', 'DEMO QA Centre', 1, 'America/Winnipeg', 'admin_only');
    insert into children (id, user_id, name, birthdate) values
      ('child-1', 'parent-1', 'Amina', '2022-01-01'),
      ('child-demo', 'parent-demo', 'DEMO Avery', '2021-04-02');
    insert into bookings (id, user_id, daycare_id, child_id, status) values
      ('book-1', 'parent-1', 'centre-real', 'child-1', 'accepted'),
      ('book-demo', 'parent-demo', 'demo-att-centre', 'child-demo', 'accepted');
    insert into child_care_people (id, child_id, kind, name) values ('pk', 'child-1', 'pickup', 'Sam');
    insert into centre_members (user_id, daycare_id, role, status) values
      ('manager-1', 'centre-real', 'manager', 'active'),
      ('staff-1', 'centre-real', 'staff', 'active'),
      ('owner-1', 'centre-real', 'owner', 'active');
    insert into child_notice_people (id, child_id, name, may_pickup) values
      ('nt', 'child-1', 'Quinn', false),
      ('nt-demo', 'child-demo', 'DEMO Quinn', false);
  `);
  return { pg, sql: sqlFor(pg) };
}

test("a real arrival queues the linked parent and managers, not another family", async () => {
  assert.equal(noticeGrantsPickup(), false);
  assert.deepEqual(
    noticeRecipients({
      guardianUserId: "parent-1",
      actorId: "staff-1",
      centreUserIds: [
        { userId: "staff-1", role: "staff" },
        { userId: "manager-1", role: "manager" },
        { userId: "owner-1", role: "owner" },
      ],
    }).map((row) => row.userId),
    ["parent-1", "manager-1", "owner-1"],
  );
  const { pg, sql } = await db();
  const now = new Date("2026-11-08T15:00:00.000Z");
  const saved = await commitHandoff(sql, {
    actorId: "staff-1",
    role: "staff",
    bookingId: "book-1",
    action: "check_in",
    pickupName: "",
    now,
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.notice, "waiting");
  const again = await commitHandoff(sql, {
    actorId: "staff-1",
    role: "staff",
    bookingId: "book-1",
    action: "check_in",
    pickupName: "",
    now,
  });
  assert.equal(again.duplicate, true);
  const rows = await pg.query("select id, recipient_user_id, audience, channel, status from attendance_notice_outbox order by audience, recipient_user_id");
  assert.deepEqual(
    rows.rows.map((row) => `${row.audience}:${row.recipient_user_id}:${row.channel}:${row.status}`),
    ["centre:manager-1:account:waiting", "centre:owner-1:account:waiting", "guardian:parent-1:account:waiting"],
  );
  const mineId = rows.rows.find((row) => row.recipient_user_id === "parent-1").id;
  assert.ok(await readMyNotice(sql, "parent-1", mineId));
  assert.equal(await readMyNotice(sql, "other-parent", rows.rows[0].id), null);
  const held = await promoteHeldNotices();
  assert.equal(held.reason, "held_not_live");
  const still = await pg.query("select count(*)::int as n from attendance_notice_outbox where channel = 'demo'");
  assert.equal(Number(still.rows[0].n), 0);
  await pg.close();
});

test("demo notices stay held and a failed settle can be retried without sending", async () => {
  assert.equal(eligibilityFor({
    transportLive: false,
    emailVerified: true,
    pushArmed: false,
    emailWanted: null,
    pushWanted: null,
  }).reason, "transport_off");
  assert.equal(eligibilityFor({
    transportLive: true,
    emailVerified: false,
    pushArmed: true,
    emailWanted: true,
    pushWanted: false,
  }).reason, "email_unverified");
  assert.equal(eligibilityFor({
    transportLive: true,
    emailVerified: true,
    pushArmed: true,
    emailWanted: false,
    pushWanted: false,
  }).reason, "pref_off");
  assert.equal(refuseHeldReplay({ channel: "demo", status: "held" }).ok, false);
  const server = read("src/lib/server/attendance-handoff.ts");
  assert.doesNotMatch(server, /sendTransactionalMail|sendSms|sendEmail|web-push/i);

  const { pg, sql } = await db();
  const now = new Date("2026-11-08T15:00:00.000Z");
  const demo = await commitHandoff(sql, {
    actorId: "staff-1",
    role: "staff",
    bookingId: "book-demo",
    action: "check_in",
    pickupName: "",
    now,
  });
  assert.equal(demo.notice, "held");
  const before = await pg.query("select id, channel, status from attendance_notice_outbox");
  assert.equal(before.rows.every((row) => row.channel === "demo" && row.status === "held"), true);
  const replay = await settleAttendanceNotices(sql, {
    eventId: demo.eventId,
    gateFor: () => ({ transportLive: true, emailVerified: true, pushArmed: true, emailWanted: true, pushWanted: true }),
  });
  assert.equal(replay.settled, 0);
  const after = await pg.query("select channel, status from attendance_notice_outbox");
  assert.equal(after.rows.every((row) => row.channel === "demo" && row.status === "held"), true);

  const real = await enqueueAttendanceNotices(sql, {
    eventId: "evt-real",
    daycareId: "centre-real",
    childId: "child-1",
    guardianUserId: "parent-1",
    actorId: "staff-1",
  });
  assert.equal(real, "waiting");
  await pg.query("update attendance_notice_outbox set status = 'eligible' where channel = 'account' and recipient_user_id = 'parent-1'");
  const target = await pg.query("select id from attendance_notice_outbox where recipient_user_id = 'parent-1' and event_id = 'evt-real'");
  const failOnce = new Set([target.rows[0].id]);
  const first = await settleAttendanceNotices(sql, {
    eventId: "evt-real",
    failOnce,
    gateFor: () => ({ transportLive: true, emailVerified: true, pushArmed: false, emailWanted: true, pushWanted: false }),
  });
  assert.equal(first.settled >= 1, true);
  const retried = await pg.query("select status, attempts from attendance_notice_outbox where id = $1", [target.rows[0].id]);
  assert.equal(retried.rows[0].status, "retry");
  assert.equal(Number(retried.rows[0].attempts), 1);
  await settleAttendanceNotices(sql, {
    eventId: "evt-real",
    gateFor: () => ({ transportLive: true, emailVerified: true, pushArmed: false, emailWanted: true, pushWanted: false }),
  });
  const done = await pg.query("select status, last_error from attendance_notice_outbox where id = $1", [target.rows[0].id]);
  assert.equal(done.rows[0].status, "eligible");
  assert.equal(done.rows[0].last_error, "in_app");
  const audit = await pg.query("select count(*)::int as n from attendance_notice_audit");
  assert.equal(Number(audit.rows[0].n) > 0, true);
  const sent = await pg.query("select count(*)::int as n from attendance_notice_outbox where status = 'sent'");
  assert.equal(Number(sent.rows[0].n), 0);
  await pg.close();
});
