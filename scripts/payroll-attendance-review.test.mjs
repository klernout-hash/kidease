import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readAttendanceReview } from "../src/lib/payroll/attendance-review.ts";

test("payroll review uses only owner centres and stable employee IDs; no rates or personal fields", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table daycares (id text primary key, name text not null);
      create table provider_daycares (user_id text, daycare_id text, primary key (user_id, daycare_id));
      insert into daycares values ('centre-a', 'Oak'), ('centre-b', 'Birch'), ('centre-c', 'Pine');
      insert into provider_daycares values ('owner-a', 'centre-a'), ('owner-b', 'centre-b'), ('owner-a', 'centre-c');
    `);
    await db.exec(
      await readFile(new URL("../migrations/0225_provider_payroll.sql", import.meta.url), "utf8"),
    );
    await db.exec(`
      insert into payroll_employees
        (id, daycare_id, user_id, display_name, province, pay_type, rate_cents, pay_frequency, td1_federal_cents, td1_provincial_cents, bank_token)
      values
        ('a-person-1', 'centre-a', 'a-user-1', 'Alex Smith', 'ON', 'hourly', 1999, 'weekly', 0, 0, 'synthetic-not-returned'),
        ('a-person-2', 'centre-a', 'a-user-2', 'Alex Smith', 'ON', 'hourly', 2000, 'weekly', 0, 0, null),
        ('b-person-1', 'centre-b', 'b-user-1', 'Alex Smith', 'ON', 'hourly', 2500, 'weekly', 0, 0, null);
      insert into payroll_punches
        (id, daycare_id, employee_id, clock_in_at, clock_out_at, unpaid_break_minutes, source, approval_status, created_by)
      values
        ('other-person', 'centre-a', 'a-person-2', now() - interval '1 day', now(), 0, 'phone', 'approved', 'a-user-2'),
        ('other-centre', 'centre-b', 'b-person-1', now() - interval '3 hours', now(), 0, 'phone', 'approved', 'b-user-1'),
        ('old-closed', 'centre-a', 'a-person-1', now() - interval '20 days', now() - interval '20 days' + interval '4 hours', 0, 'phone', 'approved', 'a-user-1'),
        ('open', 'centre-a', 'a-person-1', now() - interval '16 days', null, 0, 'phone', 'pending', 'a-user-1'),
        ('current', 'centre-a', 'a-person-1', now() - interval '5 hours', now() - interval '1 hour', 30, 'phone', 'approved', 'a-user-1'),
        ('bad-time', 'centre-a', 'a-person-1', now() - interval '2 hours', now() - interval '3 hours', 0, 'phone', 'pending', 'a-user-1');
    `);
    const sql = { query: async (query, params) => (await db.query(query, params)).rows };
    assert.deepEqual(await readAttendanceReview(sql, "owner-a", "", ""), {
      kind: "centres",
      options: [
        { id: "centre-a", name: "Oak" },
        { id: "centre-c", name: "Pine" },
      ],
    });
    assert.deepEqual(await readAttendanceReview(sql, "owner-a", "centre-a", ""), {
      kind: "staff",
      options: [
        { id: "a-person-1", name: "Alex Smith" },
        { id: "a-person-2", name: "Alex Smith" },
      ],
    });
    assert.deepEqual(await readAttendanceReview(sql, "a-user-1", "centre-a", ""), {
      kind: "staff",
      options: [],
    });
    assert.deepEqual(await readAttendanceReview(sql, "owner-b", "centre-a", "a-person-1"), {
      kind: "missing",
    });
    assert.deepEqual(await readAttendanceReview(sql, "owner-a", "centre-b", "a-person-1"), {
      kind: "missing",
    });
    assert.deepEqual(await readAttendanceReview(sql, "owner-a", "", "a-person-1"), {
      kind: "denied",
    });
    const result = await readAttendanceReview(sql, "owner-a", "centre-a", "a-person-1");
    assert.equal(result.kind, "punches");
    assert.equal(result.more, false);
    assert.deepEqual(
      result.rows.map((p) => [p.id, p.recordedMinutes, p.approved]),
      [
        ["bad-time", null, false],
        ["current", 210, true],
        ["open", null, false],
      ],
    );
    assert.deepEqual(Object.keys(result.rows[0]), [
      "id",
      "clockIn",
      "clockOut",
      "recordedMinutes",
      "approved",
    ]);
    assert.equal(
      (await db.query("select count(*)::int as count from payroll_punches")).rows[0].count,
      6,
    );
    await db.exec(`
      insert into payroll_punches
        (id, daycare_id, employee_id, clock_in_at, clock_out_at, source, created_by)
      select 'extra-' || n, 'centre-a', 'a-person-1', now() - interval '8 hours',
        now() - interval '4 hours', 'phone', 'a-user-1'
      from generate_series(1, 101) n
    `);
    const capped = await readAttendanceReview(sql, "owner-a", "centre-a", "a-person-1");
    assert.equal(capped.kind, "punches");
    assert.equal(capped.more, true);
    assert.equal(capped.rows.length, 100);
    assert.equal(
      (await db.query("select count(*)::int as count from payroll_punches")).rows[0].count,
      107,
    );
  } finally {
    await db.close();
  }
});

test("provider review is deliberately read-only, centre-scoped, and behind the default-off gate", async () => {
  const source = await readFile(
    new URL("../src/lib/server/payroll-desk.ts", import.meta.url),
    "utf8",
  );
  const endpoint = source
    .split("export const payrollAttendanceReview")[1]
    .split("export const payrollAttention")[0];
  assert.match(endpoint, /method: "GET"/);
  assert.match(endpoint, /middleware\(\[authMiddleware\]\)/);
  assert.match(endpoint, /private, no-store/);
  assert.match(endpoint, /if \(!providerPayrollEnabled\(\)\)/);
  assert.match(endpoint, /context\.userId, data\.daycareId, data\.employeeId/);
  assert.doesNotMatch(endpoint, /insert into|update payroll|delete from/i);
  const flags = await readFile(new URL("../src/lib/flags.ts", import.meta.url), "utf8");
  assert.match(flags, /FEATURE_PROVIDER_PAYROLL:\s*false/);
  const route = await readFile(new URL("../src/routes/provider.tsx", import.meta.url), "utf8");
  assert.match(route, /desk === "pay" && session\?\.providerPayroll && centreOwner/);
});
