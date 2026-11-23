/**
 * Shifts become hours. Ontario overtime is estimated. Other provinces are not.
 */

import { OVERTIME_2026 } from "./rates-2026.ts";

export type RoundStep = 0 | 5 | 15;

export type ShiftSpan = {
  id: string;
  employeeId: string;
  name: string;
  clockIn: string;
  clockOut: string | null;
  unpaidBreakMinutes: number;
  source: "phone" | "kiosk" | "manual";
  approval: "pending" | "approved";
  reason: string;
};

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export function roundMinutes(minutes: number, step: RoundStep): number {
  if (step !== 5 && step !== 15) return Math.max(0, Math.round(minutes));
  return Math.max(0, Math.round(minutes / step) * step);
}

export function paidMinutes(input: {
  clockIn: string;
  clockOut: string;
  unpaidBreakMinutes: number;
  roundStep: RoundStep;
}): number | null {
  const start = Date.parse(input.clockIn);
  const end = Date.parse(input.clockOut);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const raw = (end - start) / 60_000 - Math.max(0, input.unpaidBreakMinutes);
  if (raw <= 0) return 0;
  return roundMinutes(raw, input.roundStep);
}

export function missedCheckout(clockIn: string, clockOut: string | null, now: Date): boolean {
  if (clockOut) return false;
  const start = Date.parse(clockIn);
  if (!Number.isFinite(start)) return false;
  return now.getTime() - start > TWELVE_HOURS;
}

export type WeekHours = {
  employeeId: string;
  name: string;
  regularMinutes: number;
  overtimeMinutes: number;
  open: number;
  pending: number;
  overtimeVerified: boolean;
  note: string;
};

/** Group closed, approved shifts. Open or unapproved shifts are counted, not paid. */
export function weekHours(input: {
  province: string;
  shifts: readonly ShiftSpan[];
  now: Date;
  roundStep: RoundStep;
  approvedOnly?: boolean;
}): WeekHours[] {
  const rule = OVERTIME_2026[input.province.toUpperCase() as "ON"];
  const byEmployee = new Map<string, WeekHours>();
  for (const shift of input.shifts) {
    const row = byEmployee.get(shift.employeeId) ?? {
      employeeId: shift.employeeId,
      name: shift.name,
      regularMinutes: 0,
      overtimeMinutes: 0,
      open: 0,
      pending: 0,
      overtimeVerified: Boolean(rule?.verified),
      note: rule?.verified
        ? "After 44 hours in the week, extra hours are estimated at time and a half. Ontario rule."
        : "Overtime is not estimated for this province. Hours are still counted. Add extra pay if you owe it.",
    };
    if (!shift.clockOut || missedCheckout(shift.clockIn, shift.clockOut, input.now)) {
      if (!shift.clockOut) row.open += 1;
    }
    if (shift.approval !== "approved") row.pending += 1;
    const include = shift.clockOut && (!input.approvedOnly || shift.approval === "approved");
    if (include && shift.clockOut) {
      const minutes = paidMinutes({
        clockIn: shift.clockIn,
        clockOut: shift.clockOut,
        unpaidBreakMinutes: shift.unpaidBreakMinutes,
        roundStep: input.roundStep,
      });
      if (minutes != null) row.regularMinutes += minutes;
    }
    byEmployee.set(shift.employeeId, row);
  }
  const threshold = rule?.verified ? rule.weeklyHours * 60 : null;
  for (const row of byEmployee.values()) {
    if (threshold != null && row.regularMinutes > threshold) {
      row.overtimeMinutes = row.regularMinutes - threshold;
      row.regularMinutes = threshold;
    }
  }
  return [...byEmployee.values()];
}

export function grossFromHours(input: {
  regularMinutes: number;
  overtimeMinutes: number;
  hourlyCents: number;
  overtimeMultiplier: number;
}): number {
  const regular = Math.round((input.regularMinutes * input.hourlyCents) / 60);
  const overtime = Math.round((input.overtimeMinutes * input.hourlyCents * input.overtimeMultiplier) / 60);
  return regular + overtime;
}

export function salaryPeriodCents(annualCents: number, periods: number): number {
  if (periods <= 0) return 0;
  return Math.round(annualCents / periods);
}

export function validManualReason(reason: string): boolean {
  return reason.trim().length >= 8;
}

export function validPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/** Reject a full bank account. A partner token or a 4-digit hint is allowed. */
export function planBank(token: string, last4: string):
  | { ok: true; token: string | null; last4: string | null }
  | { ok: false; error: "bank_number" } {
  const cleaned = token.trim();
  const hint = last4.trim();
  if (/\d{5,}/.test(cleaned) || /\d{5,}/.test(hint)) return { ok: false, error: "bank_number" };
  if (hint && !/^\d{4}$/.test(hint)) return { ok: false, error: "bank_number" };
  return { ok: true, token: cleaned ? cleaned.slice(0, 80) : null, last4: hint || null };
}
