import assert from "node:assert/strict";
import { test } from "node:test";
import { minimumVacationBps, minimumWageCents, holidayPayCents, PAY_RULES, splitOvertime, unverifiedRules, yearsOfService } from "../src/lib/payroll/pay-rules.ts";
import { cntCents, employerCosts, yearlyHealthTaxCents } from "../src/lib/payroll/employer-costs.ts";
import { contractorPay, validGstNumber } from "../src/lib/payroll/contractor.ts";
import { correctionLines, dayRows, parseHours, planAdjust, planFlag, planReset, staffDayView, totalMinutes } from "../src/lib/payroll/hours-adjust.ts";
import { buildPayCard, canApprove, searchPeople, SEARCHABLE_AFTER } from "../src/lib/payroll/pay-card.ts";
import { parseStub, stubFromCard } from "../src/lib/payroll/stubs.ts";
import { rl1Slips, t4aSlips, t4Slips } from "../src/lib/payroll/year-end.ts";
import { csvCell, packFiles, packJson, packPdfLines, remittanceSummary, xeroJournalCsv } from "../src/lib/payroll/accountant-pack.ts";
import { PROVINCE_CODES } from "../src/lib/payroll/tables.ts";

const NOW = new Date("2026-11-20T20:00:00Z");

test("every province has all four pay rules, each with an official link and as-of date", () => {
  for (const code of PROVINCE_CODES) {
    for (const key of ["vacation", "overtime", "holiday", "minimumWage"]) {
      const rule = PAY_RULES[code][key];
      assert.match(rule.source, /^https:\/\//, `${code} ${key}`);
      assert.equal(rule.asOf, "2026-11-22");
      if (!rule.verified) assert.equal(rule.value, null, `${code} ${key} must not carry a number`);
    }
  }
  assert.ok(unverifiedRules().length > 0);
});

test("vacation pay follows years of service where verified, and stays empty where not", () => {
  assert.equal(yearsOfService("2021-11-21", "2026-11-20"), 4);
  assert.equal(yearsOfService("2021-11-20", "2026-11-20"), 5);
  assert.equal(minimumVacationBps("ON", "2024-01-01", "2026-11-20"), 400);
  assert.equal(minimumVacationBps("ON", "2019-01-01", "2026-11-20"), 600);
  assert.equal(minimumVacationBps("BC", "2019-01-01", "2026-11-20"), 600);
  assert.equal(minimumVacationBps("SK", "2019-01-01", "2026-11-20"), null);
  assert.equal(minimumVacationBps("ON", null, "2026-11-20"), null);
});

test("minimum wage is only a number where the official page confirmed it", () => {
  assert.equal(minimumWageCents("BC", "2026-11-20"), 1_825);
  assert.equal(minimumWageCents("MB", "2026-11-20"), 1_640);
  assert.equal(minimumWageCents("MB", "2026-09-30"), null);
  assert.equal(minimumWageCents("NS", "2026-11-20"), 1_700);
  assert.equal(minimumWageCents("ON", "2026-11-20"), null);
});

test("overtime: Ontario weekly 44, Manitoba daily 8 and weekly 40, others not estimated", () => {
  const on = splitOvertime("ON", [{ date: "2026-11-16", minutes: 50 * 60 }]);
  assert.deepEqual([on.regularMinutes, on.overtimeMinutes, on.multiplier], [44 * 60, 6 * 60, 1.5]);
  const mb = splitOvertime("MB", [
    { date: "2026-11-16", minutes: 10 * 60 },
    { date: "2026-11-17", minutes: 8 * 60 },
    { date: "2026-11-18", minutes: 8 * 60 },
    { date: "2026-11-19", minutes: 8 * 60 },
    { date: "2026-11-20", minutes: 8 * 60 },
  ]);
  // 2 daily hours, then 40 regular hours left, so no weekly overtime.
  assert.deepEqual([mb.regularMinutes, mb.overtimeMinutes], [40 * 60, 2 * 60]);
  const sk = splitOvertime("SK", [{ date: "2026-11-16", minutes: 50 * 60 }]);
  assert.equal(sk.overtimeMinutes, 0);
  assert.equal(sk.verified, false);
});

test("Ontario public holiday pay is 4 weeks of wages and vacation pay divided by 20", () => {
  assert.equal(holidayPayCents("ON", 240_000, 0), 12_000);
  assert.equal(holidayPayCents("AB", 240_000, 0), null);
});

test("payroll health taxes use each province's thresholds", () => {
  assert.equal(yearlyHealthTaxCents({ province: "ON", payrollCents: 90_000_000 }).cents, 0);
  // $1.2M Ontario payroll: 1.95% on $200,000 above the exemption = $3,900.
  assert.equal(yearlyHealthTaxCents({ province: "ON", payrollCents: 120_000_000 }).cents, 390_000);
  assert.equal(yearlyHealthTaxCents({ province: "ON", payrollCents: 120_000_000, exemptionEligible: false }).cents, 2_340_000);
  assert.equal(yearlyHealthTaxCents({ province: "BC", payrollCents: 120_000_000 }).cents, 1_170_000);
  assert.equal(yearlyHealthTaxCents({ province: "BC", payrollCents: 200_000_000 }).cents, 3_900_000);
  assert.equal(yearlyHealthTaxCents({ province: "MB", payrollCents: 300_000_000 }).cents, 2_150_000);
  assert.equal(yearlyHealthTaxCents({ province: "NL", payrollCents: 250_000_000 }).cents, 1_000_000);
  assert.equal(yearlyHealthTaxCents({ province: "QC", payrollCents: 50_000_000 }).cents, 825_000);
  assert.equal(yearlyHealthTaxCents({ province: "SK", payrollCents: 500_000_000 }).cents, 0);
  assert.equal(cntCents(500_000, 10_000_000), 180);
});

test("employer costs list CPP, EI, the health tax share, and the owner's WCB rate", () => {
  const out = employerCosts({
    province: "ON",
    grossCents: 200_000,
    employerCppCents: 11_000,
    employerCpp2Cents: 0,
    employerEiCents: 4_564,
    employerQpipCents: 0,
    wcbRateBps: 125,
    yearlyPayrollCents: 120_000_000,
  });
  const codes = out.lines.map((line) => line.code);
  assert.ok(codes.includes("on_eht"));
  assert.equal(out.lines.find((line) => line.code === "wcb").cents, 2_500);
  assert.equal(out.lines.find((line) => line.code === "on_eht").estimate, true);
  const none = employerCosts({ province: "QC", grossCents: 100_000, employerCppCents: 0, employerCpp2Cents: 0, employerEiCents: 0, employerQpipCents: 0 });
  assert.ok(none.lines.some((line) => line.code === "qc_cnt"));
  assert.ok(none.notes.some((note) => /CNESST/.test(note)));
});

test("contractors get the agreed amount, no deductions, and GST/HST only if registered", () => {
  const flat = contractorPay({ basis: "flat", amountCents: 150_000, gstRegistered: false, province: "ON" });
  assert.equal(flat.totalCents, 150_000);
  assert.equal(flat.deductionsCents, 0);
  const hst = contractorPay({ basis: "base", amountCents: 100_000, extraCents: 20_000, gstRegistered: true, gstNumber: "123456789RT0001", province: "ON" });
  assert.equal(hst.feeCents, 120_000);
  assert.equal(hst.salesTaxCents, 15_600);
  assert.equal(hst.salesTaxKind, "HST");
  const ns = contractorPay({ basis: "flat", amountCents: 100_000, gstRegistered: true, province: "NS" });
  assert.equal(ns.salesTaxCents, 0);
  assert.equal(ns.salesTaxVerified, false);
  assert.equal(validGstNumber("123456789 RT 0001"), true);
  assert.equal(validGstNumber("12345"), false);
});

const punches = [
  { id: "p1", employeeId: "e1", clockIn: "2026-11-16T13:00:00Z", clockOut: "2026-11-16T21:30:00Z", unpaidBreakMinutes: 30 },
  { id: "p2", employeeId: "e1", clockIn: "2026-11-17T13:00:00Z", clockOut: null, unpaidBreakMinutes: 0 },
  { id: "p3", employeeId: "e2", clockIn: "2026-11-16T13:00:00Z", clockOut: "2026-11-16T17:00:00Z", unpaidBreakMinutes: 0 },
];

test("days show check-in hours, owner changes need a reason, show Adjusted, and write an audit row", () => {
  const rows = dayRows({ employeeId: "e1", from: "2026-11-16", to: "2026-11-17", punches, adjustments: [], now: NOW });
  assert.equal(rows[0].minutes, 480);
  assert.equal(rows[1].missedCheckout, true);
  const denied = planAdjust({ canEditPay: false, row: rows[1], employeeId: "e1", newMinutes: 480, reason: "Forgot to check out", actorId: "o1", now: NOW, id: "a1" });
  assert.equal(denied.ok, false);
  const noReason = planAdjust({ canEditPay: true, row: rows[1], employeeId: "e1", newMinutes: 480, reason: " ", actorId: "o1", now: NOW, id: "a1" });
  assert.equal(noReason.ok, false);
  const plan = planAdjust({ canEditPay: true, row: rows[1], employeeId: "e1", newMinutes: 480, reason: "Forgot to check out", actorId: "o1", now: NOW, id: "a1" });
  assert.equal(plan.ok, true);
  assert.deepEqual([plan.audit.oldMinutes, plan.audit.newMinutes, plan.audit.actorId, plan.audit.action], [0, 480, "o1", "adjust"]);
  const after = dayRows({ employeeId: "e1", from: "2026-11-16", to: "2026-11-17", punches, adjustments: [plan.adjustment], now: NOW });
  assert.equal(after[1].adjusted, true);
  assert.equal(after[1].minutes, 480);
  assert.equal(after[1].originalMinutes, 0);
  assert.equal(after[1].reason, "Forgot to check out");
  const staff = staffDayView(after[1]);
  assert.equal(staff.reason, "Forgot to check out");
  assert.equal("adjustedBy" in staff, false);
  assert.equal(totalMinutes(after), 960);
  // Reset to check-in times.
  const reset = planReset({ canEditPay: true, row: after[1], employeeId: "e1", actorId: "o1", now: new Date("2026-11-21T00:00:00Z"), id: "a2" });
  assert.equal(reset.ok, true);
  assert.equal(reset.audit.action, "reset");
  const back = dayRows({ employeeId: "e1", from: "2026-11-16", to: "2026-11-17", punches, adjustments: [plan.adjustment, reset.adjustment], now: NOW });
  assert.equal(back[1].adjusted, false);
  assert.equal(back[1].minutes, 0);
});

test("staff flag their own day, locked days turn changes into corrections, and hours parse", () => {
  const rows = dayRows({ employeeId: "e1", from: "2026-11-16", to: "2026-11-16", punches, adjustments: [], lockedThrough: "2026-11-16", now: NOW });
  assert.equal(rows[0].locked, true);
  assert.equal(planFlag({ samePerson: false, row: rows[0], employeeId: "e1", note: "Wrong", actorId: "x", now: NOW, id: "f1" }).ok, false);
  const flag = planFlag({ samePerson: true, row: rows[0], employeeId: "e1", note: "I stayed late", actorId: "u1", now: NOW, id: "f1" });
  assert.equal(flag.ok, true);
  const flagged = dayRows({ employeeId: "e1", from: "2026-11-16", to: "2026-11-16", punches, adjustments: [], flags: [flag.flag], now: NOW });
  assert.equal(flagged[0].flagged, true);
  const change = planAdjust({ canEditPay: true, row: rows[0], employeeId: "e1", newMinutes: 540, reason: "Stayed late for a parent", actorId: "o1", now: NOW, id: "a3" });
  assert.equal(change.correction, true);
  const now = dayRows({ employeeId: "e1", from: "2026-11-16", to: "2026-11-16", punches, adjustments: [change.adjustment], now: NOW });
  assert.deepEqual(correctionLines({ paid: [{ date: "2026-11-16", minutes: 480, rateCents: 2_400 }], now }), [{ date: "2026-11-16", deltaMinutes: 60, cents: 2_400 }]);
  assert.equal(parseHours("7.5"), 450);
  assert.equal(parseHours("7:30"), 450);
  assert.equal(parseHours("7h30"), 450);
  assert.equal(parseHours("25"), null);
  assert.equal(parseHours("abc"), null);
});

const person = {
  id: "e1",
  name: "Amira Saleh",
  province: "ON",
  payType: "hourly",
  rateCents: 2_400,
  frequency: "biweekly",
  vacationBps: 400,
  vacationMode: "payout",
  hireDate: "2024-03-01",
  td1: "approved",
};
const period = { start: "2026-11-08", end: "2026-11-21", payDate: "2026-11-27" };

function fullDays(minutesPerDay) {
  const rows = [];
  for (const date of ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]) {
    rows.push({ date, checkIn: null, checkOut: null, autoMinutes: minutesPerDay, minutes: minutesPerDay, adjusted: false, originalMinutes: null, reason: null, adjustedBy: null, adjustedAt: null, missedCheckout: false, flagged: false, flagNote: null, locked: false });
  }
  return rows;
}

test("the pay card uses check-in hours, recalculates when hours, rate, or pay type change", () => {
  const card = buildPayCard({ person, period, days: fullDays(480) });
  assert.equal(card.regularMinutes, 80 * 60);
  assert.equal(card.regularCents, 192_000);
  assert.equal(card.vacationCents, 7_680);
  assert.equal(card.grossCents, 199_680);
  assert.ok(card.employee.lines.every((line) => !line.edition || line.edition.includes("T4127")) || card.employee.province === "QC");
  const edited = buildPayCard({ person, period, days: fullDays(480), overrides: { regularMinutes: 70 * 60, rateCents: 2_500 } });
  assert.equal(edited.regularCents, 175_000);
  assert.ok(edited.netCents < card.netCents);
  const salary = buildPayCard({ person, period, days: fullDays(480), overrides: { payType: "salary", rateCents: 5_200_000 } });
  assert.equal(salary.regularCents, 200_000);
  const contractor = buildPayCard({ person: { ...person, contractorBasis: "flat" }, period, days: fullDays(480), overrides: { payType: "contractor", rateCents: 150_000 } });
  assert.equal(contractor.netCents, 150_000);
  assert.equal(contractor.deductionsCents, 0);
  const overtime = buildPayCard({ person, period, days: fullDays(600) });
  // 50 hours each week in Ontario: 6 overtime hours a week.
  assert.equal(overtime.overtimeMinutes, 12 * 60);
  assert.equal(overtime.overtimeCents, Math.round((720 * 2_400 * 1.5) / 60));
});

test("pre-flight flags TD1, long weeks, low rate, missed check-out, $0 pay, and start or end mid-period", () => {
  const long = fullDays(13 * 60);
  const card = buildPayCard({ person: { ...person, td1: "missing", hireDate: "2026-11-12" }, period, days: long });
  const codes = card.checks.map((check) => check.code);
  assert.ok(codes.includes("missing_td1"));
  assert.ok(codes.includes("over_60_hours"));
  assert.ok(codes.includes("mid_period_start"));
  assert.ok(codes.includes("minimum_wage_unverified"));
  assert.equal(canApprove([card]), true);
  const bc = buildPayCard({ person: { ...person, province: "BC", rateCents: 1_700, endDate: "2026-11-15" }, period, days: fullDays(480) });
  const bcCodes = bc.checks.map((check) => check.code);
  assert.ok(bcCodes.includes("under_minimum_wage"));
  assert.ok(bcCodes.includes("mid_period_end"));
  assert.equal(canApprove([bc]), false);
  const missed = fullDays(480);
  missed[2] = { ...missed[2], missedCheckout: true };
  assert.equal(canApprove([buildPayCard({ person, period, days: missed })]), false);
  const zero = buildPayCard({ person, period, days: fullDays(0) });
  assert.ok(zero.checks.some((check) => check.code === "zero_pay"));
  assert.equal(canApprove([]), false);
});

test("the staff picker sorts by name, searches without accents, and turns searchable past 8 people", () => {
  const people = [{ name: "Zoë Tremblay" }, { name: "amira Saleh" }, { name: "Léo Chen" }];
  assert.deepEqual(searchPeople(people, "").map((p) => p.name), ["amira Saleh", "Léo Chen", "Zoë Tremblay"]);
  assert.deepEqual(searchPeople(people, "zoe").map((p) => p.name), ["Zoë Tremblay"]);
  assert.deepEqual(searchPeople(people, "LEO").map((p) => p.name), ["Léo Chen"]);
  assert.equal(SEARCHABLE_AFTER, 8);
});

function stubs() {
  const on = buildPayCard({ person, period, days: fullDays(480) });
  const qcPerson = { ...person, id: "e3", name: "Chloé Roy", province: "QC" };
  const qc = buildPayCard({ person: qcPerson, period, days: fullDays(480) });
  const ct = buildPayCard({ person: { ...person, id: "c1", name: "Ben Ortiz", payType: "contractor", rateCents: 150_000, gstRegistered: true, gstNumber: "123456789RT0001" }, period, days: [] });
  return [
    stubFromCard({ id: "s1", periodId: "p1", periodStart: period.start, periodEnd: period.end, payDate: period.payDate, province: "ON", card: on, employerOtherCents: 1_000 }),
    stubFromCard({ id: "s2", periodId: "p1", periodStart: period.start, periodEnd: period.end, payDate: period.payDate, province: "QC", card: qc }),
    stubFromCard({ id: "s3", periodId: "p1", periodStart: period.start, periodEnd: period.end, payDate: period.payDate, province: "ON", card: ct }),
  ];
}

test("year-end boxes: T4 for staff, T4A box 048 for contractors, RL-1 for Quebec staff", () => {
  const rows = stubs();
  const t4 = t4Slips(rows, 2026);
  assert.equal(t4.length, 2);
  const amira = t4.find((slip) => slip.name === "Amira Saleh");
  assert.equal(amira.box14, rows[0].grossCents);
  assert.equal(amira.box22, rows[0].federalTaxCents + rows[0].provincialTaxCents);
  const chloe = t4.find((slip) => slip.name === "Chloé Roy");
  assert.equal(chloe.box22, rows[1].federalTaxCents);
  assert.equal(chloe.box17, rows[1].qppCents);
  assert.equal(chloe.box16, 0);
  assert.equal(chloe.box55, rows[1].qpipCents);
  assert.deepEqual(t4aSlips(rows, 2026).map((slip) => slip.box048), [150_000]);
  const rl1 = rl1Slips(rows, 2026);
  assert.equal(rl1.length, 1);
  assert.equal(rl1[0].E, rows[1].provincialTaxCents);
  assert.equal(t4Slips(rows, 2027).length, 0);
});

test("the accountant pack has every file, a balanced Xero journal, and remittances split by payee", () => {
  const rows = stubs();
  const files = packFiles({ stubs: rows, remitter: "regular", year: 2026 });
  assert.deepEqual(Object.keys(files).sort(), [
    "deductions-by-type.csv",
    "employer-costs.csv",
    "pay-register.csv",
    "remittance-summary.csv",
    "t4-t4a-rl1.csv",
    "xero-manual-journal.csv",
    "year-to-date.csv",
  ]);
  assert.match(files["pay-register.csv"], /T4127 123rd edition/);
  const xero = xeroJournalCsv(rows).trim().split("\r\n");
  assert.equal(xero[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount,TrackingName1,TrackingOption1,TrackingName2,TrackingOption2");
  const total = xero.slice(1).reduce((sum, line) => sum + Math.round(Number(line.split(",")[5]) * 100), 0);
  assert.equal(total, 0);
  const remit = remittanceSummary(rows, "regular");
  assert.deepEqual(remit.map((row) => row.payee), ["CRA", "Revenu Québec"]);
  assert.equal(remit[0].dueDate, "2026-12-15");
  assert.equal(remit[1].dueVerified, false);
  const json = packJson({ daycareId: "d1", from: "2026-11-01", to: "2026-11-30", stubs: rows, remitter: "regular", year: 2026 });
  assert.equal(json.amountsIn, "cents");
  assert.doesNotMatch(JSON.stringify(json), /"(bank|bankCipher|bank_cipher|sin|transit|account|accountNumber)"/i);
  const pdf = packPdfLines({ centreName: "Sunny Kids", from: "2026-11-01", to: "2026-11-30", stubs: rows, remitter: "regular", locale: "fr" });
  assert.ok(pdf.some((line) => /ne garde jamais/.test(line)));
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("-12.50"), "-12.50");
});

test("saved stubs parse back with whole cents and nothing extra", () => {
  const [row] = stubs();
  const parsed = parseStub(JSON.parse(JSON.stringify({ ...row, bank: "123", grossCents: 10.6 })));
  assert.equal(parsed.grossCents, 11);
  assert.equal("bank" in parsed, false);
  assert.equal(parseStub(null), null);
});
