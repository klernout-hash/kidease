/**
 * Centre calendar dates. No database.
 * A day is YYYY-MM-DD in the centre's timezone, never a UTC slice of "now".
 */

export type SpotCounts = { infant: number; toddler: number; preschool: number };

export type CalendarDayRow = SpotCounts & { day: string; closed: boolean };

export type HolidayLabel = { en: string; fr: string };

const FALLBACK_ZONE = "America/Winnipeg";

export function clampSpots(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(200, n);
}

export function spotTotal(spots: SpotCounts, closed = false): number {
  if (closed) return 0;
  return clampSpots(spots.infant) + clampSpots(spots.toddler) + clampSpots(spots.preschool);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isIsoMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value) && isIsoDate(`${value}-01`);
}

export function isoFromUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoFromUtc(new Date(Date.UTC(y, m - 1, d + days)));
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Postgres date or a YYYY-MM-DD string. Date values use UTC parts so a date column does not slip a day. */
export function dayKey(value: unknown): string {
  if (typeof value === "string") {
    const head = value.slice(0, 10);
    return isIsoDate(head) ? head : "";
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return isoFromUtc(value);
  return "";
}

export function safeTimeZone(timeZone: string | null | undefined): string {
  const zone = String(timeZone || "").trim() || FALLBACK_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return FALLBACK_ZONE;
  }
}

/** Calendar day in the centre timezone. Do not use toISOString().slice(0, 10). */
export function centreDateISO(timeZone: string | null | undefined, now = new Date()): string {
  const zone = safeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((part) => part.type === "year")?.value;
  const m = parts.find((part) => part.type === "month")?.value;
  const d = parts.find((part) => part.type === "day")?.value;
  if (!y || !m || !d) return isoFromUtc(now);
  return `${y}-${m}-${d}`;
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export type MonthCell = { date: string; inMonth: boolean };

/** Sunday-first month grid. Blank cells have an empty date. Built with UTC calendar math, not local midnight. */
export function monthGrid(month: string): MonthCell[] {
  if (!isIsoMonth(month)) return [];
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = first.getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: MonthCell[] = [];
  for (let i = 0; i < lead; i++) cells.push({ date: "", inMonth: false });
  for (let day = 1; day <= days; day++) {
    cells.push({ date: isoFromUtc(new Date(Date.UTC(y, m - 1, day))), inMonth: true });
  }
  while (cells.length % 7 !== 0) cells.push({ date: "", inMonth: false });
  return cells;
}

export function weekdayLabels(locale: string): string[] {
  const tag = locale === "fr" ? "fr-CA" : "en-CA";
  const sunday = new Date(Date.UTC(2023, 0, 1));
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(tag, { weekday: "narrow", timeZone: "UTC" }).format(
      new Date(sunday.getTime() + i * 86400000),
    ),
  );
}

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return isoFromUtc(new Date(Date.UTC(year, month - 1, 1 + shift + (n - 1) * 7)));
}

/** Anonymous Gregorian computus. Returns Easter Sunday as YYYY-MM-DD. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoFromUtc(new Date(Date.UTC(year, month - 1, day)));
}

function victoriaDay(year: number): string {
  const may24 = new Date(Date.UTC(year, 4, 24));
  const dow = may24.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  return isoFromUtc(new Date(Date.UTC(year, 4, 24 - back)));
}

const FAMILY_DAY = new Set(["AB", "BC", "MB", "NB", "NS", "ON", "PE", "SK"]);
const VICTORIA = new Set(["AB", "BC", "MB", "NB", "ON", "QC", "SK"]);
const THANKSGIVING = new Set(["AB", "BC", "MB", "ON", "QC", "SK"]);
const BOXING = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "SK", "YT"]);
const REMEMBRANCE = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "PE", "SK", "YT"]);

/**
 * Statutory-style labels for the calendar. A holiday bar is not a closure.
 * The centre marks closed on its own.
 */
export function holidayOn(iso: string, province: string | null | undefined): HolidayLabel | null {
  if (!isIsoDate(iso)) return null;
  const code = String(province || "").trim().toUpperCase();
  const year = Number(iso.slice(0, 4));
  const easter = easterSunday(year);
  const named: Array<[string, HolidayLabel]> = [
    [`${year}-01-01`, { en: "New Year's Day", fr: "Jour de l'An" }],
    [addIsoDays(easter, -2), { en: "Good Friday", fr: "Vendredi saint" }],
    [`${year}-07-01`, { en: "Canada Day", fr: "Fête du Canada" }],
    [nthWeekday(year, 9, 1, 1), { en: "Labour Day", fr: "Fête du Travail" }],
    [`${year}-12-25`, { en: "Christmas", fr: "Noël" }],
  ];
  if (FAMILY_DAY.has(code)) {
    named.push([
      nthWeekday(year, 2, 1, 3),
      code === "MB"
        ? { en: "Louis Riel Day", fr: "Journée Louis Riel" }
        : code === "NS"
          ? { en: "Heritage Day", fr: "Journée du patrimoine" }
          : code === "PE"
            ? { en: "Islander Day", fr: "Journée des Insulaires" }
            : { en: "Family Day", fr: "Journée de la famille" },
    ]);
  }
  if (code === "QC") named.push([addIsoDays(easter, 1), { en: "Easter Monday", fr: "Lundi de Pâques" }]);
  if (VICTORIA.has(code)) {
    named.push([
      victoriaDay(year),
      code === "QC"
        ? { en: "National Patriots' Day", fr: "Journée nationale des patriotes" }
        : { en: "Victoria Day", fr: "Fête de la Reine" },
    ]);
  }
  if (THANKSGIVING.has(code)) named.push([nthWeekday(year, 10, 1, 2), { en: "Thanksgiving", fr: "Action de grâce" }]);
  if (BOXING.has(code)) named.push([`${year}-12-26`, { en: "Boxing Day", fr: "Lendemain de Noël" }]);
  if (REMEMBRANCE.has(code)) named.push([`${year}-11-11`, { en: "Remembrance Day", fr: "Jour du Souvenir" }]);
  named.push([`${year}-09-30`, { en: "Truth and Reconciliation", fr: "Vérité et réconciliation" }]);
  return named.find((row) => row[0] === iso)?.[1] ?? null;
}

export type AvailabilityMonth = { month: string; infant: number; toddler: number; preschool: number };

/** Replace one month on the public availability list. Other months stay. */
export function patchAvailabilityMonth(rows: AvailabilityMonth[], month: string, spots: SpotCounts): AvailabilityMonth[] {
  const next = rows.filter((row) => row.month !== month);
  next.push({
    month,
    infant: clampSpots(spots.infant),
    toddler: clampSpots(spots.toddler),
    preschool: clampSpots(spots.preschool),
  });
  next.sort((a, b) => a.month.localeCompare(b.month));
  return next;
}

export type PublicSpotOverlay = SpotCounts & { closed: boolean; updatedAt: string };

/**
 * Today's saved row wins. A closed day is 0 spots.
 * No row means leave the listing's standing counts alone.
 */
export function publicSpotsFromCalendar(row: CalendarDayRow | null, updatedAt: string | null): PublicSpotOverlay | null {
  if (!row) return null;
  return {
    infant: row.closed ? 0 : clampSpots(row.infant),
    toddler: row.closed ? 0 : clampSpots(row.toddler),
    preschool: row.closed ? 0 : clampSpots(row.preschool),
    closed: row.closed,
    updatedAt: updatedAt || "",
  };
}

export function spotsChanged(before: SpotCounts, after: SpotCounts): boolean {
  return (
    clampSpots(before.infant) !== clampSpots(after.infant) ||
    clampSpots(before.toddler) !== clampSpots(after.toddler) ||
    clampSpots(before.preschool) !== clampSpots(after.preschool)
  );
}
