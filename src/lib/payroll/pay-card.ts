/**
 * One person's pay card for one pay period, and the checks before approval.
 * Pure: the screen recalculates live as the owner edits hours, rate, or pay type.
 */

import { estimatePay, type PayAddon, type PayEstimate, type PayFrequency, type PayYtd } from "./calculate.ts";
import { contractorPay, type ContractorPay } from "./contractor.ts";
import type { DayRow } from "./hours-adjust.ts";
import { minimumVacationBps, minimumWageCents, PAY_RULES, splitOvertime } from "./pay-rules.ts";
import { PAY_PERIODS, type Province } from "./tables.ts";

export type PayType = "hourly" | "salary" | "contractor";

export type PayPerson = {
  id: string;
  name: string;
  province: Province;
  payType: PayType;
  /** Hourly: cents per hour. Salary: cents per year. Contractor: agreed cents per pay. */
  rateCents: number;
  frequency: PayFrequency;
  vacationBps: number;
  vacationMode: "payout" | "bank";
  hireDate?: string | null;
  endDate?: string | null;
  td1: "approved" | "pending" | "missing";
  td1FederalCents?: number | null;
  td1ProvincialCents?: number | null;
  cppExempt?: boolean;
  eiExempt?: boolean;
  extraTaxCents?: number;
  extraTaxApproved?: boolean;
  contractorBasis?: "flat" | "base";
  gstRegistered?: boolean;
  gstNumber?: string | null;
};

export type PayPeriod = { start: string; end: string; payDate: string };

export type CardOverrides = {
  payType?: PayType;
  rateCents?: number;
  regularMinutes?: number;
  overtimeMinutes?: number;
  extraCents?: number;
};

export type PayCard = {
  personId: string;
  name: string;
  payType: PayType;
  rateCents: number;
  regularMinutes: number;
  overtimeMinutes: number;
  overtimeMultiplier: number | null;
  overtimeVerified: boolean;
  regularCents: number;
  overtimeCents: number;
  correctionCents: number;
  grossCents: number;
  vacationCents: number;
  deductionsCents: number;
  netCents: number;
  employee: PayEstimate | null;
  contractor: ContractorPay | null;
  checks: PreflightCheck[];
};

export type PreflightCheck = {
  code:
    | "missing_td1"
    | "over_60_hours"
    | "under_minimum_wage"
    | "minimum_wage_unverified"
    | "missed_checkout"
    | "zero_pay"
    | "mid_period_start"
    | "mid_period_end"
    | "overtime_unverified"
    | "vacation_below_law"
    | "flagged_day"
    | "no_table";
  level: "stop" | "check";
  source?: string;
  detail?: string;
};

/** Split days into Sunday-to-Saturday weeks. */
export function weeksOf(rows: readonly DayRow[]): DayRow[][] {
  const weeks = new Map<string, DayRow[]>();
  for (const row of rows) {
    const d = new Date(`${row.date}T12:00:00Z`);
    const sunday = new Date(d.getTime() - d.getUTCDay() * 86_400_000).toISOString().slice(0, 10);
    const list = weeks.get(sunday) ?? [];
    list.push(row);
    weeks.set(sunday, list);
  }
  return [...weeks.values()];
}

export function buildPayCard(input: {
  person: PayPerson;
  period: PayPeriod;
  days: readonly DayRow[];
  ytd?: Partial<PayYtd>;
  addons?: PayAddon[];
  corrections?: readonly { cents: number }[];
  overrides?: CardOverrides;
}): PayCard {
  const person = input.person;
  const o = input.overrides ?? {};
  const payType = o.payType ?? person.payType;
  const rateCents = Math.max(0, Math.round(o.rateCents ?? person.rateCents));
  const periods = PAY_PERIODS[person.frequency] ?? 26;

  let regularMinutes = 0;
  let overtimeMinutes = 0;
  let multiplier: number | null = null;
  let overtimeVerified = true;
  for (const week of weeksOf(input.days)) {
    const split = splitOvertime(
      person.province,
      week.map((row) => ({ date: row.date, minutes: row.minutes })),
    );
    regularMinutes += split.regularMinutes;
    overtimeMinutes += split.overtimeMinutes;
    multiplier = split.multiplier;
    overtimeVerified = split.verified;
  }
  if (o.regularMinutes != null) regularMinutes = Math.max(0, Math.round(o.regularMinutes));
  if (o.overtimeMinutes != null) overtimeMinutes = Math.max(0, Math.round(o.overtimeMinutes));
  const otMultiplier = multiplier ?? 1.5;

  const correctionCents = (input.corrections ?? []).reduce((sum, row) => sum + row.cents, 0);
  let regularCents = 0;
  let overtimeCents = 0;
  if (payType === "hourly") {
    regularCents = Math.round((regularMinutes * rateCents) / 60);
    overtimeCents = Math.round((overtimeMinutes * rateCents * otMultiplier) / 60);
  } else if (payType === "salary") {
    regularCents = Math.round(rateCents / periods);
    overtimeCents = 0;
  }

  const checks: PreflightCheck[] = [];
  let employee: PayEstimate | null = null;
  let contractor: ContractorPay | null = null;
  let grossCents: number;
  let vacationCents = 0;
  let deductionsCents = 0;
  let netCents: number;

  if (payType === "contractor") {
    contractor = contractorPay({
      basis: person.contractorBasis ?? "flat",
      amountCents: rateCents,
      extraCents: o.extraCents ?? 0,
      gstRegistered: person.gstRegistered === true,
      gstNumber: person.gstNumber ?? null,
      province: person.province,
    });
    grossCents = contractor.feeCents;
    netCents = contractor.totalCents + correctionCents;
  } else {
    const regularGross = regularCents + overtimeCents + correctionCents;
    employee = estimatePay({
      province: person.province,
      frequency: person.frequency,
      payDate: input.period.payDate,
      regularGrossCents: Math.max(0, regularGross),
      vacationBps: person.vacationBps,
      vacationMode: person.vacationMode,
      ytd: input.ytd,
      td1FederalCents: person.td1 === "approved" ? person.td1FederalCents ?? undefined : undefined,
      td1ProvincialCents: person.td1 === "approved" ? person.td1ProvincialCents ?? undefined : undefined,
      cppExempt: person.cppExempt,
      eiExempt: person.eiExempt,
      addons: input.addons,
      extraTaxCents: person.extraTaxCents,
      extraTaxApproved: person.extraTaxApproved,
    });
    grossCents = employee.cashGrossCents;
    vacationCents = employee.vacationCents;
    netCents = employee.netCents;
    deductionsCents = employee.blocked ? 0 : grossCents + employee.nontaxCashCents - netCents;
    if (employee.blocked) checks.push({ code: "no_table", level: "stop", detail: employee.blocked });
    if (person.td1 !== "approved") checks.push({ code: "missing_td1", level: "check" });
    const lawBps = minimumVacationBps(person.province, person.hireDate, input.period.end);
    if (lawBps != null && person.vacationBps < lawBps) {
      checks.push({ code: "vacation_below_law", level: "check", source: PAY_RULES[person.province].vacation.source, detail: `${lawBps / 100}%` });
    }
  }

  for (const week of weeksOf(input.days)) {
    const minutes = week.reduce((sum, row) => sum + row.minutes, 0);
    if (minutes > 60 * 60) checks.push({ code: "over_60_hours", level: "check", detail: week[0]?.date });
  }
  if (input.days.some((row) => row.missedCheckout)) checks.push({ code: "missed_checkout", level: "stop" });
  if (input.days.some((row) => row.flagged)) checks.push({ code: "flagged_day", level: "check" });
  if (payType === "hourly") {
    const floor = minimumWageCents(person.province, input.period.end);
    const rule = PAY_RULES[person.province].minimumWage;
    if (floor != null && rateCents < floor) checks.push({ code: "under_minimum_wage", level: "stop", source: rule.source, detail: String(floor) });
    if (floor == null) checks.push({ code: "minimum_wage_unverified", level: "check", source: rule.source });
    if (overtimeMinutes === 0 && !overtimeVerified) {
      const weekly = weeksOf(input.days).some((week) => week.reduce((sum, row) => sum + row.minutes, 0) > 40 * 60);
      if (weekly) checks.push({ code: "overtime_unverified", level: "check", source: PAY_RULES[person.province].overtime.source });
    }
  }
  if (grossCents <= 0) checks.push({ code: "zero_pay", level: "check" });
  if (person.hireDate && person.hireDate > input.period.start && person.hireDate <= input.period.end) {
    checks.push({ code: "mid_period_start", level: "check", detail: person.hireDate });
  }
  if (person.endDate && person.endDate >= input.period.start && person.endDate < input.period.end) {
    checks.push({ code: "mid_period_end", level: "check", detail: person.endDate });
  }

  return {
    personId: person.id,
    name: person.name,
    payType,
    rateCents,
    regularMinutes,
    overtimeMinutes,
    overtimeMultiplier: payType === "hourly" ? otMultiplier : null,
    overtimeVerified,
    regularCents,
    overtimeCents,
    correctionCents,
    grossCents,
    vacationCents,
    deductionsCents,
    netCents,
    employee,
    contractor,
    checks,
  };
}

/** Approve is allowed when no card has a "stop" check. */
export function canApprove(cards: readonly PayCard[]): boolean {
  return cards.length > 0 && cards.every((card) => card.checks.every((check) => check.level !== "stop"));
}

/** Search the staff list by name. Case and accent insensitive. */
export function searchPeople<T extends { name: string }>(people: readonly T[], query: string): T[] {
  const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const needle = fold(query.trim());
  const sorted = [...people].sort((a, b) => fold(a.name).localeCompare(fold(b.name)));
  if (!needle) return sorted;
  return sorted.filter((person) => fold(person.name).includes(needle));
}

/** The picker becomes searchable when there are many people. */
export const SEARCHABLE_AFTER = 8;
