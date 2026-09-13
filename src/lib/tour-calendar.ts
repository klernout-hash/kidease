/**
 * Tour calendar v1 — centre-posted visit windows, not staff scheduling.
 * Empty listings stay empty. KidEase never invents tour slots.
 */

import { tourInventoryState, type TourInventoryState } from "./tour-hold.ts";

export const DEFAULT_TOUR_TIMEZONE = "America/Winnipeg";

export const CANADA_TOUR_TIMEZONES = [
  "America/Winnipeg",
  "America/Toronto",
  "America/Regina",
  "America/Edmonton",
  "America/Vancouver",
  "America/Halifax",
  "America/St_Johns",
  "America/Whitehorse",
] as const;

export type TourTimezone = (typeof CANADA_TOUR_TIMEZONES)[number];

export const MIN_TOUR_CAPACITY = 1;
export const MAX_TOUR_CAPACITY = 12;
export const TOUR_REPEAT_WEEKS = 4;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type TourWindowDraft = {
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
};

export type PublicTourSlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  booked: number;
  remaining: number;
  pending: number;
  accepted: number;
  inventory: TourInventoryState;
  timezone: string;
  startAt: string;
};

export type TourEmptyReason = "none_posted" | "none_open";

export function resolveTourTimezone(value?: string | null): string {
  const raw = String(value || "").trim();
  if ((CANADA_TOUR_TIMEZONES as readonly string[]).includes(raw)) return raw;
  return DEFAULT_TOUR_TIMEZONE;
}

export function clampTourCapacity(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return MIN_TOUR_CAPACITY;
  return Math.min(MAX_TOUR_CAPACITY, Math.max(MIN_TOUR_CAPACITY, n));
}

export function remainingTourSeats(capacity: number, booked: number): number {
  return Math.max(0, clampTourCapacity(capacity) - Math.max(0, Math.floor(Number(booked) || 0)));
}

export function normalizeTourDate(value: unknown): string | null {
  const date = String(value ?? "").trim().slice(0, 10);
  if (!DATE_RE.test(date)) return null;
  const utc = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(utc.getTime()) || utc.toISOString().slice(0, 10) !== date) return null;
  return date;
}

export function normalizeTourClock(value: unknown): string | null {
  const time = String(value ?? "").trim().slice(0, 5);
  return TIME_RE.test(time) ? time : null;
}

export function normalizeTourWindow(raw: unknown): TourWindowDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { date?: unknown; startTime?: unknown; endTime?: unknown; start_time?: unknown; end_time?: unknown; capacity?: unknown };
  const date = normalizeTourDate(row.date);
  const startTime = normalizeTourClock(row.startTime ?? row.start_time);
  const endTime = normalizeTourClock(row.endTime ?? row.end_time);
  if (!date || !startTime || !endTime || startTime >= endTime) return null;
  return { date, startTime, endTime, capacity: clampTourCapacity(row.capacity) };
}

export function addDaysIso(date: string, days: number): string | null {
  if (!normalizeTourDate(date)) return null;
  const utc = new Date(`${date}T00:00:00Z`);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function expandWeeklyRepeats(draft: TourWindowDraft, weeks = TOUR_REPEAT_WEEKS): TourWindowDraft[] {
  const out: TourWindowDraft[] = [];
  const count = Math.min(8, Math.max(1, Math.floor(weeks)));
  for (let i = 0; i < count; i += 1) {
    const date = addDaysIso(draft.date, i * 7);
    if (!date) continue;
    out.push({ ...draft, date });
  }
  return out;
}

function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant.getTime();
}

/** Interpret a centre-local date+time in `timeZone` as a UTC instant. */
export function zonedLocalToUtc(date: string, time: string, timeZone: string): Date | null {
  if (!normalizeTourDate(date) || !normalizeTourClock(time)) return null;
  const zone = resolveTourTimezone(timeZone);
  const utcGuess = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(utcGuess.getTime())) return null;
  const first = new Date(utcGuess.getTime() - tzOffsetMs(utcGuess, zone));
  const second = new Date(utcGuess.getTime() - tzOffsetMs(first, zone));
  return Number.isNaN(second.getTime()) ? null : second;
}

export function windowStartAt(draft: TourWindowDraft, timeZone: string): Date | null {
  return zonedLocalToUtc(draft.date, draft.startTime, timeZone);
}

export function windowEndAt(draft: TourWindowDraft, timeZone: string): Date | null {
  return zonedLocalToUtc(draft.date, draft.endTime, timeZone);
}

export function isTourWindowBookable(
  draft: Pick<TourWindowDraft, "date" | "startTime">,
  timeZone: string,
  now = new Date(),
): boolean {
  const start = zonedLocalToUtc(draft.date, draft.startTime, timeZone);
  return Boolean(start && start.getTime() > now.getTime());
}

export function toPublicTourSlot(input: {
  id: string;
  date: unknown;
  startTime: unknown;
  endTime: unknown;
  capacity: unknown;
  booked?: unknown;
  pending?: unknown;
  accepted?: unknown;
  timezone?: unknown;
  startAt?: unknown;
  now?: Date;
}): PublicTourSlot | null {
  const draft = normalizeTourWindow({
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    capacity: input.capacity,
  });
  const id = String(input.id || "").trim();
  if (!draft || !id) return null;
  const timezone = resolveTourTimezone(input.timezone == null ? null : String(input.timezone));
  const pending = Math.max(0, Math.floor(Number(input.pending) || 0));
  const accepted = Math.max(0, Math.floor(Number(input.accepted) || 0));
  const booked = Math.max(
    0,
    Math.floor(Number(input.booked) || 0) || pending + accepted,
  );
  const remaining = remainingTourSeats(draft.capacity, booked);
  const start = windowStartAt(draft, timezone);
  const bookable = isTourWindowBookable(draft, timezone, input.now ?? new Date());
  return {
    id,
    date: draft.date,
    startTime: draft.startTime,
    endTime: draft.endTime,
    capacity: draft.capacity,
    booked,
    remaining,
    pending,
    accepted,
    inventory: tourInventoryState({ remaining, pending, accepted, bookable }),
    timezone,
    startAt: start ? start.toISOString() : String(input.startAt ?? ""),
  };
}

export function publicSlotsOpen(slots: readonly PublicTourSlot[], now = new Date()): PublicTourSlot[] {
  return slots.filter(
    (slot) => slot.remaining > 0 && isTourWindowBookable(slot, slot.timezone, now),
  );
}

export function tourEmptyReason(
  posted: readonly PublicTourSlot[],
  now = new Date(),
): TourEmptyReason | null {
  if (posted.length === 0) return "none_posted";
  if (publicSlotsOpen(posted, now).length === 0) return "none_open";
  return null;
}

export function groupSlotsByDate(slots: readonly PublicTourSlot[]): Array<{ date: string; slots: PublicTourSlot[] }> {
  const map = new Map<string, PublicTourSlot[]>();
  for (const slot of [...slots].sort((a, b) => a.startAt.localeCompare(b.startAt) || a.startTime.localeCompare(b.startTime))) {
    const list = map.get(slot.date) ?? [];
    list.push(slot);
    map.set(slot.date, list);
  }
  return [...map.entries()].map(([date, group]) => ({ date, slots: group }));
}

export function formatTourSlotRange(slot: Pick<PublicTourSlot, "date" | "startTime" | "endTime" | "timezone">, locale: "en" | "fr" | string = "en"): string {
  const start = zonedLocalToUtc(slot.date, slot.startTime, slot.timezone);
  const end = zonedLocalToUtc(slot.date, slot.endTime, slot.timezone);
  const tag = locale === "fr" ? "fr-CA" : "en-CA";
  if (!start || !end) return `${slot.date} ${slot.startTime}–${slot.endTime}`;
  const day = start.toLocaleDateString(tag, { weekday: "short", month: "short", day: "numeric", timeZone: slot.timezone });
  const from = start.toLocaleTimeString(tag, { hour: "numeric", minute: "2-digit", timeZone: slot.timezone });
  const to = end.toLocaleTimeString(tag, { hour: "numeric", minute: "2-digit", timeZone: slot.timezone });
  return `${day} · ${from}–${to}`;
}

export function formatTourDateChip(date: string, locale: "en" | "fr" | string = "en"): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function timezoneLabel(zone: string, locale: "en" | "fr" | string = "en"): string {
  const fr = locale === "fr";
  switch (resolveTourTimezone(zone)) {
    case "America/Toronto":
      return fr ? "Heure de l’Est — Toronto" : "Eastern — Toronto";
    case "America/Regina":
      return fr ? "Heure du Centre (sans HAC) — Regina" : "Central (no DST) — Regina";
    case "America/Edmonton":
      return fr ? "Heure des Rocheuses — Edmonton" : "Mountain — Edmonton";
    case "America/Vancouver":
      return fr ? "Heure du Pacifique — Vancouver" : "Pacific — Vancouver";
    case "America/Halifax":
      return fr ? "Heure de l’Atlantique — Halifax" : "Atlantic — Halifax";
    case "America/St_Johns":
      return fr ? "Heure de Terre-Neuve — St. John’s" : "Newfoundland — St. John’s";
    case "America/Whitehorse":
      return fr ? "Heure du Yukon — Whitehorse" : "Yukon — Whitehorse";
    default:
      return fr ? "Heure du Centre — Winnipeg" : "Central — Winnipeg";
  }
}
