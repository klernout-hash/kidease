/**
 * Migration 0237 keys attendance by booking and day. It must keep every row,
 * run twice safely, and still upsert older staff rows that have no booking.
 *
 * Run: node --experimental-strip-types --test scripts/attendance-per-booking-migration.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

async function openDb() {
  const pg = new PGlite({ parsers: { 1082: (value) => value } });
  await pg.waitReady;
  await pg.exec(`
    create table daycares (id text primary key);
    insert into daycares (id) values ('centre-1');
  `);
  await pg.exec(read("migrations/0012_attendance.sql"));
  return pg;
}

test("0237 keeps every row, runs twice, and keys linked rows by booking", async () => {
  const pg = await openDb();
  try {
    // A rename under the old name key left two rows on one booking and day.
    await pg.exec(`
      insert into attendance (id, daycare_id, booking_id, child_name, day, status, created_at) values
        ('old', 'centre-1', 'book-1', 'Sam', '2026-11-02', 'arrived', '2026-11-02T14:00:00Z'),
        ('new', 'centre-1', 'book-1', 'Samuel', '2026-11-02', 'departed', '2026-11-02T20:00:00Z'),
        ('staff', 'centre-1', null, 'Walk-in', '2026-11-02', 'arrived', '2026-11-02T15:00:00Z');
    `);
    await pg.exec(read("migrations/0237_attendance_per_booking.sql"));
    await pg.exec(read("migrations/0237_attendance_per_booking.sql"));

    const rows = (await pg.query("select id, booking_id, status from attendance order by id")).rows;
    assert.deepEqual(rows, [
      { id: "new", booking_id: "book-1", status: "departed" },
      { id: "old", booking_id: null, status: "arrived" },
      { id: "staff", booking_id: null, status: "arrived" },
    ]);
    const indexes = (await pg.query("select indexname from pg_indexes where tablename = 'attendance'")).rows.map(
      (row) => row.indexname,
    );
    assert.ok(indexes.includes("attendance_day_booking_idx"));
    assert.ok(indexes.includes("attendance_day_child_unlinked_idx"));
    assert.ok(!indexes.includes("attendance_day_child_idx"));

    // Two children with the same name on different bookings now get their own rows.
    await pg.exec(`
      insert into attendance (id, daycare_id, booking_id, child_name, day, status) values
        ('a', 'centre-1', 'book-a', 'Riley Chen', '2026-11-03', 'arrived'),
        ('b', 'centre-1', 'book-b', 'Riley Chen', '2026-11-03', 'absent');
    `);
    await assert.rejects(
      () =>
        pg.exec(`insert into attendance (id, daycare_id, booking_id, child_name, day, status)
                 values ('a2', 'centre-1', 'book-a', 'Other', '2026-11-03', 'sick')`),
      /duplicate key/,
    );

    // Staff rows with no booking still upsert by name.
    await pg.exec(`
      insert into attendance (id, daycare_id, booking_id, child_name, day, status)
      values ('staff-2', 'centre-1', null, 'Walk-in', '2026-11-02', 'departed')
      on conflict (daycare_id, child_name, day) where booking_id is null
      do update set status = excluded.status
    `);
    const staff = (await pg.query("select id, status from attendance where child_name = 'Walk-in'")).rows;
    assert.deepEqual(staff, [{ id: "staff", status: "departed" }]);
  } finally {
    await pg.close();
  }
});

test("0237 down script restores the name index when names are unique", async () => {
  const pg = await openDb();
  try {
    await pg.exec(read("migrations/0237_attendance_per_booking.sql"));
    await pg.exec(read("migrations/down/0237_attendance_per_booking.sql"));
    const indexes = (await pg.query("select indexname from pg_indexes where tablename = 'attendance'")).rows.map(
      (row) => row.indexname,
    );
    assert.ok(indexes.includes("attendance_day_child_idx"));
    assert.ok(!indexes.includes("attendance_day_booking_idx"));
  } finally {
    await pg.close();
  }
});
