import assert from "node:assert/strict";
import { test } from "node:test";
import { minimumVacationBps, minimumWageCents, minimumWageOn, MINIMUM_WAGES, MINIMUM_WAGE_AS_OF, holidayPayCents, PAY_RULES, splitOvertime, unverifiedRules, yearsOfService } from "../src/lib/payroll/pay-rules.ts";
import { cntCents, employerCosts, yearlyHealthTaxCents } from "../src/lib/payroll/employer-costs.ts";
import { contractorPay, validGstNumber } from "../src/lib/payroll/contractor.ts";
import { correctionLines, dayRows, parseHours, planAdjust, planFlag, planReset, staffDayView, totalMinutes } from "../src/lib/payroll/hours-adjust.ts";
import { buildPayCard, canApprove, searchPeople, SEARCHABLE_AFTER } from "../src/lib/payroll/pay-card.ts";
import { parseStub, stubFromCard } from "../src/lib/payroll/stubs.ts";
import { rl1Slips, t4aSlips, t4Slips } from "../src/lib/payroll/year-end.ts";
import { csvCell, packFiles, packJson, packPdfLines, remittanceSummary, xeroJournalCsv } from "../src/lib/payroll/accountant-pack.ts";
import { PROVINCE_CODES } from "../src/lib/payroll/tables.ts";

const NOW = new Date("2026-11-20T20:00:00Z");

test("every province has its pay rules and a minimum wage, each with an official link and as-of date", () => {
  for (const code of PROVINCE_CODES) {
    assert.match(MINIMUM_WAGES[code].source, /^https:\/\//, `${code} minimum wage`);
    assert.ok(MINIMUM_WAGES[code].general.length >= 1);
    for (const key of ["vacation", "overtime", "holiday"]) {
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

// [province, date before the latest change, rate then, latest change date, latest rate]
const WAGES = [
  ["AB", "2018-09-30", null, "2018-10-01", 1_500],
  ["BC", "2026-05-31", 1_785, "2026-06-01", 1_825],
  ["MB", "2026-09-30", 1_600, "2026-10-01", 1_640],
  ["NB", "2026-03-31", 1_565, "2026-04-01", 1_590],
  ["NL", "2026-03-31", 1_600, "2026-04-01", 1_635],
  ["NS", "2026-09-30", 1_675, "2026-10-01", 1_700],
  ["ON", "2026-09-30", 1_760, "2026-10-01", 1_795],
  ["PE", "2026-09-30", 1_700, "2026-10-01", 1_730],
  ["QC", "2026-04-30", 1_610, "2026-05-01", 1_660],
  ["SK", "2026-09-30", 1_535, "2026-10-01", 1_570],
  ["YT", "2026-03-31", 1_794, "2026-04-01", 1_851],
  ["NT", "2026-08-31", 1_695, "2026-09-01", 1_720],
  ["NU", "2026-08-31", 1_975, "2026-09-01", 2_017],
];

for (const [province, before, oldRate, from, rate] of WAGES) {
  test(`minimum wage ${province}: ${rate / 100} from ${from}, the earlier rate the day before`, () => {
    assert.equal(minimumWageCents(province, from), rate);
    assert.equal(minimumWageCents(province, "2026-11-22"), rate);
    assert.equal(minimumWageCents(province, before), oldRate);
  });
}

test("minimum wage history: PEI's announced April 2027 rate, Nova Scotia's April 2026 step, student and tipped rates", () => {
  assert.equal(minimumWageCents("PE", "2027-04-01"), 1_760);
  assert.equal(minimumWageCents("PE", "2027-03-31"), 1_730);
  assert.equal(minimumWageCents("NS", "2026-04-01"), 1_675);
  assert.equal(minimumWageCents("NS", "2026-03-31"), null);
  assert.equal(minimumWageOn("ON", "2026-11-02", "student").cents, 1_690);
  assert.equal(minimumWageOn("AB", "2026-11-02", "student").cents, 1_300);
  // Student rates are only for Ontario and Alberta.
  assert.equal(minimumWageOn("BC", "2026-11-02", "student").wageClass, "general");
  assert.equal(minimumWageOn("QC", "2026-11-02", "tipped").cents, 1_330);
  assert.equal(MINIMUM_WAGE_AS_OF, "2026-11-22");
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
  assert.ok(!codes.includes("minimum_wage_unverified"));
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

test("unsupported pay is blocked, never shown as a partial number", () => {
  const qc2027 = buildPayCard({ person: { ...person, province: "QC" }, period: { start: "2027-01-03", end: "2027-01-16", payDate: "2027-01-22" }, days: fullDays(480) });
  assert.equal(qc2027.netCents, 0);
  assert.equal(qc2027.employee.blocked !== null, true);
  assert.equal(canApprove([qc2027]), false);
  const early = buildPayCard({ person, period: { start: "2026-06-07", end: "2026-06-20", payDate: "2026-06-26" }, days: fullDays(480) });
  assert.equal(canApprove([early]), false);
  assert.match(qc2027.employee.blocked, /hasn't published its 2027 figures/);
});

test("pay day words exist in English and French, and the default period is two weeks", async () => {
  const { paydayCopy, PAYDAY_COPY_KEYS, checkWords, defaultPeriod, payErrorWords } = await import("../src/lib/payroll/payday-copy.ts");
  const en = paydayCopy("en");
  const fr = paydayCopy("fr");
  for (const key of PAYDAY_COPY_KEYS) {
    assert.ok(en[key].length > 0 && fr[key].length > 0, key);
  }
  assert.notEqual(en.approve, fr.approve);
  assert.match(checkWords("no_table", "fr"), /KidEase/);
  assert.deepEqual(defaultPeriod("2026-11-22"), { start: "2026-11-08", end: "2026-11-21", payDate: "2026-11-27" });
  assert.equal(payErrorWords("payroll:stale", "en"), en.stale);
});

test("the pay server checks the flag, never trusts browser amounts, and moves no money", async () => {
  const { readFileSync } = await import("node:fs");
  const server = readFileSync(new URL("../src/lib/server/payroll-pay.ts", import.meta.url), "utf8");
  assert.match(server, /providerPayrollEnabled/);
  assert.match(server, /authMiddleware/);
  assert.match(server, /canApprove\(cards\)/);
  assert.match(server, /moneyMoved: false/);
  assert.doesNotMatch(server, /stripe\.|fetch\(|twilio/i);
  const store = readFileSync(new URL("../src/lib/payroll/pay-store.ts", import.meta.url), "utf8");
  assert.match(store, /supersedes_id/);
  assert.match(store, /clock_out_at is null/);
  const migration = readFileSync(new URL("../migrations/0228_payroll_pay_runs.sql", import.meta.url), "utf8");
  assert.match(migration, /payroll_punches_one_open_idx/);
  assert.doesNotMatch(migration, /\bdrop\b/i);
  const down = readFileSync(new URL("../migrations/down/0228_payroll_pay_runs.sql", import.meta.url), "utf8");
  assert.match(down, /drop table if exists payroll_overrides/);
});

test("a period that spans a minimum wage change checks each day against the rate in force that day", async () => {
  const { checkText } = await import("../src/lib/payroll/payday-copy.ts");
  const spanPeriod = { start: "2026-09-20", end: "2026-10-03", payDate: "2026-10-09" };
  const days = [];
  for (const date of ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]) {
    days.push({ date, checkIn: null, checkOut: null, autoMinutes: 480, minutes: 480, adjusted: false, originalMinutes: null, reason: null, adjustedBy: null, adjustedAt: null, missedCheckout: false, flagged: false, flagNote: null, locked: false });
  }
  // $17.70 is above Ontario's $17.60 (September) but under $17.95 (from October 1).
  const card = buildPayCard({ person: { ...person, rateCents: 1_770 }, period: spanPeriod, days });
  const stops = card.checks.filter((check) => check.code === "under_minimum_wage");
  assert.equal(stops.length, 1);
  assert.equal(stops[0].date, "2026-10-01");
  assert.equal(stops[0].amountCents, 1_795);
  assert.equal(canApprove([card]), false);
  assert.match(checkText(stops[0], "en"), /\$17\.95 an hour minimum wage in force on October 1, 2026/);
  assert.match(checkText(stops[0], "fr"), /17,95\s\$ l’heure en vigueur le 1er octobre 2026/);
  // Under both rates: one stop per rate.
  const low = buildPayCard({ person: { ...person, rateCents: 1_700 }, period: spanPeriod, days });
  assert.deepEqual(low.checks.filter((check) => check.code === "under_minimum_wage").map((check) => check.amountCents), [1_760, 1_795]);
  // A student in Ontario uses the student rate, with a note.
  const student = buildPayCard({ person: { ...person, rateCents: 1_700, wageClass: "student" }, period: { start: "2026-11-08", end: "2026-11-21", payDate: "2026-11-27" }, days: fullDays(480) });
  assert.ok(student.checks.some((check) => check.code === "student_rate"));
  assert.equal(student.checks.some((check) => check.code === "under_minimum_wage"), false);
  // Salary is checked as pay per hour worked.
  const salary = buildPayCard({ person: { ...person, payType: "salary", rateCents: 2_600_000 }, period, days: fullDays(600) });
  assert.ok(salary.checks.some((check) => check.code === "under_minimum_wage"));
});

test("a bonus on the pay card is taxed with the bonus method and shows on the stub, register, pack, and slips", () => {
  const card = buildPayCard({ person, period, days: fullDays(480), overrides: { bonusCents: 100_000 } });
  const plain = buildPayCard({ person, period, days: fullDays(480) });
  assert.equal(card.bonusCents, 100_000);
  assert.equal(card.grossCents, plain.grossCents + 100_000);
  assert.ok(card.bonusTaxCents > 0);
  assert.equal(card.employee.federalTaxCents + card.employee.provincialTaxCents, plain.employee.federalTaxCents + plain.employee.provincialTaxCents + card.bonusTaxCents);
  assert.ok(card.employee.employeeCppCents > plain.employee.employeeCppCents);
  assert.ok(card.employee.employeeEiCents > plain.employee.employeeEiCents);
  assert.equal(canApprove([card]), true);
  const stub = stubFromCard({ id: "sb", periodId: "p", periodStart: period.start, periodEnd: period.end, payDate: period.payDate, province: "ON", card });
  assert.equal(stub.bonusCents, 100_000);
  assert.equal(stub.bonusTaxCents, card.bonusTaxCents);
  const files = packFiles({ stubs: [stub], remitter: "regular", year: 2026 });
  assert.match(files["pay-register.csv"].split("\r\n")[0], /,bonus,bonus_tax,/);
  assert.match(files["pay-register.csv"], /,1000\.00,/);
  assert.equal(t4Slips([stub], 2026)[0].box14, stub.grossCents);
  const qc = buildPayCard({ person: { ...person, province: "QC" }, period, days: fullDays(480), overrides: { bonusCents: 100_000 } });
  const qcStub = stubFromCard({ id: "sq", periodId: "p", periodStart: period.start, periodEnd: period.end, payDate: period.payDate, province: "QC", card: qc });
  assert.equal(rl1Slips([qcStub], 2026)[0].A, qcStub.grossCents);
});
