// Staff tax forms, corrections, and centre settings (pure parts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { claimFromAnswers, engineClaim, parseContact, parseTaxAnswers, provincialKind, readTaxAnswers, taxFormPdfLines, taxFormsFor, td1Status } from "../src/lib/payroll/tax-forms.ts";
import { buildPayCard } from "../src/lib/payroll/pay-card.ts";
import { stubFromCard } from "../src/lib/payroll/stubs.ts";
import { packFiles } from "../src/lib/payroll/accountant-pack.ts";
import { checkWords } from "../src/lib/payroll/payday-copy.ts";

test("tax forms per province: TD1 federal plus the province's TD1, or TP-1015.3 in Quebec", () => {
  assert.deepEqual(taxFormsFor("ON").map((card) => card.officialName), ["TD1", "TD1ON"]);
  assert.deepEqual(taxFormsFor("QC").map((card) => card.officialName), ["TD1", "TP-1015.3-V"]);
  assert.equal(provincialKind("QC"), "tp1015");
  assert.equal(provincialKind("bc"), "td1_provincial");
  for (const card of taxFormsFor("NU")) assert.match(card.officialUrl, /^https:\/\//);
});

test("answers are checked: a choice, an amount when claiming, a typed name, and the confirm box", () => {
  assert.equal(parseTaxAnswers({ mode: "x", signedName: "Amira Saleh", certified: true }).ok, false);
  assert.deepEqual(parseTaxAnswers({ mode: "claim", claimDollars: "", signedName: "Amira Saleh", certified: true }), { ok: false, error: "amount" });
  assert.deepEqual(parseTaxAnswers({ mode: "claim", claimDollars: "999999", signedName: "Amira Saleh", certified: true }), { ok: false, error: "amount" });
  assert.deepEqual(parseTaxAnswers({ mode: "basic", signedName: "A", certified: true }), { ok: false, error: "signature" });
  assert.deepEqual(parseTaxAnswers({ mode: "basic", signedName: "Amira Saleh", certified: false }), { ok: false, error: "certify" });
  const ok = parseTaxAnswers({ mode: "claim", claimDollars: "18 452,50", signedName: " Amira   Saleh ", certified: true });
  assert.equal(ok.ok, true);
  assert.equal(ok.answers.claimCents, 1_845_250);
  assert.equal(ok.answers.signedName, "Amira Saleh");
  assert.deepEqual(readTaxAnswers(JSON.stringify(ok.answers)), ok.answers);
  assert.equal(readTaxAnswers("not json"), null);
  assert.equal(parseContact({ contactName: "Sam", contactPhone: "613-555-0100" }).ok, true);
  assert.equal(parseContact({ contactName: "Sam", contactPhone: "555" }).ok, false);
});

test("approved claims feed the engine; until then the basic personal amounts are used", () => {
  assert.deepEqual(claimFromAnswers({ mode: "basic", claimCents: null, signedName: "A B", certified: true }), { state: "basic", cents: 0 });
  assert.deepEqual(claimFromAnswers({ mode: "zero", claimCents: null, signedName: "A B", certified: true }), { state: "zero", cents: 0 });
  assert.equal(engineClaim("basic", 0), null);
  assert.equal(engineClaim("missing", 500_000), null);
  assert.equal(engineClaim("claim", 2_000_000), 2_000_000);
  assert.equal(engineClaim("zero", 0), 0);
  assert.equal(td1Status("basic", "missing"), "pending");
  assert.equal(td1Status("claim", "zero"), "approved");
  assert.equal(td1Status("missing", "missing"), "missing");
  assert.match(checkWords("missing_td1", "en"), /TD1 not on file/);
  assert.match(checkWords("missing_td1", "fr"), /TD1 non reçu/);

  const base = { id: "e1", name: "Amira Saleh", province: "ON", payType: "salary", rateCents: 5_200_000, frequency: "biweekly", vacationBps: 0, vacationMode: "payout" };
  const period = { start: "2026-11-08", end: "2026-11-21", payDate: "2026-11-27" };
  const missing = buildPayCard({ person: { ...base, td1: "missing" }, period, days: [] });
  const zero = buildPayCard({ person: { ...base, td1: "approved", td1FederalCents: 0, td1ProvincialCents: 0 }, period, days: [] });
  assert.ok(missing.checks.some((check) => check.code === "missing_td1"));
  assert.ok(!zero.checks.some((check) => check.code === "missing_td1"));
  assert.ok(zero.employee.federalTaxCents > missing.employee.federalTaxCents);
  assert.ok(zero.employee.provincialTaxCents > missing.employee.provincialTaxCents);
});

test("an approved tax form prints with its official link and no bank or SIN numbers", () => {
  const [card] = taxFormsFor("ON");
  const lines = taxFormPdfLines({ locale: "fr", centre: "Les Petits Pas", person: "Amira Saleh", card, version: 2, savedOn: "2026-11-20", approvedOn: "2026-11-21", answers: { mode: "basic", claimCents: null, signedName: "Amira Saleh", certified: true } });
  assert.ok(lines.includes("Montant personnel de base seulement"));
  assert.ok(lines.some((line) => line.includes(card.officialUrl)));
  assert.ok(lines.some((line) => /Approuvé le: 2026-11-21/.test(line)));
  assert.doesNotMatch(lines.join("\n"), /\d{7,}/);
});

const person = { id: "e1", name: "Amira Saleh", province: "ON", payType: "hourly", rateCents: 2_400, frequency: "biweekly", vacationBps: 400, vacationMode: "payout", hireDate: "2024-03-01", td1: "approved" };
const period = { start: "2026-11-22", end: "2026-12-05", payDate: "2026-12-11" };
const days = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"].map((date) => ({ date, checkIn: null, checkOut: null, autoMinutes: 480, minutes: 480, adjusted: false, originalMinutes: null, reason: null, adjustedBy: null, adjustedAt: null, missedCheckout: false, flagged: false, flagNote: null, locked: false }));

test("a correction to an approved period is a separate line in the next pay, with tax worked out again", () => {
  const plain = buildPayCard({ person, period, days });
  const correction = { cents: 2_400, forPeriodId: "p1", forPeriodStart: "2026-11-08", forPeriodEnd: "2026-11-21", date: "2026-11-16", deltaMinutes: 60, rateCents: 2_400 };
  const card = buildPayCard({ person, period, days, corrections: [correction] });
  assert.equal(card.correctionCents, 2_400);
  assert.equal(card.correctionLines.length, 1);
  // Vacation pay (4%) applies to the correction too: 2,400 + 96.
  assert.equal(card.grossCents, plain.grossCents + 2_496);
  assert.ok(card.employee.federalTaxCents + card.employee.provincialTaxCents > plain.employee.federalTaxCents + plain.employee.provincialTaxCents);
  const stub = stubFromCard({ id: "s", periodId: "p2", periodStart: period.start, periodEnd: period.end, payDate: period.payDate, province: "ON", card });
  assert.equal(stub.correctionFor, "2026-11-08 to 2026-11-21");
  const register = packFiles({ stubs: [stub], remitter: "regular", year: 2026 })["pay-register.csv"];
  assert.match(register.split("\r\n")[0], /,correction,correction_for,/);
  assert.match(register, /,24\.00,2026-11-08 to 2026-11-21,/);
  // Taking hours away is a negative correction.
  const less = buildPayCard({ person, period, days, corrections: [{ ...correction, cents: -1_200, deltaMinutes: -30 }] });
  assert.ok(less.grossCents < plain.grossCents);
});

test("employer health tax, Quebec CNT, and WCB show once set, and say 'not set' until then", () => {
  const unset = buildPayCard({ person, period, days });
  assert.equal(unset.employerExtras.healthTax, null);
  assert.equal(unset.employerExtras.wcb, null);
  assert.equal(unset.employerExtras.cnt, "none");
  const set = buildPayCard({ person, period, days, settings: { wcbRateBps: 125, yearlyPayrollCents: 120_000_000, healthTaxExemption: true } });
  // $1.2M payroll: EHT $3,900 a year; this pay's share = 3,900 x gross / 1,200,000.
  assert.equal(set.employerExtras.healthTax.code, "on_eht");
  assert.equal(set.employerExtras.healthTax.cents, Math.round((390_000 * set.grossCents) / 120_000_000));
  assert.equal(set.employerExtras.wcb.cents, Math.round((set.grossCents * 125) / 10_000));
  const stub = stubFromCard({ id: "s", periodId: "p", periodStart: period.start, periodEnd: period.end, payDate: period.payDate, province: "ON", card: set });
  assert.equal(stub.employerOtherCents, stub.healthTaxCents + stub.cntCents + stub.wcbCents);
  const sk = buildPayCard({ person: { ...person, province: "SK" }, period, days });
  assert.equal(sk.employerExtras.healthTax, "none");
  const qc = buildPayCard({ person: { ...person, province: "QC" }, period, days, settings: { wcbRateBps: null, yearlyPayrollCents: 50_000_000, healthTaxExemption: true } });
  assert.equal(qc.employerExtras.cnt, Math.round(qc.grossCents * 0.0006));
  assert.equal(qc.employerExtras.healthTax.code, "qc_hsf");
  assert.equal(qc.employerExtras.wcb, null);
});

test("migration 0229 is additive, has a down file, and the bank reveal needs a fresh sign-in", async () => {
  const { readFileSync } = await import("node:fs");
  const up = readFileSync(new URL("../migrations/0229_payroll_forms_corrections.sql", import.meta.url), "utf8");
  assert.doesNotMatch(up, /\bdrop\b|\btruncate\b|\bdelete\b/i);
  const down = readFileSync(new URL("../migrations/down/0229_payroll_forms_corrections.sql", import.meta.url), "utf8");
  assert.match(down, /drop table if exists payroll_bank_reveals/);
  const server = readFileSync(new URL("../src/lib/server/payroll-forms.ts", import.meta.url), "utf8");
  assert.match(server, /assertRecentReauth\(context\.userId\)/);
  assert.match(server, /providerPayrollEnabled/);
  const store = readFileSync(new URL("../src/lib/payroll/forms-store.ts", import.meta.url), "utf8");
  assert.match(store, /insert into payroll_bank_reveals/);
});
