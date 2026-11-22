import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decideAdminRollup, decideClock, decideOwnHours, decidePayBooks, staffHoursView } from "../src/lib/payroll/access.ts";
import { sandboxAdapter, unavailableAdapter } from "../src/lib/payroll/adapter.ts";
import { planDeposit, sealBank } from "../src/lib/payroll/bank-seal.ts";
import {
  decideFormApprove,
  decideOwnForm,
  formPdfLines,
  formsForProvince,
  nextFormVersion,
  OFFICIAL_WINS_EN,
  publicFormRecord,
  ROE_STEPS_EN,
} from "../src/lib/payroll/employee-forms.ts";
import { invoiceJournal } from "../src/lib/payroll/books.ts";
import { estimatePay, salesTaxOnExtra } from "../src/lib/payroll/calculate.ts";
import { approvedExtra, decideExtraTaxApprove, decideExtraTaxSubmit, extraTaxAuthorityFor, parseExtraTaxDollars } from "../src/lib/payroll/extra-tax.ts";
import {
  buildDeadlines,
  deadlineTone,
  deliverPayrollNotice,
  lastFebruary,
  nextWeekday,
  noticeSlot,
  planDeadlineNotices,
  redCount,
} from "../src/lib/payroll/deadlines.ts";
import { grossFromHours, missedCheckout, paidMinutes, planBank, validManualReason, weekHours } from "../src/lib/payroll/hours.ts";
import { balances, holdingSent, holdingSetAside, postEntry } from "../src/lib/payroll/ledger.ts";
import { nextAction } from "../src/lib/payroll/next-step.ts";
import { buildMonth, craDueDate, emptyAmounts } from "../src/lib/payroll/remittance.ts";
import { defaultUnifiedSettings } from "../src/lib/unified-alerts.ts";

const settings = { ...defaultUnifiedSettings("daycare", "America/Toronto"), digest: "off" };

test("Ontario weekly example matches the CRA T4032 January 2026 steps", () => {
  const pay = estimatePay({
    province: "ON",
    frequency: "weekly",
    regularGrossCents: 130_000,
    vacationBps: 0,
    vacationMode: "payout",
    rrspCents: 8_000,
  });
  assert.equal(pay.employeeCppCents, 7_335);
  assert.equal(pay.employeeEiCents, 2_119);
  assert.equal(pay.federalTaxCents + pay.provincialTaxCents, 17_735);
  assert.equal(pay.provincialVerified, true);
  assert.match(pay.label, /Check it before you approve/);
  assert.match(pay.edition, /T4127 123rd/);
  assert.ok(pay.lines.filter((line) => line.edition).every((line) => line.asOf === "2026-11-22"));
});

test("Quebec weekly example matches QPP, EI, QPIP, federal tax, and adds Revenu Québec tax", () => {
  const pay = estimatePay({
    province: "QC",
    frequency: "weekly",
    regularGrossCents: 130_000,
    vacationBps: 0,
    vacationMode: "payout",
    rrspCents: 8_000,
  });
  assert.equal(pay.employeeQppCents, 7_766);
  assert.equal(pay.employeeEiCents, 1_690);
  assert.equal(pay.employeeQpipCents, 559);
  assert.equal(pay.federalTaxCents, 9_501);
  // Revenu Québec formula, worked by hand in scripts/payroll-engine.test.mjs.
  assert.equal(pay.provincialTaxCents, 12_089);
  assert.equal(pay.provincialVerified, false);
  assert.ok(pay.unverified.some((line) => /TP-1015/.test(line)));
});

test("CPP and EI stop at the 2026 maximums", () => {
  const pay = estimatePay({
    province: "ON",
    frequency: "weekly",
    regularGrossCents: 200_000,
    vacationBps: 0,
    vacationMode: "payout",
    ytd: { cppOrQppCents: 423_045, eiCents: 112_307, pensionableCents: 7_460_000, insurableCents: 6_890_000 },
  });
  assert.equal(pay.employeeCppCents, 0);
  assert.equal(pay.employeeEiCents, 0);
});

test("a non-taxable repayment is cash but not pensionable", () => {
  const pay = estimatePay({
    province: "ON",
    frequency: "weekly",
    regularGrossCents: 100_000,
    vacationBps: 0,
    vacationMode: "payout",
    addons: [{ kind: "reimbursement", amountCents: 2_500, taxable: false }],
  });
  assert.equal(pay.nontaxCashCents, 2_500);
  const plain = estimatePay({
    province: "ON",
    frequency: "weekly",
    regularGrossCents: 100_000,
    vacationBps: 0,
    vacationMode: "payout",
  });
  assert.equal(pay.netCents, plain.netCents + 2_500);
  assert.equal(pay.pensionableCents, plain.pensionableCents);
});

test("child care sales tax stays at zero and a taxable extra uses Ontario HST", () => {
  assert.equal(salesTaxOnExtra("ON", 10_000, false).cents, 0);
  assert.equal(salesTaxOnExtra("ON", 2_000, true).cents, 260);
  assert.equal(salesTaxOnExtra("NS", 2_000, true).verified, false);
  assert.equal(salesTaxOnExtra("NS", 2_000, true).cents, 0);
});

test("only the owner opens pay, and staff see their own hours without rates", () => {
  assert.equal(decidePayBooks({ isOwner: true }).ok, true);
  for (const role of ["staff", "manager", "lead", "read_only"]) {
    assert.equal(decidePayBooks({ isOwner: false }).ok, false);
    assert.equal(decideClock({ isOwner: false, role, samePerson: false, manual: false }).ok, false);
    assert.equal(decideClock({ isOwner: false, role, samePerson: true, manual: true }).ok, false);
  }
  assert.equal(decideClock({ isOwner: false, role: "staff", samePerson: true, manual: false }).ok, true);
  assert.equal(decideClock({ isOwner: true, role: "owner", samePerson: false, manual: true }).ok, true);
  assert.equal(decideOwnHours({ isOwner: false, samePerson: true }).showPay, false);
  assert.equal(decideOwnHours({ isOwner: false, samePerson: false }).ok, false);
  assert.equal("rateCents" in staffHoursView({ rateCents: 2000, name: "Ada" }), false);
  assert.equal(decideAdminRollup({ isPlatformAdmin: false }).ok, false);
  assert.equal(decideAdminRollup({ isPlatformAdmin: true }).ok, true);
});

test("hours round, flag a missed check-out, and estimate Ontario overtime only", () => {
  assert.equal(paidMinutes({ clockIn: "2026-11-02T12:00:00Z", clockOut: "2026-11-02T20:07:00Z", unpaidBreakMinutes: 30, roundStep: 15 }), 450);
  assert.equal(missedCheckout("2026-11-01T12:00:00Z", null, new Date("2026-11-02T01:00:00Z")), true);
  assert.equal(validManualReason("short"), false);
  assert.equal(planBank("tok_partner", "1234").ok, true);
  assert.equal(planBank("123456789", "").ok, false);
  const rows = weekHours({
    province: "ON",
    now: new Date("2026-11-08T12:00:00Z"),
    roundStep: 0,
    approvedOnly: true,
    shifts: [
      {
        id: "1",
        employeeId: "a",
        name: "Ada",
        clockIn: "2026-11-02T12:00:00Z",
        clockOut: "2026-11-02T22:00:00Z",
        unpaidBreakMinutes: 0,
        source: "phone",
        approval: "approved",
        reason: "",
      },
      {
        id: "2",
        employeeId: "a",
        name: "Ada",
        clockIn: "2026-11-03T12:00:00Z",
        clockOut: "2026-11-03T22:00:00Z",
        unpaidBreakMinutes: 0,
        source: "phone",
        approval: "approved",
        reason: "",
      },
      {
        id: "3",
        employeeId: "a",
        name: "Ada",
        clockIn: "2026-11-04T12:00:00Z",
        clockOut: "2026-11-04T22:00:00Z",
        unpaidBreakMinutes: 0,
        source: "phone",
        approval: "approved",
        reason: "",
      },
      {
        id: "4",
        employeeId: "a",
        name: "Ada",
        clockIn: "2026-11-05T12:00:00Z",
        clockOut: "2026-11-05T22:00:00Z",
        unpaidBreakMinutes: 0,
        source: "phone",
        approval: "approved",
        reason: "",
      },
      {
        id: "5",
        employeeId: "a",
        name: "Ada",
        clockIn: "2026-11-06T12:00:00Z",
        clockOut: "2026-11-06T18:00:00Z",
        unpaidBreakMinutes: 0,
        source: "phone",
        approval: "approved",
        reason: "",
      },
    ],
  });
  assert.equal(rows[0].regularMinutes, 44 * 60);
  assert.equal(rows[0].overtimeMinutes, 2 * 60);
  assert.equal(rows[0].overtimeVerified, true);
  const bc = weekHours({
    province: "BC",
    now: new Date("2026-11-08T12:00:00Z"),
    roundStep: 0,
    approvedOnly: true,
    shifts: rows.length ? [{
      id: "b",
      employeeId: "b",
      name: "Bo",
      clockIn: "2026-11-02T12:00:00Z",
      clockOut: "2026-11-02T22:00:00Z",
      unpaidBreakMinutes: 0,
      source: "kiosk",
      approval: "approved",
      reason: "",
    }] : [],
  });
  assert.equal(bc[0].overtimeVerified, false);
  assert.equal(bc[0].overtimeMinutes, 0);
  assert.equal(grossFromHours({ regularMinutes: 60, overtimeMinutes: 60, hourlyCents: 2000, overtimeMultiplier: 1.5 }), 5000);
});

test("holding entries are idempotent, balanced, and never use Stripe", () => {
  const amounts = { ...emptyAmounts(), cppCents: 1000, eiCents: 400, federalCents: 600 };
  const aside = holdingSetAside({ id: "aside-1", daycareId: "c1", at: "2026-11-15", amounts });
  const first = postEntry([], aside);
  assert.equal(first.ok, true);
  const again = postEntry(first.entries, aside);
  assert.equal(again.created, false);
  assert.equal(again.entries.length, 1);
  const sent = postEntry(again.entries, holdingSent({ id: "sent-1", daycareId: "c1", at: "2026-12-15", amounts }));
  assert.equal(sent.ok, true);
  const left = balances(sent.entries, "c1", "holding");
  assert.equal(left.trust_cash, 0);
  assert.equal(left.cpp_payable, 0);
  const mixed = postEntry([], {
    id: "bad",
    daycareId: "c1",
    ledger: "holding",
    memo: "no",
    at: "2026-11-15",
    lines: [
      { account: "provider_stripe", debitCents: 100, creditCents: 0 },
      { account: "cpp_payable", debitCents: 0, creditCents: 100 },
    ],
  });
  assert.equal(mixed.ok, false);
  assert.equal(mixed.error, "mixed_funds");
  const care = invoiceJournal({ id: "inv", daycareId: "c1", amountCents: 5000, kind: "care", province: "ON", at: "2026-11-01" });
  assert.equal(care.lines.some((line) => line.account === "gst_hst_payable"), false);
});

test("a short set-aside is a mismatch and a matched month says all good", () => {
  assert.equal(craDueDate("2026-11-30", "regular").date, "2026-12-15");
  const owed = { ...emptyAmounts(), cppCents: 500, federalCents: 500, provincialVerified: true };
  const short = buildMonth({
    month: "2026-11",
    periodEnd: "2026-11-30",
    remitter: "regular",
    today: "2026-12-01",
    owed,
    setAside: { ...emptyAmounts(), cppCents: 500 },
    sent: emptyAmounts(),
  });
  assert.equal(short.status, "mismatch");
  assert.equal(short.alert, true);
  const good = buildMonth({
    month: "2026-10",
    periodEnd: "2026-10-31",
    remitter: "regular",
    today: "2026-12-01",
    owed,
    setAside: { ...owed, provincialVerified: undefined },
    sent: { ...owed, provincialVerified: undefined },
  });
  assert.equal(good.varianceCents, 0);
  assert.equal(good.sentence, "All good");
  assert.equal(good.status, "on_track");
});

test("the next card is the open shift before pay day", () => {
  const next = nextAction({ openShifts: 1, unapproved: 2, paySaved: false, owedCents: 10, setAsideCents: 0, sentCents: 0 });
  assert.equal(next.id, "fix_shift");
  const pay = nextAction({ openShifts: 0, unapproved: 0, paySaved: false, owedCents: 10, setAsideCents: 0, sentCents: 0 });
  assert.equal(pay.id, "run_pay");
});

test("deadlines cite rules, turn red when late, and amber inside 3 days", () => {
  assert.equal(nextWeekday("2027-02-28"), "2027-03-01");
  assert.equal(lastFebruary(2027), "2027-02-28");
  assert.equal(deadlineTone({ due: "2026-12-10", today: "2026-12-12", done: false }), "red");
  assert.equal(deadlineTone({ due: "2026-12-14", today: "2026-12-12", done: false }), "amber");
  assert.equal(deadlineTone({ due: "2026-12-12", today: "2026-12-12", done: true }), "green");
  const items = buildDeadlines({
    daycareId: "c1",
    today: "2026-12-16",
    remitter: "regular",
    periodEnd: "2026-11-30",
    payDate: "2026-12-20",
    approvalDate: "2026-12-18",
    taxYear: 2026,
    roePeriodEnd: null,
    gstPeriodEnd: null,
    gstFrequency: "none",
    province: "ON",
    hasTaxableExtra: false,
    unapprovedEdits: 0,
    missingWage: true,
    shortCents: 100,
    partnerFailed: false,
    remittanceDone: false,
    paydayDone: false,
  });
  assert.ok(items.some((item) => item.kind === "remittance" && item.tone === "red" && item.citation.includes("canada.ca")));
  assert.ok(items.some((item) => item.kind === "missing_wage" && item.tone === "red"));
  assert.ok(redCount(items) >= 2);
  const pst = buildDeadlines({
    daycareId: "c1",
    today: "2026-06-01",
    remitter: "regular",
    periodEnd: "2026-05-31",
    payDate: "2026-06-15",
    approvalDate: "2026-06-14",
    taxYear: 2026,
    roePeriodEnd: null,
    gstPeriodEnd: null,
    gstFrequency: "none",
    province: "BC",
    hasTaxableExtra: true,
    unapprovedEdits: 0,
    missingWage: false,
    shortCents: 0,
    partnerFailed: false,
    remittanceDone: true,
    paydayDone: true,
  }).find((item) => item.kind === "pst");
  assert.equal(pst.verified, false);
  assert.equal(pst.due, null);
});

test("notices schedule 7, 3, 1, due, and daily overdue, then dedupe and skip staff", () => {
  const deadlines = buildDeadlines({
    daycareId: "c1",
    today: "2026-12-08",
    remitter: "regular",
    periodEnd: "2026-11-30",
    payDate: null,
    approvalDate: null,
    taxYear: 2026,
    roePeriodEnd: null,
    gstPeriodEnd: null,
    gstFrequency: "none",
    province: "ON",
    hasTaxableExtra: false,
    unapprovedEdits: 0,
    missingWage: false,
    shortCents: 0,
    partnerFailed: false,
    remittanceDone: false,
    paydayDone: true,
  });
  assert.equal(noticeSlot("2026-12-08", "2026-12-15", false), "d7");
  assert.equal(noticeSlot("2026-12-12", "2026-12-15", false), "d3");
  assert.equal(noticeSlot("2026-12-14", "2026-12-15", false), "d1");
  assert.equal(noticeSlot("2026-12-15", "2026-12-15", false), "due");
  assert.equal(noticeSlot("2026-12-16", "2026-12-15", false), "overdue");
  assert.equal(noticeSlot("2026-12-01", "2026-12-15", false), null);
  const quietNow = new Date("2026-12-08T02:30:00Z");
  const owner = planDeadlineNotices({
    today: "2026-12-08",
    now: quietNow,
    deadlines,
    ownerUserId: "owner-1",
    role: "owner",
    isOwner: true,
    locale: "fr",
    sentKeys: [],
    settings,
    payrollAlerts: true,
    live: false,
    pushArmed: false,
    smsArmed: false,
    env: {},
  });
  assert.ok(owner.some((plan) => plan.slot === "d7"));
  assert.equal(owner.every((plan) => plan.typeId === "daycare_payroll_due"), true);
  const again = planDeadlineNotices({
    today: "2026-12-08",
    now: quietNow,
    deadlines,
    ownerUserId: "owner-1",
    role: "owner",
    isOwner: true,
    locale: "en",
    sentKeys: owner.map((plan) => plan.dedupeKey),
    settings,
    payrollAlerts: true,
    live: true,
    pushArmed: true,
    smsArmed: true,
    env: {},
  });
  assert.equal(again.length, 0);
  const staff = planDeadlineNotices({
    today: "2026-12-16",
    now: new Date("2026-12-16T15:00:00Z"),
    deadlines,
    ownerUserId: "staff-1",
    role: "staff",
    isOwner: false,
    locale: "en",
    sentKeys: [],
    settings,
    payrollAlerts: true,
    live: true,
    pushArmed: true,
    smsArmed: true,
    env: {},
  });
  assert.equal(staff.length, 0);
  const late = planDeadlineNotices({
    today: "2026-12-16",
    now: new Date("2026-12-16T15:00:00Z"),
    deadlines,
    ownerUserId: "owner-1",
    role: "owner",
    isOwner: true,
    locale: "en",
    sentKeys: [],
    settings,
    payrollAlerts: true,
    live: true,
    pushArmed: true,
    smsArmed: true,
    env: { NODE_ENV: "production", VERCEL_ENV: "production" },
  });
  const overdue = late.filter((plan) => plan.slot === "overdue");
  assert.ok(overdue.length > 0);
  assert.equal(overdue.every((plan) => plan.critical), true);
  const nextDay = planDeadlineNotices({
    today: "2026-12-17",
    now: new Date("2026-12-17T15:00:00Z"),
    deadlines,
    ownerUserId: "owner-1",
    role: "owner",
    isOwner: true,
    locale: "en",
    sentKeys: overdue.map((plan) => plan.dedupeKey),
    settings,
    payrollAlerts: true,
    live: true,
    pushArmed: false,
    smsArmed: false,
    env: { NODE_ENV: "production", VERCEL_ENV: "production" },
  });
  assert.ok(nextDay.some((plan) => plan.slot === "overdue" && plan.dedupeKey.includes("2026-12-17")));
  assert.equal(deliverPayrollNotice(overdue[0], { alerts: false, live: false }).delivered, false);
  assert.equal(deliverPayrollNotice(overdue[0], { alerts: true, live: true }).delivered, false);
  const off = planDeadlineNotices({
    today: "2026-12-08",
    now: quietNow,
    deadlines,
    ownerUserId: "owner-1",
    role: "owner",
    isOwner: true,
    locale: "en",
    sentKeys: [],
    settings,
    payrollAlerts: false,
    live: false,
    pushArmed: false,
    smsArmed: false,
    env: {},
  });
  assert.equal(off.every((plan) => plan.reason === "flag"), true);
  assert.equal(off.every((plan) => plan.sms === "skip"), true);
});

test("the server gate is owner-only and does not send or call Stripe", () => {
  const source = readFileSync(new URL("../src/lib/server/payroll-desk.ts", import.meta.url), "utf8");
  assert.match(source, /decidePayBooks/);
  assert.match(source, /decideClock/);
  assert.match(source, /staffHoursView/);
  assert.match(source, /deliverPayrollNotice/);
  assert.match(source, /delivered: 0/);
  assert.doesNotMatch(source, /stripe\.|fetch\(|twilio/i);
  const migration = readFileSync(new URL("../migrations/0225_provider_payroll.sql", import.meta.url), "utf8");
  assert.match(migration, /bank_token/);
  assert.doesNotMatch(migration, /account_number|sin\b/i);
});

test("approved extra tax comes off each cheque and a pending request does not", () => {
  const base = estimatePay({
    province: "ON",
    frequency: "weekly",
    regularGrossCents: 130_000,
    vacationBps: 0,
    vacationMode: "payout",
    rrspCents: 8_000,
  });
  const pending = estimatePay({
    province: "ON",
    frequency: "weekly",
    regularGrossCents: 130_000,
    vacationBps: 0,
    vacationMode: "payout",
    rrspCents: 8_000,
    extraTaxCents: 2_000,
    extraTaxAuthority: "cra",
    extraTaxApproved: false,
  });
  assert.equal(pending.federalTaxCents, base.federalTaxCents);
  assert.equal(pending.netCents, base.netCents);
  const approved = estimatePay({
    province: "ON",
    frequency: "weekly",
    regularGrossCents: 130_000,
    vacationBps: 0,
    vacationMode: "payout",
    rrspCents: 8_000,
    extraTaxCents: 2_000,
    extraTaxAuthority: "cra",
    extraTaxApproved: true,
  });
  assert.equal(approved.extraTaxCents, 2_000);
  assert.equal(approved.federalTaxCents, base.federalTaxCents + 2_000);
  assert.equal(approved.employeeCppCents, base.employeeCppCents);
  assert.equal(approved.netCents, base.netCents - 2_000);
  assert.equal(approved.governmentCents, base.governmentCents + 2_000);
  const quebecBase = estimatePay({
    province: "QC",
    frequency: "weekly",
    regularGrossCents: 130_000,
    vacationBps: 0,
    vacationMode: "payout",
    rrspCents: 8_000,
  });
  const quebec = estimatePay({
    province: "QC",
    frequency: "weekly",
    regularGrossCents: 130_000,
    vacationBps: 0,
    vacationMode: "payout",
    rrspCents: 8_000,
    extraTaxCents: 1_500,
    extraTaxAuthority: "revenu_quebec",
    extraTaxApproved: true,
  });
  assert.equal(quebec.federalTaxCents, quebecBase.federalTaxCents);
  assert.equal(quebec.provincialTaxCents, quebecBase.provincialTaxCents + 1_500);
  assert.equal(quebec.governmentCents, quebecBase.governmentCents + 1_500);
  assert.equal(extraTaxAuthorityFor("QC"), "revenu_quebec");
  assert.equal(extraTaxAuthorityFor("ON"), "cra");
  const parsed = parseExtraTaxDollars("20.00");
  assert.equal(parsed.ok && parsed.cents, 2_000);
  assert.equal(parseExtraTaxDollars("nope").ok, false);
  assert.equal(approvedExtra({ requestedCents: 2_000, status: "pending" }), 0);
  assert.equal(approvedExtra({ requestedCents: 2_000, status: "approved" }), 2_000);
  assert.equal(decideExtraTaxSubmit({ samePerson: true, role: "staff" }).ok, true);
  assert.equal(decideExtraTaxSubmit({ samePerson: false, role: "staff" }).ok, false);
  assert.equal(decideExtraTaxSubmit({ samePerson: false, role: "manager" }).ok, false);
  assert.equal(decideExtraTaxApprove({ isOwner: false }).ok, false);
  assert.equal(decideExtraTaxApprove({ isOwner: true }).ok, true);
  const server = readFileSync(new URL("../src/lib/server/payroll-desk.ts", import.meta.url), "utf8");
  assert.match(server, /decideExtraTaxSubmit/);
  assert.match(server, /decideExtraTaxApprove/);
  assert.match(server, /sent: false/);
});

test("employee forms stay on the person's own file and bank numbers are sealed", () => {
  const key = "11".repeat(32);
  const env = { PAYROLL_BANK_KEY: key };
  const sealed = planDeposit({ institution: "001", transit: "12345", account: "123456789", env });
  assert.equal(sealed.ok, true);
  if (!sealed.ok) return;
  assert.equal(sealed.last4, "6789");
  assert.equal(sealed.cipher.includes("123456789"), false);
  assert.equal(planDeposit({ institution: "001", transit: "12345", account: "123456789", env: {} }).ok, false);
  const opened = sealBank("001|12345|123456789", env);
  assert.ok(opened && !opened.includes("123456789"));
  assert.equal(decideOwnForm({ isOwner: false, samePerson: true }).ok, true);
  assert.equal(decideOwnForm({ isOwner: false, samePerson: false }).ok, false);
  assert.equal(decideOwnForm({ isOwner: true, samePerson: false }).scope, "all");
  assert.equal(decideFormApprove({ isOwner: false }).ok, false);
  assert.equal(nextFormVersion([1, 2]), 3);
  const record = publicFormRecord({ kind: "deposit", version: 2, status: "approved", savedOn: "2026-11-22", bankLast4: "6789" });
  assert.equal(record.bankLast4, "6789");
  assert.equal("cipher" in record, false);
  const ontario = formsForProvince("ON").map((card) => card.kind);
  assert.ok(ontario.includes("td1_federal") && ontario.includes("td1_provincial"));
  assert.equal(ontario.includes("tp1015"), false);
  const quebec = formsForProvince("QC");
  assert.ok(quebec.some((card) => card.kind === "tp1015" && card.officialUrl.includes("tp-1015.3")));
  assert.equal(quebec.some((card) => card.kind === "td1_provincial"), false);
  for (const card of formsForProvince("ON")) {
    assert.equal(card.asOf, "2026-11-22");
    if (card.kind !== "emergency") assert.match(card.officialUrl, /^https:\/\//);
  }
  const lines = formPdfLines({
    locale: "en",
    centre: "Little Oaks",
    person: "Amira",
    card: formsForProvince("ON")[0],
    version: 1,
    savedOn: "2026-11-22",
    bankLast4: "6789",
  });
  assert.match(lines.join("\n"), /KidEase/);
  assert.match(lines.join("\n"), /6789/);
  assert.doesNotMatch(lines.join("\n"), /123456789/);
  assert.ok(lines.some((line) => line === OFFICIAL_WINS_EN));
  assert.equal(ROE_STEPS_EN.at(-1)?.includes("does not file"), true);
  const server = readFileSync(new URL("../src/lib/server/payroll-desk.ts", import.meta.url), "utf8");
  assert.match(server, /decideOwnForm/);
  assert.match(server, /planDeposit/);
  assert.match(server, /sent: false/);
});

test("sandbox adapter never moves money and other partners stay closed", () => {
  const sandbox = sandboxAdapter();
  const run = sandbox.submitPayRun({ daycareId: "c1", payRunId: "p1" });
  assert.equal(run.moneyMoved, false);
  const trust = sandbox.trustAccount({ daycareId: "c1", holder: "payroll_partner" });
  assert.equal(trust.segregated, true);
  assert.equal(trust.holdsFunds, false);
  assert.match(trust.ref, /sandbox-trust/);
  assert.equal(unavailableAdapter("nmbr").submitPayRun({ daycareId: "c1", payRunId: "p1" }).ok, false);
});
