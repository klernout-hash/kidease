/**
 * Drop-off and pick-up reminders for one parent and one child.
 * Each login keeps its own times. The clock uses that parent's saved time zone.
 * DST uses the same local-to-UTC conversion as tour windows.
 */

import { CANADA_TOUR_TIMEZONES, zonedLocalToUtc } from "./tour-calendar.ts";

export const CARE_REMINDER_FLAG = "FEATURE_CARE_REMINDERS";
export const CARE_LEAD_MINUTES = [15, 30, 60] as const;
export type CareLeadMinutes = (typeof CARE_LEAD_MINUTES)[number];
export type CareKind = "dropoff" | "pickup";

export const REMINDER_WINDOW_MS = 10 * 60 * 1000;

export type CareDay = {
  weekday: number;
  dropoff: string | null;
  pickup: string | null;
  dropoffOn: boolean;
  pickupOn: boolean;
};

export type CareReminderPlan = {
  userId: string;
  childId: string;
  masterOn: boolean;
  sameEveryDay: boolean;
  leadMinutes: number;
  days: CareDay[];
};

export type DueReminder = {
  userId: string;
  childId: string;
  kind: CareKind;
  localDate: string;
  localTime: string;
};

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function knownCareZone(value: string | null | undefined): string | null {
  const zone = String(value || "").trim();
  return (CANADA_TOUR_TIMEZONES as readonly string[]).includes(zone) ? zone : null;
}

export function parseLeadMinutes(value: unknown): CareLeadMinutes | null {
  const n = Number(value);
  return n === 15 || n === 30 || n === 60 ? n : null;
}

export function parseClock(value: unknown): string | null {
  const time = String(value ?? "").trim().slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null;
}

export function zonedDay(now: Date, timeZone: string): { date: string; weekday: number } | null {
  const zone = knownCareZone(timeZone);
  if (!zone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
    const weekday = WEEKDAY[get("weekday")];
    const date = `${get("year")}-${get("month")}-${get("day")}`;
    if (weekday == null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return { date, weekday };
  } catch {
    return null;
  }
}

export function dayPlan(reminder: CareReminderPlan, weekday: number): CareDay | null {
  if (reminder.sameEveryDay) return reminder.days.find((day) => day.weekday === -1) ?? null;
  return reminder.days.find((day) => day.weekday === weekday) ?? null;
}

/** Skip only when every enrolled centre marked that date closed. No row means open. */
export function closedForChild(input: {
  enrolledDaycareIds: readonly string[];
  closedDaycareIds: readonly string[];
}) {
  if (!input.enrolledDaycareIds.length) return false;
  const closed = new Set(input.closedDaycareIds);
  return input.enrolledDaycareIds.every((id) => closed.has(id));
}

export function reminderChannels(pushOn: boolean): { inApp: true; push: boolean; sms: false } {
  return { inApp: true, push: pushOn === true, sms: false };
}

export function dueReminders(input: {
  now: Date;
  zone: string | null;
  reminder: CareReminderPlan;
  closed: boolean;
  sentKeys: readonly string[];
  windowMs?: number;
}): DueReminder[] {
  if (!input.reminder.masterOn || input.closed) return [];
  const lead = parseLeadMinutes(input.reminder.leadMinutes);
  const day = input.zone ? zonedDay(input.now, input.zone) : null;
  if (!lead || !day || !input.zone) return [];
  const plan = dayPlan(input.reminder, day.weekday);
  if (!plan) return [];
  const windowMs = input.windowMs ?? REMINDER_WINDOW_MS;
  const sent = new Set(input.sentKeys);
  const out: DueReminder[] = [];
  const kinds: Array<[CareKind, boolean, string | null]> = [
    ["dropoff", plan.dropoffOn, plan.dropoff],
    ["pickup", plan.pickupOn, plan.pickup],
  ];
  for (const [kind, on, clock] of kinds) {
    const time = parseClock(clock);
    if (!on || !time) continue;
    const key = `${input.reminder.userId}:${input.reminder.childId}:${kind}:${day.date}`;
    if (sent.has(key)) continue;
    const event = zonedLocalToUtc(day.date, time, input.zone);
    if (!event) continue;
    const fireAt = event.getTime() - lead * 60 * 1000;
    const age = input.now.getTime() - fireAt;
    if (age < 0 || age >= windowMs) continue;
    out.push({
      userId: input.reminder.userId,
      childId: input.reminder.childId,
      kind,
      localDate: day.date,
      localTime: time,
    });
  }
  return out;
}
