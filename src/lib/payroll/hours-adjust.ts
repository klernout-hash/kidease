/**
 * Daily hours from check-ins, with owner changes.
 *
 * - Each day shows check-in, check-out, and hours worked out automatically.
 * - The owner (or staff with pay permission) can change a day. A short reason is required.
 * - A changed day shows "Adjusted" with the original beside it.
 * - Every change, reset, and flag writes an audit row: who, when, old, new, reason.
 * - Staff see the adjusted hours and the reason, and can flag a day as wrong.
 * - "Reset to check-in times" undoes the change.
 * - Approved pay periods lock. A change to a locked day becomes a correction
 *   line on the next pay instead of editing the old one.
 */

export const DEFAULT_TIME_ZONE = "America/Toronto";
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export type Punch = {
  id: string;
  employeeId: string;
  clockIn: string;
  clockOut: string | null;
  unpaidBreakMinutes: number;
};

export type Adjustment = {
  id: string;
  employeeId: string;
  workDate: string;
  /** New minutes for the day. null means this row is a reset. */
  minutes: number | null;
  reason: string;
  actorId: string;
  at: string;
};

export type DayFlag = { employeeId: string; workDate: string; note: string; at: string; open: boolean };

export type AuditRow = {
  id: string;
  employeeId: string;
  workDate: string;
  action: "adjust" | "reset" | "flag";
  oldMinutes: number | null;
  newMinutes: number | null;
  reason: string;
  actorId: string;
  at: string;
};

export type DayRow = {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  autoMinutes: number;
  minutes: number;
  adjusted: boolean;
  originalMinutes: number | null;
  reason: string | null;
  adjustedBy: string | null;
  adjustedAt: string | null;
  missedCheckout: boolean;
  flagged: boolean;
  flagNote: string | null;
  locked: boolean;
};

export function localDate(iso: string, timeZone = DEFAULT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function punchMinutes(punch: Punch): number {
  if (!punch.clockOut) return 0;
  const start = Date.parse(punch.clockIn);
  const end = Date.parse(punch.clockOut);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.round((end - start) / 60_000) - Math.max(0, punch.unpaidBreakMinutes));
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return out;
  for (let t = start; t <= end && out.length < 62; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** The latest adjustment for each day wins. A reset clears it. */
function latestAdjustments(adjustments: readonly Adjustment[]): Map<string, Adjustment> {
  const map = new Map<string, Adjustment>();
  const sorted = [...adjustments].sort((a, b) => a.at.localeCompare(b.at));
  for (const row of sorted) {
    if (row.minutes == null) map.delete(row.workDate);
    else map.set(row.workDate, row);
  }
  return map;
}

export function dayRows(input: {
  employeeId: string;
  from: string;
  to: string;
  punches: readonly Punch[];
  adjustments: readonly Adjustment[];
  flags?: readonly DayFlag[];
  lockedThrough?: string | null;
  now: Date;
  timeZone?: string;
}): DayRow[] {
  const tz = input.timeZone ?? DEFAULT_TIME_ZONE;
  const mine = input.punches.filter((punch) => punch.employeeId === input.employeeId);
  const adjustments = latestAdjustments(input.adjustments.filter((row) => row.employeeId === input.employeeId));
  const flags = (input.flags ?? []).filter((flag) => flag.employeeId === input.employeeId && flag.open);
  return eachDate(input.from, input.to).map((date) => {
    const today = mine.filter((punch) => localDate(punch.clockIn, tz) === date).sort((a, b) => a.clockIn.localeCompare(b.clockIn));
    const autoMinutes = today.reduce((sum, punch) => sum + punchMinutes(punch), 0);
    const open = today.find((punch) => !punch.clockOut);
    const missed = Boolean(open && input.now.getTime() - Date.parse(open.clockIn) > TWELVE_HOURS);
    const adjustment = adjustments.get(date);
    const flag = flags.find((row) => row.workDate === date);
    const lastOut = [...today].reverse().find((punch) => punch.clockOut)?.clockOut ?? null;
    return {
      date,
      checkIn: today[0]?.clockIn ?? null,
      checkOut: open ? null : lastOut,
      autoMinutes,
      minutes: adjustment ? Math.max(0, adjustment.minutes ?? 0) : autoMinutes,
      adjusted: Boolean(adjustment),
      originalMinutes: adjustment ? autoMinutes : null,
      reason: adjustment?.reason ?? null,
      adjustedBy: adjustment?.actorId ?? null,
      adjustedAt: adjustment?.at ?? null,
      missedCheckout: missed,
      flagged: Boolean(flag),
      flagNote: flag?.note ?? null,
      locked: input.lockedThrough != null && date <= input.lockedThrough,
    };
  });
}

export function validAdjustReason(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= 3 && trimmed.length <= 200;
}

/** Parse "7.5", "7:30", or "7h30" into minutes. */
export function parseHours(value: string): number | null {
  const text = value.trim().toLowerCase().replace(",", ".");
  let match = /^(\d{1,2})(?::|h)(\d{1,2})$/.exec(text);
  if (match) {
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return Number(match[2]) < 60 && minutes <= 24 * 60 ? minutes : null;
  }
  match = /^(\d{1,2})(\.\d{1,2})?$/.exec(text);
  if (!match) return null;
  const minutes = Math.round(Number(text) * 60);
  return minutes <= 24 * 60 ? minutes : null;
}

export type AdjustDecision =
  | { ok: true; audit: AuditRow; adjustment: Adjustment; correction: boolean }
  | { ok: false; error: "permission" | "reason" | "hours" };

/**
 * Plan a change to one day. When the day is in an approved (locked) period
 * the change is allowed but becomes a correction on the next pay.
 */
export function planAdjust(input: {
  canEditPay: boolean;
  row: DayRow;
  employeeId: string;
  newMinutes: number | null;
  reason: string;
  actorId: string;
  now: Date;
  id: string;
}): AdjustDecision {
  if (!input.canEditPay) return { ok: false, error: "permission" };
  if (!validAdjustReason(input.reason)) return { ok: false, error: "reason" };
  if (input.newMinutes == null || input.newMinutes < 0 || input.newMinutes > 24 * 60) return { ok: false, error: "hours" };
  const at = input.now.toISOString();
  const reason = input.reason.trim();
  return {
    ok: true,
    correction: input.row.locked,
    adjustment: { id: input.id, employeeId: input.employeeId, workDate: input.row.date, minutes: input.newMinutes, reason, actorId: input.actorId, at },
    audit: {
      id: input.id,
      employeeId: input.employeeId,
      workDate: input.row.date,
      action: "adjust",
      oldMinutes: input.row.minutes,
      newMinutes: input.newMinutes,
      reason,
      actorId: input.actorId,
      at,
    },
  };
}

export function planReset(input: { canEditPay: boolean; row: DayRow; employeeId: string; actorId: string; now: Date; id: string }): AdjustDecision {
  if (!input.canEditPay) return { ok: false, error: "permission" };
  const at = input.now.toISOString();
  const reason = "Reset to check-in times";
  return {
    ok: true,
    correction: input.row.locked,
    adjustment: { id: input.id, employeeId: input.employeeId, workDate: input.row.date, minutes: null, reason, actorId: input.actorId, at },
    audit: {
      id: input.id,
      employeeId: input.employeeId,
      workDate: input.row.date,
      action: "reset",
      oldMinutes: input.row.minutes,
      newMinutes: input.row.autoMinutes,
      reason,
      actorId: input.actorId,
      at,
    },
  };
}

export function planFlag(input: { samePerson: boolean; row: DayRow; employeeId: string; note: string; actorId: string; now: Date; id: string }):
  | { ok: true; flag: DayFlag; audit: AuditRow }
  | { ok: false; error: "own_hours" | "reason" } {
  if (!input.samePerson) return { ok: false, error: "own_hours" };
  if (!validAdjustReason(input.note)) return { ok: false, error: "reason" };
  const at = input.now.toISOString();
  const note = input.note.trim();
  return {
    ok: true,
    flag: { employeeId: input.employeeId, workDate: input.row.date, note, at, open: true },
    audit: { id: input.id, employeeId: input.employeeId, workDate: input.row.date, action: "flag", oldMinutes: input.row.minutes, newMinutes: null, reason: note, actorId: input.actorId, at },
  };
}

/** Staff view: their own hours and the reason for any change. Never the rate. */
export function staffDayView(row: DayRow): {
  date: string;
  minutes: number;
  adjusted: boolean;
  originalMinutes: number | null;
  reason: string | null;
  flagged: boolean;
  missedCheckout: boolean;
} {
  return {
    date: row.date,
    minutes: row.minutes,
    adjusted: row.adjusted,
    originalMinutes: row.originalMinutes,
    reason: row.reason,
    flagged: row.flagged,
    missedCheckout: row.missedCheckout,
  };
}

export function totalMinutes(rows: readonly DayRow[]): number {
  return rows.reduce((sum, row) => sum + row.minutes, 0);
}

/**
 * Corrections for days in a locked period: the difference between the
 * minutes that were paid and the minutes now on file, priced at the rate
 * that was used. Positive means the person is owed more.
 */
export function correctionLines(input: {
  paid: readonly { date: string; minutes: number; rateCents: number }[];
  now: readonly DayRow[];
}): { date: string; deltaMinutes: number; cents: number }[] {
  const out: { date: string; deltaMinutes: number; cents: number }[] = [];
  for (const paid of input.paid) {
    const row = input.now.find((day) => day.date === paid.date);
    if (!row) continue;
    const delta = row.minutes - paid.minutes;
    if (delta !== 0) out.push({ date: paid.date, deltaMinutes: delta, cents: Math.round((delta * paid.rateCents) / 60) });
  }
  return out;
}

export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}
