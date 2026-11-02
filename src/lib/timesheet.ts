/**
 * Staff hours for a daycare desk. Clock in, clock out, edit with a note,
 * weekly totals, and a CSV file. The week starts Monday in Toronto.
 * KidEase records hours. It does not pay wages.
 */

export const TIMESHEET_FLAG = "FEATURE_STAFF_TIMESHEETS";
export const TIMESHEET_TZ = "America/Toronto";
export const MAX_SHIFT_MS = 16 * 60 * 60 * 1000;

export type TimeEntry = {
  id: string;
  staffName: string;
  clockIn: string;
  clockOut: string | null;
};

export type AuditChange = {
  field: "staff_name" | "clock_in" | "clock_out";
  before: string;
  after: string;
};

export type WeekTotals = {
  staffName: string;
  hours: number;
  open: number;
};

const WEEKDAY: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function normalizeStaffName(raw: unknown): string | null {
  const name = String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return name.length >= 2 ? name : null;
}

function tzOffsetMinutes(date: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIMESHEET_TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

export function formatToronto(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMESHEET_TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function torontoMidnightUtc(ymd: string): Date {
  const guess = Date.parse(`${ymd}T00:00:00Z`);
  const offset = tzOffsetMinutes(new Date(guess));
  let utc = guess - offset * 60_000;
  const offset2 = tzOffsetMinutes(new Date(utc));
  utc = guess - offset2 * 60_000;
  return new Date(utc);
}

function ymdInToronto(date: Date): string {
  return formatToronto(date.toISOString()).slice(0, 10);
}

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  const yyyy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function weekdayIndex(date: Date): number {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: TIMESHEET_TZ, weekday: "short" }).format(date);
  return WEEKDAY[label] ?? 0;
}

/** Monday 00:00 through the next Monday, America/Toronto. */
export function torontoWeek(anchor: Date): {
  startMs: number;
  endMs: number;
  startIso: string;
  endIso: string;
  label: string;
} {
  const startYmd = addDays(ymdInToronto(anchor), -weekdayIndex(anchor));
  const endYmd = addDays(startYmd, 7);
  const start = torontoMidnightUtc(startYmd);
  const end = torontoMidnightUtc(endYmd);
  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: `${startYmd} to ${addDays(startYmd, 6)}`,
  };
}

/** Read a clock time typed as Toronto local time. */
export function torontoLocalToIso(local: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(String(local || "").trim());
  if (!match) return null;
  const guess = Date.parse(`${match[1]}T${match[2]}:${match[3]}:00Z`);
  if (!Number.isFinite(guess)) return null;
  const offset = tzOffsetMinutes(new Date(guess));
  let utc = guess - offset * 60_000;
  const offset2 = tzOffsetMinutes(new Date(utc));
  utc = guess - offset2 * 60_000;
  return new Date(utc).toISOString();
}

export function isoToTorontoLocal(iso: string): string {
  return formatToronto(iso).replace(" ", "T");
}

export function planClockIn(input: {
  staffName: unknown;
  at: Date;
  openNames: readonly string[];
}): { ok: true; staffName: string; clockIn: string } | { ok: false; error: "name" | "open" } {
  const staffName = normalizeStaffName(input.staffName);
  if (!staffName) return { ok: false, error: "name" };
  const key = staffName.toLowerCase();
  if (input.openNames.some((name) => name.trim().toLowerCase() === key)) return { ok: false, error: "open" };
  return { ok: true, staffName, clockIn: input.at.toISOString() };
}

export function shiftHours(clockIn: string, clockOut: string): number | null {
  const start = Date.parse(clockIn);
  const end = Date.parse(clockOut);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  if (end - start > MAX_SHIFT_MS) return null;
  return Math.round((end - start) / 360000) / 10;
}

export function planClockOut(
  entry: TimeEntry,
  at: Date,
): { ok: true; clockOut: string; hours: number; change: AuditChange } | { ok: false; error: "closed" | "order" | "long" } {
  if (entry.clockOut) return { ok: false, error: "closed" };
  const clockOut = at.toISOString();
  const start = Date.parse(entry.clockIn);
  const end = at.getTime();
  if (!Number.isFinite(start) || end <= start) return { ok: false, error: "order" };
  if (end - start > MAX_SHIFT_MS) return { ok: false, error: "long" };
  return {
    ok: true,
    clockOut,
    hours: Math.round((end - start) / 360000) / 10,
    change: { field: "clock_out", before: "", after: clockOut },
  };
}

export function planTimesheetEdit(input: {
  entry: TimeEntry;
  staffName?: unknown;
  clockIn?: unknown;
  clockOut?: unknown;
  note?: unknown;
}):
  | { ok: true; next: TimeEntry; changes: AuditChange[]; note: string }
  | { ok: false; error: "name" | "time" | "order" | "long" | "same" | "note" } {
  const note = String(input.note || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 200);
  if (note.length < 2) return { ok: false, error: "note" };
  const staffName = input.staffName == null ? input.entry.staffName : normalizeStaffName(input.staffName);
  if (!staffName) return { ok: false, error: "name" };
  const clockIn = input.clockIn == null || input.clockIn === "" ? input.entry.clockIn : String(input.clockIn);
  if (Number.isNaN(Date.parse(clockIn))) return { ok: false, error: "time" };
  let clockOut = input.entry.clockOut;
  if (input.clockOut != null) {
    const raw = String(input.clockOut).trim();
    if (!raw) {
      if (input.entry.clockOut) return { ok: false, error: "time" };
      clockOut = null;
    } else {
      if (Number.isNaN(Date.parse(raw))) return { ok: false, error: "time" };
      clockOut = raw;
    }
  }
  if (clockOut) {
    const start = Date.parse(clockIn);
    const end = Date.parse(clockOut);
    if (end <= start) return { ok: false, error: "order" };
    if (end - start > MAX_SHIFT_MS) return { ok: false, error: "long" };
  }
  const next: TimeEntry = { id: input.entry.id, staffName, clockIn, clockOut };
  const changes: AuditChange[] = [];
  if (next.staffName !== input.entry.staffName) {
    changes.push({ field: "staff_name", before: input.entry.staffName, after: next.staffName });
  }
  if (next.clockIn !== input.entry.clockIn) {
    changes.push({ field: "clock_in", before: input.entry.clockIn, after: next.clockIn });
  }
  if ((next.clockOut || "") !== (input.entry.clockOut || "")) {
    changes.push({ field: "clock_out", before: input.entry.clockOut || "", after: next.clockOut || "" });
  }
  if (!changes.length) return { ok: false, error: "same" };
  return { ok: true, next, changes, note };
}

export function weeklyTotals(entries: readonly TimeEntry[], week: { startMs: number; endMs: number }): WeekTotals[] {
  const map = new Map<string, { staffName: string; ms: number; open: number }>();
  for (const entry of entries) {
    const start = Date.parse(entry.clockIn);
    if (!Number.isFinite(start) || start < week.startMs || start >= week.endMs) continue;
    const key = entry.staffName.trim().toLowerCase();
    const row = map.get(key) ?? { staffName: entry.staffName.trim(), ms: 0, open: 0 };
    if (!entry.clockOut) row.open += 1;
    else {
      const end = Date.parse(entry.clockOut);
      if (Number.isFinite(end) && end > start && end - start <= MAX_SHIFT_MS) row.ms += end - start;
    }
    map.set(key, row);
  }
  return [...map.values()]
    .map((row) => ({
      staffName: row.staffName,
      hours: Math.round(row.ms / 360000) / 10,
      open: row.open,
    }))
    .sort((a, b) => a.staffName.localeCompare(b.staffName, "en-CA"));
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function timesheetCsv(input: {
  entries: readonly TimeEntry[];
  totals: readonly WeekTotals[];
  locale: "en" | "fr";
}): string {
  const fr = input.locale === "fr";
  const head = fr ? "Personnel,Arrivée,Départ,Heures" : "Staff,Clock in,Clock out,Hours";
  const lines = [head];
  for (const entry of input.entries) {
    const hours = entry.clockOut ? shiftHours(entry.clockIn, entry.clockOut) : null;
    lines.push(
      [
        csvCell(entry.staffName),
        formatToronto(entry.clockIn),
        entry.clockOut ? formatToronto(entry.clockOut) : "",
        hours == null ? "" : hours.toFixed(1),
      ].join(","),
    );
  }
  lines.push("");
  lines.push(fr ? "Personnel,Heures cette semaine" : "Staff,Hours this week");
  for (const row of input.totals) lines.push(`${csvCell(row.staffName)},${row.hours.toFixed(1)}`);
  return `${lines.join("\n")}\n`;
}
