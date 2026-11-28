/**
 * Attendance is stored per child and day. A parent may change only their own
 * child's row. These tests fail while a save keyed by child name overwrites
 * another family at the same centre.
 *
 * Run: node --experimental-strip-types --test scripts/attendance-cross-family.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DAY = "2026-11-02";
const CENTRE = "centre-1";
const STAFF = "user-staff";
const VICTIM = "user-victim";
const ATTACKER = "user-attacker";
const VICTIM_CHILD = "child-victim";
const ATTACKER_CHILD = "child-attacker";
const VICTIM_BOOKING = "book-victim";
const ATTACKER_BOOKING = "book-attacker";
const VICTIM_THREAD = "convo-victim";
const ATTACKER_THREAD = "convo-attacker";
const VICTIM_NAME = "Riley Chen";
const ATTACKER_NAME = "Sam Patel";
const PLACEHOLDER_KIOSK_SECRET = "placeholder-not-a-live-secret";

globalThis.__kideaseViteEnv = { SSR: true, DEV: true, MODE: "test", PROD: false };
await register(new URL("./attendance-cross-family-loader.mjs", import.meta.url), import.meta.url);

const { attendanceSql } = await import("./attendance-cross-family-db.mjs");
const { saveAttendance, getWeekSchedule } = await import("../src/lib/server/ops.ts");
const { updateChild } = await import("../src/lib/server/family.ts");
const { getLicensedMonth } = await import("../src/lib/server/care-ops.ts");
const { redeemKioskScan } = await import("../src/lib/server/qr-kiosk.ts");
const { reportMyChildAbsence, cancelMyChildAbsence, listCentreAbsences } = await import("../src/lib/server/child-checkin.ts");
const { emptyChild } = await import("../src/lib/child-profile.ts");
const { mintKioskToken } = await import("../src/lib/qr-kiosk.ts");
const { centreLocalDay } = await import("../src/lib/attendance-handoff.ts");

function toSql(pg) {
  const run = async (text, params) => {
    const values = params.map((value) => (value === undefined ? null : value));
    try {
      const result = await pg.query(text, values);
      return result.rows;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/does not exist/.test(message)) throw error;
      error.message = `${message}\nSQL: ${text.slice(0, 400)}`;
      throw error;
    }
  };
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  sql.query = (text, params = []) => run(text, params);
  return sql;
}

function migrationStatements() {
  const dir = join(root, "migrations");
  const files = readdirSync(dir)
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  const statements = [];
  for (const name of files) {
    const text = readFileSync(join(dir, name), "utf8");
    for (const chunk of text.split(/;\s*(?:\n|$)/)) {
      const statement = chunk.replace(/--[^\n]*/g, "").trim();
      if (!statement || /\battendance_notice\b/i.test(statement)) continue;
      const compact = statement.replace(/\s+/g, " ");
      const attendanceDdl =
        /\bcreate\s+table\s+(if\s+not\s+exists\s+)?attendance\b/i.test(compact) ||
        /\balter\s+table\s+attendance\b/i.test(compact) ||
        /\bdrop\s+table\s+(if\s+exists\s+)?attendance\b/i.test(compact) ||
        /\bon\s+attendance\s*\(/i.test(compact) ||
        /\bdrop\s+index\s+(if\s+exists\s+)?attendance_/i.test(compact);
      if (!attendanceDdl) continue;
      statements.push(statement);
    }
  }
  return statements;
}

async function openDb() {
  const pg = new PGlite({
    parsers: {
      20: Number,
      1082: (value) => value,
      1186: (value) => value,
    },
  });
  await pg.waitReady;
  await pg.exec(`
    create table daycares (
      id text primary key,
      name text not null,
      province text,
      timezone text,
      spots_updated_at timestamptz,
      contact_email text
    );
    create table children (
      id text primary key,
      user_id text not null,
      name text not null,
      preferred_name text,
      birthdate text not null,
      allergies text,
      epi_pen boolean,
      medical_notes text,
      medications text,
      doctor_name text,
      doctor_phone text,
      foods_like text,
      foods_avoid text,
      diet text,
      likes text,
      comfort_item text,
      nap_routine text,
      toilet text,
      home_language text,
      soothes text,
      fears text,
      emergency_name text,
      emergency_phone text,
      pickup_people text,
      photo_ok boolean,
      sunscreen_ok boolean,
      notes text,
      immunization_status text,
      immunization_note text,
      home_address text
    );
    create table bookings (
      id text primary key,
      user_id text not null,
      daycare_id text not null references daycares(id),
      child_id text,
      status text not null,
      conversation_id text,
      age_group text not null default 'preschool',
      parent_name text
    );
    create table conversations (
      id text primary key,
      user_id text not null,
      daycare_id text not null references daycares(id),
      last_at timestamptz not null default now()
    );
    create table messages (
      id text primary key,
      conversation_id text not null references conversations(id),
      sender text not null,
      body text not null,
      kind text,
      created_at timestamptz not null default now()
    );
    create table provider_daycares (user_id text, daycare_id text);
    create table centre_members (user_id text, daycare_id text, status text, role text, permission_preset text, permissions jsonb);
    create table profiles (user_id text, locale text);
  `);
  for (const statement of migrationStatements()) {
    try {
      await pg.exec(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}\nSQL: ${statement.slice(0, 400)}`);
    }
  }
  await pg.exec(readFileSync(join(root, "migrations/0133_kiosk_scans.sql"), "utf8"));
  for (const file of ["0146_absence_reports.sql", "0119_staff_scheduling.sql", "0045_user_notifications.sql"]) {
    await pg.exec(readFileSync(join(root, "migrations", file), "utf8"));
  }
  await pg.exec(`
    insert into daycares (id, name, province, timezone) values
      ('${CENTRE}', 'Maple Room', 'MB', 'America/Winnipeg');
    insert into children (id, user_id, name, birthdate) values
      ('${VICTIM_CHILD}', '${VICTIM}', '${VICTIM_NAME}', '2022-04-04'),
      ('${ATTACKER_CHILD}', '${ATTACKER}', '${ATTACKER_NAME}', '2021-06-01');
    insert into conversations (id, user_id, daycare_id) values
      ('${VICTIM_THREAD}', '${VICTIM}', '${CENTRE}'),
      ('${ATTACKER_THREAD}', '${ATTACKER}', '${CENTRE}');
    insert into bookings (id, user_id, daycare_id, child_id, status, conversation_id, parent_name) values
      ('${VICTIM_BOOKING}', '${VICTIM}', '${CENTRE}', '${VICTIM_CHILD}', 'active', '${VICTIM_THREAD}', 'Victim Parent'),
      ('${ATTACKER_BOOKING}', '${ATTACKER}', '${CENTRE}', '${ATTACKER_CHILD}', 'active', '${ATTACKER_THREAD}', 'Attacker Parent');
    insert into provider_daycares (user_id, daycare_id) values ('${STAFF}', '${CENTRE}');
  `);
  return { pg, sql: toSql(pg) };
}

function withSql(sql, run) {
  return attendanceSql.run(sql, run);
}

function attendanceInput(userId, bookingId, status, notes, day = DAY) {
  return {
    context: { userId },
    data: {
      daycareId: CENTRE,
      bookingId,
      conversationId: bookingId === VICTIM_BOOKING ? VICTIM_THREAD : ATTACKER_THREAD,
      childName: VICTIM_NAME,
      parentUserId: VICTIM,
      day,
      dropOff: "09:45",
      pickUp: "14:15",
      status,
      notes,
    },
  };
}

async function rowsFor(sql, bookingId, day) {
  return sql`
    select id, booking_id, conversation_id, child_name, parent_user_id,
           day::text as day, drop_off, pick_up, status, notes, updated_by
    from attendance
    where booking_id = ${bookingId} and day = ${day}
    order by id
  `;
}

async function renameAttacker(sql, name) {
  await withSql(sql, () =>
    updateChild({
      context: { userId: ATTACKER },
      data: { ...emptyChild(), id: ATTACKER_CHILD, name, birthdate: "2021-06-01" },
    }),
  );
}

function dayStatus(month, bookingId, day) {
  const child = month.children.find((row) => row.bookingId === bookingId);
  return child?.days.find((row) => String(row.day).slice(0, 10) === day)?.status ?? null;
}

describe("attendance rows stay with the child they belong to", { concurrency: 1 }, () => {
  test("a parent cannot mark another child by typing that child's name", async () => {
    const { pg, sql } = await openDb();
    try {
      await withSql(sql, async () => {
        await saveAttendance(
          attendanceInput(STAFF, VICTIM_BOOKING, "arrived", "inhaler is in the bag"),
        );
        await saveAttendance(attendanceInput(ATTACKER, ATTACKER_BOOKING, "departed", "picked up"));
      });
      const victim = await rowsFor(sql, VICTIM_BOOKING, DAY);
      const attacker = await rowsFor(sql, ATTACKER_BOOKING, DAY);
      assert.equal(victim.length, 1);
      assert.equal(victim[0].status, "arrived");
      assert.equal(victim[0].notes, "inhaler is in the bag");
      assert.equal(victim[0].child_name, VICTIM_NAME);
      assert.equal(victim[0].parent_user_id, VICTIM);
      assert.equal(attacker.length, 1);
      assert.equal(attacker[0].status, "departed");
      assert.equal(attacker[0].child_name, ATTACKER_NAME);
      assert.notEqual(attacker[0].id, victim[0].id);
    } finally {
      await pg.close();
    }
  });

  test("a parent cannot save attendance on another family's booking", async () => {
    const { pg, sql } = await openDb();
    try {
      await withSql(sql, () =>
        saveAttendance(attendanceInput(STAFF, VICTIM_BOOKING, "arrived", "inhaler is in the bag")),
      );
      await assert.rejects(
        () =>
          withSql(sql, () =>
            saveAttendance(attendanceInput(ATTACKER, VICTIM_BOOKING, "absent", "forged")),
          ),
        /Not allowed/,
      );
      const victim = await rowsFor(sql, VICTIM_BOOKING, DAY);
      assert.equal(victim[0].status, "arrived");
      assert.equal(victim[0].notes, "inhaler is in the bag");
      assert.equal(victim[0].updated_by, STAFF);
    } finally {
      await pg.close();
    }
  });

  test("renaming a child to a classmate's name must not overwrite that classmate's day", async () => {
    const { pg, sql } = await openDb();
    try {
      await withSql(sql, async () => {
        await saveAttendance(
          attendanceInput(STAFF, VICTIM_BOOKING, "arrived", "inhaler is in the bag"),
        );
        await saveAttendance(attendanceInput(ATTACKER, ATTACKER_BOOKING, "departed", "picked up"));
      });
      const before = (await rowsFor(sql, VICTIM_BOOKING, DAY))[0];
      // The staff check-in posts one status line to the classmate's own thread.
      const victimMessagesBefore =
        await sql`select body from messages where conversation_id = ${VICTIM_THREAD}`;
      await renameAttacker(sql, VICTIM_NAME);
      const renamed = await sql`select name from children where id = ${ATTACKER_CHILD}`;
      assert.equal(renamed[0].name, VICTIM_NAME);

      await withSql(sql, () =>
        saveAttendance(attendanceInput(ATTACKER, ATTACKER_BOOKING, "absent", "not at the centre")),
      );

      const victim = await rowsFor(sql, VICTIM_BOOKING, DAY);
      const attacker = await rowsFor(sql, ATTACKER_BOOKING, DAY);
      assert.equal(victim.length, 1);
      assert.equal(victim[0].id, before.id);
      assert.equal(victim[0].status, "arrived");
      assert.equal(victim[0].drop_off, before.drop_off);
      assert.equal(victim[0].pick_up, before.pick_up);
      assert.equal(victim[0].notes, "inhaler is in the bag");
      assert.equal(victim[0].updated_by, STAFF);
      assert.equal(victim[0].booking_id, VICTIM_BOOKING);
      assert.equal(victim[0].conversation_id, VICTIM_THREAD);
      assert.equal(victim[0].parent_user_id, VICTIM);
      assert.equal(attacker.length, 1);
      assert.equal(attacker[0].status, "absent");
      assert.equal(attacker[0].notes, "not at the centre");
      assert.equal(attacker[0].booking_id, ATTACKER_BOOKING);
      assert.equal(attacker[0].parent_user_id, ATTACKER);
      assert.notEqual(attacker[0].id, victim[0].id);

      const staffWeek = await withSql(sql, () =>
        getWeekSchedule({
          context: { userId: STAFF },
          data: { daycareId: CENTRE, weekStart: DAY },
        }),
      );
      const victimDay = staffWeek.items.find(
        (row) => row.bookingId === VICTIM_BOOKING && row.day === DAY,
      );
      const attackerDay = staffWeek.items.find(
        (row) => row.bookingId === ATTACKER_BOOKING && row.day === DAY,
      );
      assert.equal(victimDay?.status, "arrived");
      assert.equal(victimDay?.notes, "inhaler is in the bag");
      assert.equal(attackerDay?.status, "absent");

      const month = await withSql(sql, () =>
        getLicensedMonth({
          context: { userId: STAFF },
          data: { daycareId: CENTRE, month: "2026-11" },
        }),
      );
      assert.equal(dayStatus(month, VICTIM_BOOKING, DAY), "arrived");
      assert.equal(dayStatus(month, ATTACKER_BOOKING, DAY), "absent");

      const victimMessages =
        await sql`select body from messages where conversation_id = ${VICTIM_THREAD}`;
      assert.deepEqual(victimMessages, victimMessagesBefore);
    } finally {
      await pg.close();
    }
  });

  test("a kiosk check-out for one child must not change a classmate who shares the name", async () => {
    const { pg, sql } = await openDb();
    const previousSecret = process.env.KIOSK_TOKEN_SECRET;
    const previousFlag = process.env.FEATURE_QR_KIOSK;
    process.env.KIOSK_TOKEN_SECRET = PLACEHOLDER_KIOSK_SECRET;
    process.env.FEATURE_QR_KIOSK = "1";
    try {
      const today = new Date().toISOString().slice(0, 10);
      await withSql(sql, () =>
        saveAttendance(
          attendanceInput(STAFF, VICTIM_BOOKING, "arrived", "inhaler is in the bag", today),
        ),
      );
      const before = (await rowsFor(sql, VICTIM_BOOKING, today))[0];
      await renameAttacker(sql, VICTIM_NAME);
      const minted = mintKioskToken({
        daycareId: CENTRE,
        secret: PLACEHOLDER_KIOSK_SECRET,
        enabled: true,
      });
      assert.ok(minted);
      const decision = await withSql(sql, () =>
        redeemKioskScan({
          context: { userId: ATTACKER },
          data: { token: minted.token, childId: ATTACKER_CHILD, action: "check_out" },
        }),
      );
      assert.equal(decision.ok, true);
      assert.equal(decision.status, "departed");
      const victim = await rowsFor(sql, VICTIM_BOOKING, today);
      const attacker = await rowsFor(sql, ATTACKER_BOOKING, today);
      assert.equal(victim.length, 1);
      assert.equal(victim[0].id, before.id);
      assert.equal(victim[0].status, "arrived");
      assert.equal(victim[0].notes, "inhaler is in the bag");
      assert.equal(victim[0].updated_by, STAFF);
      assert.equal(victim[0].booking_id, VICTIM_BOOKING);
      assert.equal(attacker.length, 1);
      assert.equal(attacker[0].status, "departed");
      assert.equal(attacker[0].booking_id, ATTACKER_BOOKING);
      assert.notEqual(attacker[0].id, victim[0].id);
    } finally {
      if (previousSecret === undefined) delete process.env.KIOSK_TOKEN_SECRET;
      else process.env.KIOSK_TOKEN_SECRET = previousSecret;
      if (previousFlag === undefined) delete process.env.FEATURE_QR_KIOSK;
      else process.env.FEATURE_QR_KIOSK = previousFlag;
      await pg.close();
    }
  });

  test("Daily care scopes absences to the reporting family and the reviewing centre", async () => {
    const { pg, sql } = await openDb();
    try {
      await renameAttacker(sql, VICTIM_NAME);
      const now = new Date();
      const localDay = centreLocalDay(now, "America/Winnipeg");
      await withSql(sql, () => saveAttendance(attendanceInput(STAFF, VICTIM_BOOKING, "arrived", "Door note", localDay)));
      const before = await rowsFor(sql, VICTIM_BOOKING, localDay);
      const input = { context: { userId: ATTACKER }, data: { bookingId: ATTACKER_BOOKING, status: "sick", localDay } };
      const report = (bookingId) => withSql(sql, () => reportMyChildAbsence({ ...input, data: { ...input.data, bookingId } }));
      assert.equal((await report(VICTIM_BOOKING)).ok, false);
      await sql`update bookings set status = 'pending' where id = ${ATTACKER_BOOKING}`;
      assert.equal((await report(ATTACKER_BOOKING)).ok, false);
      assert.deepEqual(await sql`select id from absence_reports`, []);
      await sql`update bookings set status = 'active' where id = ${ATTACKER_BOOKING}`;
      await sql`
        insert into staff_shifts (id, daycare_id, staff_name, role, room_band, starts_at, ends_at, created_by)
        values ('shift', ${CENTRE}, 'Sample staff', 'ece', 'preschool', now() - interval '1 hour', now() + interval '1 hour', ${STAFF})
      `;
      await sql`
        insert into centre_members (user_id, daycare_id, status, role)
        values ('manager', ${CENTRE}, 'active', 'manager'), ('employee', ${CENTRE}, 'active', 'staff')
      `;
      assert.equal((await report(ATTACKER_BOOKING)).ok, true);
      assert.equal((await report(ATTACKER_BOOKING)).ok, true);
      assert.deepEqual(await rowsFor(sql, VICTIM_BOOKING, localDay), before);
      const [attacker] = await rowsFor(sql, ATTACKER_BOOKING, localDay);
      assert.equal(attacker.status, "sick");
      assert.equal(attacker.parent_user_id, ATTACKER);
      assert.deepEqual(await sql`select id, parent_user_id, band, children_now, ratio_status from absence_reports`, [{
        id: `ab_${attacker.id}`, parent_user_id: ATTACKER, band: "preschool", children_now: 1, ratio_status: "ok",
      }]);
      const list = (userId, centre = CENTRE) => withSql(sql, () => listCentreAbsences({
        context: { userId }, data: { centre, day: localDay },
      }));
      for (const userId of [STAFF, "manager"]) {
        const visible = await list(userId);
        assert.equal(visible.selected, CENTRE);
        assert.deepEqual(visible.rows, [{
          id: attacker.id, child_name: VICTIM_NAME, status: "sick", children_now: 1, ratio_status: "ok",
        }]);
      }
      for (const [userId, centre] of [["employee", CENTRE], [ATTACKER, CENTRE], [STAFF, "another-centre"]]) {
        const denied = await list(userId, centre);
        assert.equal(denied.selected, null);
        assert.deepEqual(denied.rows, []);
      }
      assert.deepEqual(await sql`select user_id, href from user_notifications order by user_id`, [
        { user_id: "employee", href: "/provider?desk=today" },
        { user_id: "manager", href: `/provider/absence?centre=${CENTRE}&day=${localDay}&lang=en` },
        { user_id: STAFF, href: `/provider/absence?centre=${CENTRE}&day=${localDay}&lang=en` },
      ]);
      assert.equal((await withSql(sql, () => cancelMyChildAbsence(input))).ok, true);
      assert.deepEqual((await list(STAFF)).rows, []);
    } finally {
      await pg.close();
    }
  });
});
