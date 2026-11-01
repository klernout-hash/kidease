/**
 * Licence and compliance dates. Pure: no database and no secrets.
 * FEATURE_COMPLIANCE_CALENDAR defaults off. Practice mode logs reminders.
 */

import type { EnvMap } from "../flags.ts";
import type { ProvinceCode } from "../gov/places.ts";
import { canSeeProvince, modeFor, type PackMode } from "./mode.ts";

export const CALENDAR_FLAG = "FEATURE_COMPLIANCE_CALENDAR";
export const CALENDAR_LIVE_FLAG = "FEATURE_COMPLIANCE_CALENDAR_LIVE";

export const CALENDAR_KINDS = [
  "licence_renewal",
  "inspection",
  "fire_drill",
  "food_safety",
  "first_aid",
] as const;

export type CalendarKind = (typeof CALENDAR_KINDS)[number];
export const REMINDER_DAYS = [60, 30, 7] as const;
export type ReminderDay = (typeof REMINDER_DAYS)[number];

export type LicenceTerm = {
  province: ProvinceCode;
  months: number;
  verified: boolean;
  source: string;
};

export const LICENCE_TERMS: readonly LicenceTerm[] = [
  {
    province: "MB",
    months: 12,
    verified: true,
    source:
      "Child Care Facilities Licensing Regulation, M.R. 17/99, s. 4(7): a licence is valid for one year. https://web2.gov.mb.ca/laws/regs/current/017-99.php",
  },
  {
    province: "ON",
    months: 24,
    verified: true,
    source:
      "O. Reg. 137/15, s. 85.2: a director may issue or renew a licence for a maximum of two years. The licence itself shows the real end date. https://www.ontario.ca/laws/regulation/150137",
  },
  ...(["AB", "BC", "NB", "NL", "NS", "NT", "NU", "PE", "QC", "SK", "YT"] as const).map(
    (province): LicenceTerm => ({
      province,
      months: 12,
      verified: false,
      source: "PLACEHOLDER. One year is a KidEase reminder only. Confirm the licence term with the province.",
    }),
  ),
];

export function calendarMode(env: EnvMap): PackMode {
  return modeFor(CALENDAR_FLAG, env);
}

export function isCalendarKind(value: string): value is CalendarKind {
  return (CALENDAR_KINDS as readonly string[]).includes(value);
}

export function licenceTerm(province: string): LicenceTerm | null {
  const code = String(province || "").trim().toUpperCase();
  return LICENCE_TERMS.find((row) => row.province === code) ?? null;
}

function dayStamp(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.parse(`${iso}T12:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

export function daysUntil(dueOn: string, today: string): number | null {
  const due = dayStamp(dueOn);
  const now = dayStamp(today);
  if (due == null || now == null) return null;
  return Math.round((due - now) / 86_400_000);
}

export function reminderDue(dueOn: string, today: string): ReminderDay | null {
  const days = daysUntil(dueOn, today);
  if (days == null) return null;
  return REMINDER_DAYS.find((mark) => days === mark) ?? null;
}

export function isOverdue(dueOn: string, today: string, completed: boolean): boolean {
  if (completed) return false;
  const days = daysUntil(dueOn, today);
  return days != null && days < 0;
}

export function reminderPlan(input: {
  mode: PackMode;
  dueOn: string;
  today: string;
  completed: boolean;
  alreadyRemindedDay: number | null;
}): { remind: boolean; day: ReminderDay | null; delivery: "skip" | "log" | "send"; reason: string } {
  if (input.mode === "off") return { remind: false, day: null, delivery: "skip", reason: "off" };
  if (input.completed) return { remind: false, day: null, delivery: "skip", reason: "done" };
  const day = reminderDue(input.dueOn, input.today);
  if (!day) return { remind: false, day: null, delivery: "skip", reason: "not_due" };
  if (input.alreadyRemindedDay === day) return { remind: false, day, delivery: "skip", reason: "duplicate" };
  if (input.mode === "dry_run") return { remind: true, day, delivery: "log", reason: "practice" };
  return { remind: true, day, delivery: "send", reason: "live" };
}

export type OverdueFlag = { daycareId: string; kind: CalendarKind; dueOn: string; province: string };

/** Government list is dates and counts. No child fields exist on these rows. */
export function overdueForProvince(
  rows: readonly OverdueFlag[],
  input: { role: string; govProvince: string | null; orgProvince?: string | null },
  today: string,
): OverdueFlag[] {
  return rows.filter((row) => {
    if (!isOverdue(row.dueOn, today, false)) return false;
    return canSeeProvince({ ...input, rowProvince: row.province });
  });
}

export function calendarCopy(locale: "en" | "fr") {
  if (locale === "fr") {
    return {
      what: "KidEase pour les garderies",
      why: "Voyez le renouvellement du permis, les inspections, les exercices d’incendie, la salubrité et les premiers soins.",
      next: "Ajouter une date",
      help: "Aide",
      home: "Accueil",
      off: "Cet outil est éteint. Aucun rappel n’est envoyé.",
      practice: "Mode pratique : les rappels sont écrits, pas envoyés.",
      empty: "Aucune date pour l’instant.",
      govWhat: "KidEase pour votre province",
      govWhy: "Voyez les dates en retard dans votre province. Aucun renseignement sur un enfant.",
    };
  }
  return {
    what: "KidEase for daycares",
    why: "Track licence renewal, inspections, fire drills, food safety, and first aid.",
    next: "Add a date",
    help: "Help",
    home: "Home",
    off: "This tool is off. No reminders are sent.",
    practice: "Practice mode: reminders are written down, not sent.",
    empty: "No dates yet.",
    govWhat: "KidEase for your province",
    govWhy: "See overdue dates in your province. No child details.",
  };
}

export { canSeeProvince };
