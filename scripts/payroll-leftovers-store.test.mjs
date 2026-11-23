// Forms, bank reveals, corrections, and settings on an in-memory Postgres (PGlite). Synthetic data only.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { approveForm, myForms, readForm, revealBank, reviewForms, submitForm } from "../src/lib/payroll/forms-store.ts";
import { approvePeriod, loadCorrections, loadDesk, loadPeople, loadSettings, saveOverride, saveSettings } from "../src/lib/payroll/pay-store.ts";
import { claimFromAnswers, parseTaxAnswers } from "../src/lib/payroll/tax-forms.ts";

async function setup({ withLeftovers = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create table daycares (id text primary key, name text not null);
    create table provider_daycares (user_id text, daycare_id text, primary key (user_id, daycare_id));
    insert into daycares values ('centre-a', 'Oak'), ('centre-b', 'Birch');
    insert into provider_daycares values ('owner-a', 'centre-a'), ('owner-b', 'centre-b');
  `);
  const files = ["0225_provider_payroll", "0226_extra_tax_requests", "0227_employee_forms", "0228_payroll_pay_runs"];
  if (withLeftovers) files.push("0229_payroll_forms_corrections");
  for (const file of files) await db.exec(await readFile(new URL(`../migrations/${file}.sql`, import.meta.url), "utf8"));
  await db.exec(`
    insert into payroll_employees
      (id, daycare_id, user_id, display_name, province, pay_type, rate_cents, pay_frequency, td1_federal_cents, td1_provincial_cents)
    values
      ('e1', 'centre-a', 'staff-1', 'Amira Saleh', 'ON', 'hourly', 2400, 'biweekly', 0, 0),
      ('e2', 'centre-a', 'staff-2', 'Leo Chen', 'QC', 'hourly', 2300, 'biweekly', 0, 0);
    insert into payroll_editors (daycare_id, user_id, granted_by) values ('centre-a', 'staff-2', 'owner-a');
    insert into payroll_punches (id, daycare_id, employee_id, clock_in_at, clock_out_at, unpaid_break_minutes, source, created_by)
    values ('p1', 'centre-a', 'e1', '2026-11-16T13:00:00Z', '2026-11-16T21:30:00Z', 30, 'phone', 'staff-1');
  `);
  const sql = { query: async (text, params) => (await db.query(text, params)).rows };
  return { db, sql };
}

const answers = (mode, claimDollars = "") => {
  const parsed = parseTaxAnswers({ mode, claimDollars, signedName: "Amira Saleh", certified: true });
  assert.equal(parsed.ok, true);
  return parsed.answers;
};

test("staff send their own TD1s, the owner or an editor approves, and the claim reaches the pay record", async () => {
  const { db, sql } = await setup();
  try {
    const save = (userId, kind, value) =>
      submitForm(sql, { id: `${kind}-${userId}-${Math.random()}`, userId, daycareId: "centre-a", kind, answersJson: JSON.stringify(value), bankCipher: null, bankLast4: null, savedOn: "2026-11-20" });
    assert.equal(await save("owner-b", "td1_federal", answers("basic")), null);
    const fed = await save("staff-1", "td1_federal", answers("claim", "20000"));
    assert.equal(fed.version, 1);
    const again = await save("staff-1", "td1_federal", answers("claim", "21000"));
    assert.equal(again.version, 2);
    const prov = await save("staff-1", "td1_provincial", answers("zero"));
    assert.deepEqual((await myForms(sql, "staff-1", "centre-a")).forms.map((f) => [f.kind, f.version]).sort(), [["td1_federal", 2], ["td1_provincial", 1]]);
    assert.equal(await myForms(sql, "owner-b", "centre-a"), null);

    // Not approved yet: pay uses the basic personal amounts.
    let [person] = await loadPeople(sql, "owner-a", "centre-a");
    assert.equal(person.td1, "missing");
    assert.equal(person.td1FederalCents, null);

    const approve = async (userId, form) => {
      const row = await readForm(sql, userId, "centre-a", form.id);
      const claim = claimFromAnswers(row.tax);
      return approveForm(sql, { userId, daycareId: "centre-a", formId: form.id, claimState: claim.state, claimCents: claim.cents });
    };
    assert.equal(await approve("owner-b", again).catch(() => false), false);
    assert.equal(await approve("owner-a", again), true);
    assert.equal(await approve("owner-a", again), false);
    [person] = await loadPeople(sql, "owner-a", "centre-a");
    assert.equal(person.td1, "pending");
    assert.equal(person.td1FederalCents, 2_100_000);
    assert.equal(person.td1ProvincialCents, null);
    // A payroll editor can approve too.
    assert.equal(await approve("staff-2", prov), true);
    [person] = await loadPeople(sql, "owner-a", "centre-a");
    assert.equal(person.td1, "approved");
    assert.equal(person.td1ProvincialCents, 0);
    const status = (await db.query("select td1_status, td1_federal_state, td1_provincial_state from payroll_employees where id = 'e1'")).rows[0];
    assert.deepEqual(status, { td1_status: "approved", td1_federal_state: "claim", td1_provincial_state: "zero" });
    assert.equal((await reviewForms(sql, "staff-1", "centre-a")).length, 0);
    assert.equal((await reviewForms(sql, "owner-a", "centre-a")).length, 3);
  } finally {
    await db.close();
  }
});

test("only the owner can open a bank number, and every reveal is logged", async () => {
  const { db, sql } = await setup();
  try {
    const dep = await submitForm(sql, { id: "dep1", userId: "staff-1", daycareId: "centre-a", kind: "deposit", answersJson: "{}", bankCipher: "kebank1:synthetic", bankLast4: "6789", savedOn: "2026-11-20" });
    assert.equal(dep.id, "dep1");
    assert.equal((await myForms(sql, "staff-1", "centre-a")).forms[0].bankLast4, "6789");
    assert.equal(JSON.stringify(await myForms(sql, "staff-1", "centre-a")).includes("kebank1"), false);
    assert.equal(await revealBank(sql, { id: "r0", userId: "staff-2", daycareId: "centre-a", formId: "dep1" }), null);
    assert.equal(await revealBank(sql, { id: "r1", userId: "owner-b", daycareId: "centre-a", formId: "dep1" }), null);
    assert.equal(await revealBank(sql, { id: "r2", userId: "owner-a", daycareId: "centre-a", formId: "dep1" }), "kebank1:synthetic");
    const log = (await db.query("select actor_id, form_id, employee_id from payroll_bank_reveals")).rows;
    assert.deepEqual(log, [{ actor_id: "owner-a", form_id: "dep1", employee_id: "e1" }]);
  } finally {
    await db.close();
  }
});

test("a change to an approved day is carried once into the next pay as a correction", async () => {
  const { db, sql } = await setup();
  try {
    const first = await approvePeriod(sql, {
      periodId: "per1", userId: "owner-a", daycareId: "centre-a", start: "2026-11-15", end: "2026-11-28", payDate: "2026-12-04",
      stubs: [], drafts: [], paidDays: [{ employeeId: "e1", date: "2026-11-16", minutes: 480, rateCents: 2_400 }], corrections: [],
    });
    assert.deepEqual(first, { ok: true, stubs: 0 });
    const now = new Date("2026-12-01T12:00:00Z");
    assert.deepEqual(await loadCorrections(sql, { daycareId: "centre-a", employeeId: "e1", now }), []);
    const change = await saveOverride(sql, { id: "o1", userId: "owner-a", daycareId: "centre-a", employeeId: "e1", field: "day_minutes", keyDate: "2026-11-16", oldValue: "480", newValue: "540", reason: "Stayed late", expectedId: "" });
    assert.equal(change.correction, true);
    const pending = await loadCorrections(sql, { daycareId: "centre-a", employeeId: "e1", now });
    assert.deepEqual(pending.map((line) => [line.forPeriodId, line.forPeriodStart, line.date, line.deltaMinutes, line.cents]), [["per1", "2026-11-15", "2026-11-16", 60, 2_400]]);
    const desk = await loadDesk(sql, { userId: "owner-a", daycareId: "centre-a", employeeId: "e1", from: "2026-11-29", to: "2026-12-12", now });
    assert.equal(desk.corrections.length, 1);
    const second = await approvePeriod(sql, {
      periodId: "per2", userId: "owner-a", daycareId: "centre-a", start: "2026-11-29", end: "2026-12-12", payDate: "2026-12-18",
      stubs: [], drafts: [], paidDays: [],
      corrections: pending.map((line, index) => ({ id: `c${index}`, employeeId: "e1", ...line })),
    });
    assert.equal(second.ok, true);
    assert.deepEqual(await loadCorrections(sql, { daycareId: "centre-a", employeeId: "e1", now }), []);
    const lines = (await db.query("select period_id, for_period_id, delta_minutes, cents from payroll_correction_lines")).rows;
    assert.deepEqual(lines, [{ period_id: "per2", for_period_id: "per1", delta_minutes: 60, cents: 2_400 }]);
  } finally {
    await db.close();
  }
});

test("before migration 0229 is applied, pay and approval keep working and corrections stay off", async () => {
  const { db, sql } = await setup({ withLeftovers: false });
  try {
    const [person] = await loadPeople(sql, "owner-a", "centre-a");
    assert.equal(person.td1, "missing");
    const ok = await approvePeriod(sql, { periodId: "x1", userId: "owner-a", daycareId: "centre-a", start: "2026-11-15", end: "2026-11-28", payDate: "2026-12-04", stubs: [], drafts: [], paidDays: [{ employeeId: "e1", date: "2026-11-16", minutes: 480, rateCents: 2_400 }] });
    assert.deepEqual(ok, { ok: true, stubs: 0 });
    assert.deepEqual(await loadCorrections(sql, { daycareId: "centre-a", employeeId: "e1", now: new Date() }), []);
  } finally {
    await db.close();
  }
});

test("centre settings: unset until saved, owner or editor can save, others cannot", async () => {
  const { db, sql } = await setup();
  try {
    assert.equal((await loadSettings(sql, "owner-a", "centre-a")).set, false);
    assert.equal(await saveSettings(sql, "owner-b", "centre-a", { remitterType: "quarterly", wcbRateBps: 125, yearlyPayrollCents: 100, healthTaxExemption: true }), false);
    assert.equal(await saveSettings(sql, "staff-2", "centre-a", { remitterType: "quarterly", wcbRateBps: 125, yearlyPayrollCents: null, healthTaxExemption: false }), true);
    assert.deepEqual(await loadSettings(sql, "owner-a", "centre-a"), { remitterType: "quarterly", wcbRateBps: 125, yearlyPayrollCents: null, healthTaxExemption: false, set: true });
    assert.equal((await loadSettings(sql, "owner-b", "centre-a")).set, false);
  } finally {
    await db.close();
  }
});
