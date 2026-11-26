/**
 * "Add to calendar" for a confirmed tour, on the parent and daycare desks.
 * The visit time is the centre's wall clock (date + HH:MM) in the centre's
 * time zone. Pure: scripts/tour-add-to-calendar.test.mjs runs it in Node.
 */
import { buildTourIcs, tourCalendarLinks } from "./tour-ics.ts";

export const DEFAULT_CENTRE_ZONE = "America/Winnipeg";
const VISIT_MINUTES = 30;

function validZone(zone: string | null | undefined): string {
  const z = String(zone || "").trim();
  if (!z) return DEFAULT_CENTRE_ZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: z });
    return z;
  } catch {
    return DEFAULT_CENTRE_ZONE;
  }
}

function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour") % 24, n("minute"), n("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** "2026-11-26" + "10:00" in America/Winnipeg -> the real instant (DST aware). */
export function wallTimeToInstant(date: string, time: string, timeZone?: string | null): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || "").trim());
  const t = /^([01]\d|2[0-3]):([0-5]\d)/.exec(String(time || "").trim());
  if (!d || !t) return null;
  const zone = validZone(timeZone);
  const guess = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let at = guess - zoneOffsetMs(new Date(guess), zone);
  // Second pass settles a guess that landed across a DST change.
  at = guess - zoneOffsetMs(new Date(at), zone);
  const out = new Date(at);
  return Number.isNaN(out.getTime()) ? null : out;
}

export type TourCalendarInput = {
  tourId: string;
  centreName: string;
  date: string;
  time: string;
  timeZone?: string | null;
  location?: string | null;
  locale: "en" | "fr";
};

export type TourCalendarPack = {
  start: Date;
  end: Date;
  ics: string;
  google: string;
  fileName: string;
  /** "Thu, Nov 26, 10:00 a.m. CST" in the centre's zone. */
  label: string;
};

export function tourCalendarPack(input: TourCalendarInput): TourCalendarPack | null {
  const zone = validZone(input.timeZone);
  const start = wallTimeToInstant(input.date, input.time, zone);
  if (!start) return null;
  const end = new Date(start.getTime() + VISIT_MINUTES * 60 * 1000);
  const fr = input.locale === "fr";
  const title = fr ? `Visite : ${input.centreName}` : `Tour: ${input.centreName}`;
  const description = fr
    ? "Visite confirmée sur KidEase. Pour changer l’heure, écrivez au centre dans KidEase."
    : "Tour confirmed on KidEase. To change the time, message the centre in KidEase.";
  const event = { uid: `tour-${input.tourId}`, title, start, end, location: String(input.location || input.centreName), description };
  const links = tourCalendarLinks({ ...event, method: "PUBLISH" });
  const label = start.toLocaleString(fr ? "fr-CA" : "en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
    timeZoneName: "short",
  });
  return {
    start,
    end,
    ics: buildTourIcs({ ...event, method: "PUBLISH" }),
    google: `${links.google}&ctz=${encodeURIComponent(zone)}`,
    fileName: fr ? "kidease-visite.ics" : "kidease-tour.ics",
    label,
  };
}
