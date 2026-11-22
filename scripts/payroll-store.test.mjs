// Pay day database rules, on an in-memory Postgres (PGlite) with synthetic data.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { approvePeriod, checkIn, listEditors, loadDesk, loadPeople, loadStubs, payAccess, saveFlag, saveOverride, setEditor, setWageClass } from "../src/lib/payroll/pay-store.ts";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create table daycares (id text primary key, name text not null);
    create table provider_daycares (user_id text, daycare_id text, primary key (user_id, daycare_id));
    insert into daycares values ('centre-a', 'Oak'), ('centre-b', 'Birch');
    insert into provider_daycares values ('owner-a', 'centre-a'), ('owner-b', 'centre-b');
    create table "user" (id text primary key, name text, email text);
    create table centre_members (id text primary key, daycare_id text, user_id text, role text, status text default 'active');
    insert into "user" values ('staff-1', 'Amira Saleh', 'a@example.test'), ('staff-2', 'Leo Chen', 'l@example.test');
    insert into centre_members values ('m1', 'centre-a', 'staff-1', 'staff', 'active'), ('m2', 'centre-a', 'staff-2', 'manager', 'active');
  `);
  for (const file of ["0225_provider_payroll", "0226_extra_tax_requests", "0227_employee_forms", "0228_payroll_pay_runs"]) {
    await db.exec(await readFile(new URL(`../migrations/${file}.sql`, import.meta.url), "utf8"));
  }
  await db.exec(`
    insert into payroll_employees
      (id, daycare_id, user_id, display_name, province, pay_type, rate_cents, pay_frequency, td1_federal_cents, td1_provincial_cents, hire_date)
    values
      ('e1', 'centre-a', 'staff-1', 'Amira Saleh', 'ON', 'hourly', 2400, 'biweekly', 0, 0, '2024-03-01'),
      ('e2', 'centre-a', 'staff-2', 'Leo Chen', 'ON', 'hourly', 2300, 'biweekly', 0, 0, null),
      ('b1', 'centre-b', 'staff-9', 'Other Centre', 'ON', 'hourly', 2500, 'biweekly', 0, 0, null);
    insert into payroll_punches (id, daycare_id, employee_id, clock_in_at, clock_out_at, unpaid_break_minutes, source, created_by)
    values ('p1', 'centre-a', 'e1', '2026-11-16T13:00:00Z', '2026-11-16T21:30:00Z', 30, 'phone', 'staff-1');
  `);
  const sql = { query: async (text, params) => (await db.query(text, params)).rows };
  return { db, sql };
}

const NOW = new Date("2026-11-22T12:00:00Z");
const desk = (sql, userId, extra = {}) => loadDesk(sql, { userId, daycareId: "centre-a", employeeId: "e1", from: "2026-11-15", to: "2026-11-28", now: NOW, ...extra });

test("only the owner or a named payroll editor can change hours, with a reason and a stale-edit guard", async () => {
  const { db, sql } = await setup();
  try {
    assert.deepEqual(await payAccess(sql, "owner-a", "centre-a"), { owner: true, editor: true });
    assert.deepEqual(await payAccess(sql, "staff-2", "centre-a"), { owner: false, editor: false });
    assert.equal((await loadPeople(sql, "owner-b", "centre-a")).length, 0);
    assert.deepEqual((await loadPeople(sql, "owner-a", "centre-a")).map((p) => p.name), ["Amira Saleh", "Leo Chen"]);

    const before = await desk(sql, "owner-a");
    const day = before.days.find((row) => row.date === "2026-11-16");
    assert.equal(day.minutes, 480);

    const base = { userId: "owner-a", daycareId: "centre-a", employeeId: "e1", field: "day_minutes", keyDate: "2026-11-16", oldValue: "480", newValue: "540", reason: "Stayed for a late pickup" };
    const denied = await saveOverride(sql, { ...base, id: "o0", userId: "staff-2", expectedId: "" });
    assert.deepEqual(denied, { ok: false, error: "permission" });
    const first = await saveOverride(sql, { ...base, id: "o1", expectedId: "" });
    assert.deepEqual(first, { ok: true, id: "o1", correction: false });
    // A second editor who still saw the old state is refused.
    const stale = await saveOverride(sql, { ...base, id: "o2", newValue: "500", expectedId: "" });
    assert.deepEqual(stale, { ok: false, error: "stale" });

    const after = await desk(sql, "owner-a");
    const changed = after.days.find((row) => row.date === "2026-11-16");
    assert.equal(changed.adjusted, true);
    assert.equal(changed.minutes, 540);
    assert.equal(changed.originalMinutes, 480);
    assert.equal(after.dayTokens["2026-11-16"], "o1");
    assert.deepEqual(
      after.history.map((row) => [row.oldValue, row.newValue, row.actorId, row.reason]),
      [["480", "540", "owner-a", "Stayed for a late pickup"]],
    );

    // Named payroll editor.
    await db.exec(`insert into payroll_editors (daycare_id, user_id, granted_by) values ('centre-a', 'staff-2', 'owner-a')`);
    const reset = await saveOverride(sql, { ...base, id: "o3", userId: "staff-2", oldValue: "540", newValue: "", reason: "Reset to check-in times", expectedId: "o1" });
    assert.equal(reset.ok, true);
    const back = await desk(sql, "owner-a");
    assert.equal(back.days.find((row) => row.date === "2026-11-16").adjusted, false);

    // Rate change for the period.
    const rate = await saveOverride(sql, { ...base, id: "r1", field: "rate_cents", keyDate: "2026-11-15", oldValue: "2400", newValue: "2500", reason: "Raise from Nov 15", expectedId: "" });
    assert.equal(rate.ok, true);
    assert.equal((await desk(sql, "owner-a")).rateOverride, 2_500);

    // Staff see their own hours and reasons, not the history of who changed them.
    const own = await desk(sql, "staff-1", { selfOnly: true });
    assert.equal(own.history.length, 0);
    assert.equal(await desk(sql, "staff-2", { selfOnly: true }), null);
  } finally {
    await db.close();
  }
});

test("staff flag only their own day, and nobody gets two open check-ins", async () => {
  const { db, sql } = await setup();
  try {
    assert.equal(await saveFlag(sql, { id: "f1", userId: "staff-2", daycareId: "centre-a", employeeId: "e1", workDate: "2026-11-16", note: "Not me" }), false);
    assert.equal(await saveFlag(sql, { id: "f2", userId: "staff-1", daycareId: "centre-a", employeeId: "e1", workDate: "2026-11-16", note: "I stayed late" }), true);
    assert.equal((await desk(sql, "owner-a")).days.find((row) => row.date === "2026-11-16").flagged, true);
    assert.equal(await checkIn(sql, { id: "c1", daycareId: "centre-a", employeeId: "e2", actorId: "staff-2" }), true);
    assert.equal(await checkIn(sql, { id: "c2", daycareId: "centre-a", employeeId: "e2", actorId: "staff-2" }), false);
  } finally {
    await db.close();
  }
});

test("a pay period is approved once by the owner, then later day changes are corrections", async () => {
  const { db, sql } = await setup();
  try {
    const stub = { id: "s1", periodId: "per1", personId: "e1", name: "Amira Saleh", payDate: "2026-11-27", grossCents: 100 };
    const input = { periodId: "per1", userId: "owner-a", daycareId: "centre-a", start: "2026-11-15", end: "2026-11-28", payDate: "2026-12-04", stubs: [stub], drafts: [{ id: "d1", employeeId: "e2", feeCents: 150000, salesTaxCents: 0 }] };
    assert.deepEqual(await approvePeriod(sql, { ...input, userId: "staff-2", periodId: "x" }), { ok: false, error: "permission" });
    assert.deepEqual(await approvePeriod(sql, input), { ok: true, stubs: 1 });
    assert.deepEqual(await approvePeriod(sql, { ...input, periodId: "per2" }), { ok: false, error: "already_approved" });
    const drafts = (await db.query("select status from payroll_contractor_drafts")).rows;
    assert.deepEqual(drafts, [{ status: "draft" }]);
    const change = await saveOverride(sql, { id: "o9", userId: "owner-a", daycareId: "centre-a", employeeId: "e1", field: "day_minutes", keyDate: "2026-11-16", oldValue: "480", newValue: "420", reason: "Left early", expectedId: "" });
    assert.deepEqual(change, { ok: true, id: "o9", correction: true });
    assert.equal((await loadStubs(sql, { userId: "owner-a", daycareId: "centre-a", from: "2026-01-01", to: "2026-12-31" })).length, 1);
    assert.equal((await loadStubs(sql, { userId: "owner-b", daycareId: "centre-a", from: "2026-01-01", to: "2026-12-31" })).length, 0);
  } finally {
    await db.close();
  }
});

test("the owner gives and removes pay access with an audit row, and an editor can do everything, including approve", async () => {
  const { db, sql } = await setup();
  try {
    assert.equal(await setEditor(sql, { id: "a0", userId: "staff-1", daycareId: "centre-a", memberId: "staff-2", grant: true }), false);
    assert.equal(await setEditor(sql, { id: "a1", userId: "owner-a", daycareId: "centre-a", memberId: "stranger", grant: true }), false);
    assert.equal(await setEditor(sql, { id: "a2", userId: "owner-a", daycareId: "centre-a", memberId: "staff-2", grant: true }), true);
    assert.deepEqual((await listEditors(sql, "owner-a", "centre-a")).map((row) => [row.name, row.editor]), [["Amira Saleh", false], ["Leo Chen", true]]);
    assert.deepEqual(await listEditors(sql, "staff-2", "centre-a"), []);
    assert.deepEqual(await payAccess(sql, "staff-2", "centre-a"), { owner: false, editor: true });

    // The editor changes the bonus and marks a student, then approves.
    const bonus = await saveOverride(sql, { id: "b1", userId: "staff-2", daycareId: "centre-a", employeeId: "e1", field: "bonus_cents", keyDate: "2026-11-15", oldValue: "0", newValue: "50000", reason: "Bonus", expectedId: "" });
    assert.equal(bonus.ok, true);
    assert.equal((await desk(sql, "staff-2")).bonusOverride, 50_000);
    assert.equal(await setWageClass(sql, { id: "w1", userId: "staff-2", daycareId: "centre-a", employeeId: "e1", wageClass: "student", reason: "Marked as a student", today: "2026-11-22" }), true);
    assert.equal((await desk(sql, "owner-a")).person.wageClass, "student");
    assert.equal(await setWageClass(sql, { id: "w2", userId: "staff-1", daycareId: "centre-a", employeeId: "e1", wageClass: "general", reason: "x", today: "2026-11-22" }), false);
    const approved = await approvePeriod(sql, { periodId: "per9", userId: "staff-2", daycareId: "centre-a", start: "2026-11-15", end: "2026-11-28", payDate: "2026-12-04", stubs: [], drafts: [] });
    assert.deepEqual(approved, { ok: true, stubs: 0 });
    assert.deepEqual((await db.query("select approved_by from payroll_periods where id = 'per9'")).rows, [{ approved_by: "staff-2" }]);
    assert.equal((await loadStubs(sql, { userId: "staff-2", daycareId: "centre-a", from: "2026-01-01", to: "2026-12-31" })).length, 0);

    assert.equal(await setEditor(sql, { id: "a3", userId: "owner-a", daycareId: "centre-a", memberId: "staff-2", grant: false }), true);
    assert.deepEqual(await payAccess(sql, "staff-2", "centre-a"), { owner: false, editor: false });
    const audit = (await db.query("select user_id, action, actor_id from payroll_editor_audits order by created_at, id")).rows;
    assert.deepEqual(audit, [
      { user_id: "staff-2", action: "grant", actor_id: "owner-a" },
      { user_id: "staff-2", action: "remove", actor_id: "owner-a" },
    ]);
    const changes = (await db.query("select field, actor_id from payroll_overrides order by created_at, id")).rows;
    assert.deepEqual(changes.map((row) => row.actor_id), ["staff-2", "staff-2"]);
  } finally {
    await db.close();
  }
});
