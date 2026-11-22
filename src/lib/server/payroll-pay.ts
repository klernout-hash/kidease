/**
 * Pay day server functions: staff picker, pay card data, hour and rate
 * changes, staff flags, approval, and the accountant pack.
 * Off unless FEATURE_PROVIDER_PAYROLL is on. No money moves. Nothing is sent.
 */

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { providerPayrollEnabled, xeroSyncEnabled } from "@/lib/features";
import { nid } from "@/lib/utils";
import { packFiles, packJson, packPdfLines } from "@/lib/payroll/accountant-pack.ts";
import { parseHours, staffDayView, validAdjustReason } from "@/lib/payroll/hours-adjust.ts";
import { buildPayCard, canApprove, type PayCard, type PayType } from "@/lib/payroll/pay-card.ts";
import type { PayYtd } from "@/lib/payroll/calculate.ts";
import {
  approvePeriod,
  listEditors,
  loadDesk,
  loadPeople,
  loadStubs,
  myEmployeeId,
  payAccess,
  saveFlag,
  saveOverride,
  setEditor,
  setWageClass,
  type PayDesk,
} from "@/lib/payroll/pay-store.ts";
import { stubFromCard, type ApprovedStub } from "@/lib/payroll/stubs.ts";
import type { RemitterType } from "@/lib/payroll/remittance.ts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function day(value: unknown): string {
  const text = String(value ?? "").trim();
  return DATE.test(text) ? text : "";
}

function id(value: unknown): string {
  return String(value ?? "").trim().slice(0, 128);
}

function noStore() {
  setResponseHeader("Cache-Control", "private, no-store");
}

function requireOn() {
  if (!providerPayrollEnabled()) throw new Error("payroll:off");
}

export function ytdFromStubs(stubs: readonly ApprovedStub[]): Partial<PayYtd> {
  const sum = (pick: (s: ApprovedStub) => number) => stubs.reduce((t, s) => t + pick(s), 0);
  return {
    pensionableCents: sum((s) => s.pensionableCents),
    cppOrQppCents: sum((s) => s.cppCents + s.qppCents),
    cpp2Cents: sum((s) => s.cpp2Cents + s.qpp2Cents),
    insurableCents: sum((s) => s.insurableCents),
    eiCents: sum((s) => s.eiCents),
    qpipInsurableCents: sum((s) => (s.province === "QC" ? s.insurableCents : 0)),
    qpipCents: sum((s) => s.qpipCents),
  };
}

/** Build the card the same way the screen does, from what the server loaded. */
export function cardFromDesk(desk: PayDesk, period: { start: string; end: string; payDate: string }): PayCard {
  return buildPayCard({
    person: desk.person,
    period,
    days: desk.days,
    ytd: ytdFromStubs(desk.ytdStubs),
    ytdBonusCents: desk.ytdBonusCents,
    overrides: {
      payType: desk.payTypeOverride ?? undefined,
      rateCents: desk.rateOverride ?? undefined,
      bonusCents: desk.bonusOverride ?? undefined,
    },
  });
}

export const payrollPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: id(input?.daycareId) }))
  .handler(async ({ context, data }) => {
    noStore();
    if (!providerPayrollEnabled()) return { enabled: false as const, people: [], owner: false, editor: false };
    const sql = await getSql();
    const access = await payAccess(sql, context.userId, data.daycareId);
    if (!access.editor) return { enabled: true as const, people: [], owner: false, editor: false };
    const people = await loadPeople(sql, context.userId, data.daycareId);
    return {
      enabled: true as const,
      owner: access.owner,
      editor: access.editor,
      people: people.map((p) => ({ id: p.id, name: p.name, payType: p.payType, province: p.province })),
    };
  });

type PeriodInput = { daycareId?: string; employeeId?: string; start?: string; end?: string; payDate?: string };

function periodOf(input: PeriodInput) {
  const start = day(input?.start);
  const end = day(input?.end);
  const payDate = day(input?.payDate);
  if (!start || !end || !payDate || end < start) throw new Error("payroll:period");
  const span = (Date.parse(end) - Date.parse(start)) / 86_400_000;
  if (span > 31) throw new Error("payroll:period");
  return { start, end, payDate };
}

/** Everything the pay card needs. The screen recalculates live with buildPayCard. */
export const payrollDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: PeriodInput) => ({ daycareId: id(input?.daycareId), employeeId: id(input?.employeeId), ...periodOf(input) }))
  .handler(async ({ context, data }) => {
    noStore();
    requireOn();
    const sql = await getSql();
    const desk = await loadDesk(sql, { userId: context.userId, daycareId: data.daycareId, employeeId: data.employeeId, from: data.start, to: data.end, now: new Date() });
    if (!desk) throw new Error("payroll:missing");
    return { desk, ytd: ytdFromStubs(desk.ytdStubs) };
  });

/**
 * Change one day's hours, reset a day, or change the rate or pay type for
 * this period. Owner or named payroll editor. A reason is required.
 * `expectedId` is the latest change the editor saw (stale-edit guard).
 */
export const payrollChange = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: PeriodInput & { kind?: string; workDate?: string; value?: string; reason?: string; expectedId?: string }) => ({
      daycareId: id(input?.daycareId),
      employeeId: id(input?.employeeId),
      ...periodOf(input),
      kind: (input?.kind === "rate" || input?.kind === "pay_type" || input?.kind === "reset" || input?.kind === "bonus" ? input.kind : "hours") as
        | "hours"
        | "rate"
        | "pay_type"
        | "reset"
        | "bonus",
      workDate: day(input?.workDate),
      value: String(input?.value ?? "").trim().slice(0, 40),
      reason: String(input?.reason ?? "").trim().slice(0, 200),
      expectedId: id(input?.expectedId),
    }),
  )
  .handler(async ({ context, data }) => {
    noStore();
    requireOn();
    const sql = await getSql();
    const desk = await loadDesk(sql, { userId: context.userId, daycareId: data.daycareId, employeeId: data.employeeId, from: data.start, to: data.end, now: new Date() });
    if (!desk) throw new Error("payroll:permission");
    const reason = data.kind === "reset" ? data.reason || "Reset to check-in times" : data.kind === "bonus" ? data.reason || "Bonus" : data.reason;
    if (!validAdjustReason(reason)) throw new Error("payroll:reason");

    let field: "day_minutes" | "rate_cents" | "pay_type" | "bonus_cents";
    let keyDate: string;
    let oldValue: string;
    let newValue: string;
    if (data.kind === "hours" || data.kind === "reset") {
      const row = desk.days.find((d) => d.date === data.workDate);
      if (!row) throw new Error("payroll:day");
      field = "day_minutes";
      keyDate = row.date;
      oldValue = String(row.minutes);
      if (data.kind === "reset") {
        if (!row.adjusted) throw new Error("payroll:nothing_to_reset");
        newValue = "";
      } else {
        const minutes = parseHours(data.value);
        if (minutes == null) throw new Error("payroll:hours");
        newValue = String(minutes);
      }
    } else if (data.kind === "bonus") {
      // Empty clears the bonus. Whole cents only.
      const cents = data.value === "" ? 0 : Math.round(Number(data.value.replace(",", ".")) * 100);
      if (!Number.isFinite(cents) || cents < 0 || cents > 100_000_000) throw new Error("payroll:bonus");
      field = "bonus_cents";
      keyDate = data.start;
      oldValue = String(desk.bonusOverride ?? 0);
      newValue = cents > 0 ? String(cents) : "";
    } else if (data.kind === "rate") {
      const cents = Math.round(Number(data.value) * 100);
      if (!Number.isFinite(cents) || cents <= 0 || cents > 100_000_000) throw new Error("payroll:rate");
      field = "rate_cents";
      keyDate = data.start;
      oldValue = String(desk.rateOverride ?? desk.person.rateCents);
      newValue = String(cents);
    } else {
      const next = data.value as PayType;
      if (!["hourly", "salary", "contractor"].includes(next)) throw new Error("payroll:pay_type");
      field = "pay_type";
      keyDate = data.start;
      oldValue = desk.payTypeOverride ?? desk.person.payType;
      newValue = next;
    }
    const result = await saveOverride(sql, {
      id: nid(),
      userId: context.userId,
      daycareId: data.daycareId,
      employeeId: data.employeeId,
      field,
      keyDate,
      oldValue,
      newValue,
      reason,
      expectedId: data.expectedId,
    });
    if (!result.ok) throw new Error(`payroll:${result.error}`);
    return { ok: true as const, correction: result.correction, sent: false as const };
  });

/** Staff: my own hours this period, with any change and its reason. No rates, no pay. */
export const payrollMyHours = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: PeriodInput) => ({ daycareId: id(input?.daycareId), ...periodOf(input) }))
  .handler(async ({ context, data }) => {
    noStore();
    requireOn();
    const sql = await getSql();
    const employeeId = await myEmployeeId(sql, context.userId, data.daycareId);
    if (!employeeId) throw new Error("payroll:own_hours");
    const desk = await loadDesk(sql, {
      userId: context.userId,
      daycareId: data.daycareId,
      employeeId,
      from: data.start,
      to: data.end,
      now: new Date(),
      selfOnly: true,
    });
    if (!desk) throw new Error("payroll:own_hours");
    return { name: desk.person.name, employeeId, days: desk.days.map(staffDayView) };
  });

/** Staff: "this day is wrong". Saved for the owner. Owner notices stay behind the send flags (off). */
export const payrollFlagDay = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; employeeId?: string; workDate?: string; note?: string }) => ({
    daycareId: id(input?.daycareId),
    employeeId: id(input?.employeeId),
    workDate: day(input?.workDate),
    note: String(input?.note ?? "").trim().slice(0, 200),
  }))
  .handler(async ({ context, data }) => {
    requireOn();
    if (!data.workDate) throw new Error("payroll:day");
    if (!validAdjustReason(data.note)) throw new Error("payroll:reason");
    const saved = await saveFlag(await getSql(), { id: nid(), userId: context.userId, ...data });
    if (!saved) throw new Error("payroll:own_hours");
    return { ok: true as const, sent: false as const };
  });

/**
 * Approve a pay period. The server rebuilds every card itself (it never
 * trusts amounts from the browser) and refuses when any card has a stop.
 */
export const payrollApprove = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: PeriodInput) => ({ daycareId: id(input?.daycareId), ...periodOf(input) }))
  .handler(async ({ context, data }) => {
    noStore();
    requireOn();
    const sql = await getSql();
    const access = await payAccess(sql, context.userId, data.daycareId);
    if (!access.editor) throw new Error("payroll:permission");
    const people = await loadPeople(sql, context.userId, data.daycareId);
    const period = { start: data.start, end: data.end, payDate: data.payDate };
    const cards: PayCard[] = [];
    for (const person of people) {
      const desk = await loadDesk(sql, { userId: context.userId, daycareId: data.daycareId, employeeId: person.id, from: data.start, to: data.end, now: new Date() });
      if (desk) cards.push(cardFromDesk(desk, period));
    }
    if (!canApprove(cards)) throw new Error("payroll:preflight");
    const periodId = nid();
    const stubs = cards.map((card) => {
      const person = people.find((p) => p.id === card.personId);
      return stubFromCard({ id: nid(), periodId, periodStart: data.start, periodEnd: data.end, payDate: data.payDate, province: person?.province ?? "ON", card });
    });
    const drafts = cards
      .filter((card) => card.contractor)
      .map((card) => ({ id: nid(), employeeId: card.personId, feeCents: card.contractor?.feeCents ?? 0, salesTaxCents: card.contractor?.salesTaxCents ?? 0 }));
    const result = await approvePeriod(sql, { periodId, userId: context.userId, daycareId: data.daycareId, start: data.start, end: data.end, payDate: data.payDate, stubs, drafts });
    if (!result.ok) throw new Error(`payroll:${result.error}`);
    return { ok: true as const, stubs: result.stubs, contractorDrafts: drafts.length, moneyMoved: false as const };
  });

type PackInput = { daycareId?: string; from?: string; to?: string; remitter?: string; centreName?: string; locale?: string };

function packArgs(input: PackInput) {
  const from = day(input?.from);
  const to = day(input?.to);
  if (!from || !to || to < from) throw new Error("payroll:period");
  const remitter: RemitterType = input?.remitter === "quarterly" || input?.remitter === "accelerated1" || input?.remitter === "accelerated2" ? input.remitter : "regular";
  return {
    daycareId: id(input?.daycareId),
    from,
    to,
    remitter,
    centreName: String(input?.centreName ?? "").slice(0, 120),
    locale: input?.locale === "fr" ? ("fr" as const) : ("en" as const),
  };
}

/** One-click accountant pack: CSV files plus printable lines. Owner or payroll editor. */
export const payrollAccountantPack = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(packArgs)
  .handler(async ({ context, data }) => {
    noStore();
    requireOn();
    const sql = await getSql();
    if (!(await payAccess(sql, context.userId, data.daycareId)).editor) throw new Error("payroll:permission");
    const stubs = await loadStubs(sql, { userId: context.userId, daycareId: data.daycareId, from: data.from, to: data.to });
    const files = packFiles({ stubs, remitter: data.remitter, year: Number(data.to.slice(0, 4)) });
    if (!xeroSyncEnabled()) delete files["xero-manual-journal.csv"];
    return {
      files,
      pdfLines: packPdfLines({ centreName: data.centreName, from: data.from, to: data.to, stubs, remitter: data.remitter, locale: data.locale }),
      count: stubs.length,
    };
  });

/** Read-only JSON for future API partners. Behind the payroll flag; owner or payroll editor sign-in. */
export const payrollPackJson = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(packArgs)
  .handler(async ({ context, data }) => {
    noStore();
    requireOn();
    const sql = await getSql();
    if (!(await payAccess(sql, context.userId, data.daycareId)).editor) throw new Error("payroll:permission");
    const stubs = await loadStubs(sql, { userId: context.userId, daycareId: data.daycareId, from: data.from, to: data.to });
    return packJson({ daycareId: data.daycareId, from: data.from, to: data.to, stubs, remitter: data.remitter, year: Number(data.to.slice(0, 4)) });
  });

/** Mark a person as a student (Ontario, Alberta) or back to general minimum wage. Recorded with who and why. */
export const payrollWageClass = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; employeeId?: string; wageClass?: string; reason?: string }) => ({
    daycareId: id(input?.daycareId),
    employeeId: id(input?.employeeId),
    wageClass: (input?.wageClass === "student" ? "student" : "general") as "general" | "student",
    reason: String(input?.reason ?? "").trim().slice(0, 200),
  }))
  .handler(async ({ context, data }) => {
    requireOn();
    const reason = data.reason || (data.wageClass === "student" ? "Marked as a student" : "Back to general minimum wage");
    const today = new Date().toISOString().slice(0, 10);
    const saved = await setWageClass(await getSql(), { id: nid(), userId: context.userId, ...data, reason, today });
    if (!saved) throw new Error("payroll:permission");
    return { ok: true as const };
  });

/** Team members and who has pay access. Owner only. */
export const payrollEditors = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: id(input?.daycareId) }))
  .handler(async ({ context, data }) => {
    noStore();
    requireOn();
    const sql = await getSql();
    if (!(await payAccess(sql, context.userId, data.daycareId)).owner) return { owner: false as const, members: [] };
    return { owner: true as const, members: await listEditors(sql, context.userId, data.daycareId) };
  });

/** Give or remove pay access. Owner only. Writes an audit row. */
export const payrollSetEditor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; memberId?: string; grant?: boolean }) => ({
    daycareId: id(input?.daycareId),
    memberId: id(input?.memberId),
    grant: input?.grant === true,
  }))
  .handler(async ({ context, data }) => {
    requireOn();
    if (!data.memberId || data.memberId === context.userId) throw new Error("payroll:permission");
    const saved = await setEditor(await getSql(), { id: nid(), userId: context.userId, ...data });
    if (!saved) throw new Error("payroll:permission");
    return { ok: true as const, sent: false as const };
  });
