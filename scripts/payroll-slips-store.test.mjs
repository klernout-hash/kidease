// Slip details and slip downloads on an in-memory Postgres (PGlite). Synthetic data only.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { approveForm, submitForm } from "../src/lib/payroll/forms-store.ts";
import { EMPTY_EMPLOYER, loadSlipEmployer, loadSlipPeople, logSlipExport, saveSlipEmployer } from "../src/lib/payroll/slips-store.ts";

async function setup(withSlips = true) {
  const db = new PGlite();
  await db.exec(`
    create table daycares (id text primary key, name text not null);
    create table provider_daycares (user_id text, daycare_id text, primary key (user_id, daycare_id));
    insert into daycares values ('centre-a', 'Oak');
    insert into provider_daycares values ('owner-a', 'centre-a'), ('owner-b', 'centre-b');
  `);
  const files = ["0225_provider_payroll", "0226_extra_tax_requests", "0227_employee_forms", "0228_payroll_pay_runs", "0229_payroll_forms_corrections"];
  if (withSlips) files.push("0230_payroll_slip_xml");
  for (const file of files) await db.exec(await readFile(new URL(`../migrations/${file}.sql`, import.meta.url), "utf8"));
  await db.exec(`
    insert into payroll_employees (id, daycare_id, user_id, display_name, province, pay_type, rate_cents, pay_frequency, td1_federal_cents, td1_provincial_cents)
    values ('e1', 'centre-a', 'staff-1', 'Amira S.', 'ON', 'hourly', 2400, 'biweekly', 0, 0), ('e2', 'centre-a', 'staff-2', 'Leo C.', 'ON', 'hourly', 2300, 'biweekly', 0, 0);
    insert into payroll_editors (daycare_id, user_id, granted_by) values ('centre-a', 'staff-2', 'owner-a');
  `);
  return { db, sql: { query: async (text, params) => (await db.query(text, params)).rows } };
}

test("employer slip details: editor or owner saves, others cannot; SIN details only reach the owner once approved", async () => {
  const { db, sql } = await setup();
  try {
    const employer = { ...EMPTY_EMPLOYER, name: "Oak Child Care", businessNumber: "123456789RP0001", dentalCode: "1" };
    assert.equal(await saveSlipEmployer(sql, "owner-b", "centre-a", employer), false);
    assert.equal(await saveSlipEmployer(sql, "staff-2", "centre-a", employer), true);
    assert.equal((await loadSlipEmployer(sql, "owner-a", "centre-a")).businessNumber, "123456789RP0001");
    assert.deepEqual(await loadSlipEmployer(sql, "staff-1", "centre-a"), EMPTY_EMPLOYER);

    await submitForm(sql, { id: "s1", userId: "staff-1", daycareId: "centre-a", kind: "slip_info", answersJson: JSON.stringify({ firstName: "Amira", lastName: "Saleh" }), bankCipher: "kebank1:sealed", bankLast4: "003", savedOn: "2026-11-20" });
    let rows = await loadSlipPeople(sql, "owner-a", "centre-a");
    assert.equal(rows.find((r) => r.personId === "e1").sinCipher, null);
    assert.equal(await approveForm(sql, { userId: "owner-a", daycareId: "centre-a", formId: "s1", claimState: null, claimCents: 0 }), true);
    rows = await loadSlipPeople(sql, "owner-a", "centre-a");
    assert.equal(rows.find((r) => r.personId === "e1").sinCipher, "kebank1:sealed");
    assert.equal(rows.find((r) => r.personId === "e2").sinCipher, null);
    assert.deepEqual(await loadSlipPeople(sql, "staff-2", "centre-a"), []);

    assert.equal(await logSlipExport(sql, { id: "x1", userId: "staff-2", daycareId: "centre-a", year: 2026, kinds: "t4", people: 1 }), false);
    assert.equal(await logSlipExport(sql, { id: "x2", userId: "owner-a", daycareId: "centre-a", year: 2026, kinds: "t4,t4a", people: 2 }), true);
    assert.deepEqual((await db.query("select actor_id, tax_year, kinds from payroll_slip_exports")).rows, [{ actor_id: "owner-a", tax_year: 2026, kinds: "t4,t4a" }]);
  } finally {
    await db.close();
  }
});

test("before migration 0230, slip details read as empty and cannot be saved", async () => {
  const { db, sql } = await setup(false);
  try {
    assert.deepEqual(await loadSlipEmployer(sql, "owner-a", "centre-a"), EMPTY_EMPLOYER);
    assert.equal(await saveSlipEmployer(sql, "owner-a", "centre-a", EMPTY_EMPLOYER), false);
  } finally {
    await db.close();
  }
});
