/**
 * Pure helpers for the desk features that stay behind FEATURE_* flags.
 * Node tests load this file. No database and no send.
 */

import type { CentreInboxThread, InboxStage } from "./inbox-stages.ts";
import { tourReminderAt } from "./tour-ics.ts";

export const CANADA_PROVINCE_CODES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
export type CanadaProvinceCode = (typeof CANADA_PROVINCE_CODES)[number];

export function isCanadaProvince(value: string | null | undefined): value is CanadaProvinceCode {
  return (CANADA_PROVINCE_CODES as readonly string[]).includes(String(value || "").trim().toUpperCase());
}

export function enrolmentSignLinks(contractId: string): { signPath: string; pdfPath: string } | null {
  const id = String(contractId || "").trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  return { signPath: `/sign/${id}`, pdfPath: `/api/contracts/${encodeURIComponent(id)}/pdf` };
}

export type PickupContact = { name: string; phone: string; relationship: string; note: string; restricted: boolean };

const PICKUP_MAX = 4;

export function parsePickupContacts(raw: string | null | undefined): PickupContact[] {
  const people: PickupContact[] = [];
  for (const line of String(raw || "").split(/\n+/)) {
    const parts = line.split("|").map((part) => part.trim());
    const name = (parts[0] || "").slice(0, 80);
    if (!name) continue;
    people.push({
      name,
      phone: (parts[1] || "").slice(0, 20),
      relationship: (parts[2] || "").slice(0, 40),
      note: (parts[3] || "").slice(0, 200),
      restricted: parts[4] === "1",
    });
    if (people.length >= PICKUP_MAX) break;
  }
  return people;
}

export function formatPickupContacts(people: readonly PickupContact[]): string {
  return people
    .map((person) => ({
      name: person.name.replace(/\s+/g, " ").trim().slice(0, 80),
      phone: person.phone.replace(/\s+/g, " ").trim().slice(0, 20),
      relationship: person.relationship.replace(/\s+/g, " ").trim().slice(0, 40),
      note: (person.note || "").replace(/\s+/g, " ").trim().slice(0, 200),
      restricted: Boolean(person.restricted),
    }))
    .filter((person) => person.name)
    .slice(0, PICKUP_MAX)
    .map((person) => {
      const note = person.note.replace(/\s+/g, " ").trim().slice(0, 200);
      const flag = person.restricted ? "1" : "";
      if (!note && !flag) return `${person.name} | ${person.phone} | ${person.relationship}`;
      return `${person.name} | ${person.phone} | ${person.relationship} | ${note} | ${flag}`;
    })
    .join("\n");
}

export type CalendarEvent = {
  id: string;
  tourId: string;
  title: string;
  day: string;
  startAt: string;
  location: string;
};

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Sunday-first month grid. Days outside the month stay in the grid so the rows line up. */
export function monthCells(year: number, month: number): { day: string; inMonth: boolean }[] {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return [];
  const first = new Date(year, month - 1, 1);
  const pad = first.getDay();
  const count = new Date(year, month, 0).getDate();
  const cells: { day: string; inMonth: boolean }[] = [];
  for (let i = 0; i < pad; i += 1) cells.push({ day: ymd(new Date(year, month - 1, 1 - (pad - i))), inMonth: false });
  for (let day = 1; day <= count; day += 1) cells.push({ day: ymd(new Date(year, month - 1, day)), inMonth: true });
  while (cells.length % 7 !== 0) {
    const last = new Date(`${cells[cells.length - 1]!.day}T12:00:00`);
    last.setDate(last.getDate() + 1);
    cells.push({ day: ymd(last), inMonth: false });
  }
  return cells;
}

export function eventsOnDay(events: readonly CalendarEvent[], day: string): CalendarEvent[] {
  return events.filter((event) => event.day === day);
}

/** Full date names keep adjacent months and visit counts clear without visual position. */
export function tourCalendarDayLabel(day: string, visits: number, locale: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  const fr = locale === "fr";
  const name = date.toLocaleDateString(fr ? "fr-CA" : "en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const count = fr ? `${visits} visite${visits > 1 ? "s" : ""}` : `${visits} visit${visits === 1 ? "" : "s"}`;
  return `${name}, ${count}`;
}

const OPEN_TOUR = new Set(["pending", "accepted"]);

export function eventsFromTours(
  tours: readonly {
    id: string;
    daycareName: string;
    status: string;
    preferredTimes: readonly { date: string; time: string }[];
  }[],
): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const tour of tours) {
    if (!OPEN_TOUR.has(tour.status)) continue;
    for (const slot of tour.preferredTimes) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(slot.date)) continue;
      const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time) ? slot.time : "";
      if (!time) continue;
      out.push({
        id: `${tour.id}:${slot.date}:${time}`,
        tourId: tour.id,
        title: tour.daycareName.trim() || "Daycare",
        day: slot.date,
        startAt: `${slot.date}T${time}:00`,
        location: "",
      });
    }
  }
  return out;
}

/** In-app only. The plan never names an email or a text. */
export function tourReminderPlan(
  startAt: string,
  now = new Date(),
): { ok: true; remindAt: string; sendsMail: false; sendsSms: false; sendsPush: false } | { ok: false; reason: "bad_time" | "too_soon" } {
  const when = tourReminderAt(startAt, now);
  if (!when) {
    const start = new Date(startAt);
    if (Number.isNaN(start.getTime())) return { ok: false, reason: "bad_time" };
    return { ok: false, reason: "too_soon" };
  }
  return { ok: true, remindAt: when.toISOString(), sendsMail: false, sendsSms: false, sendsPush: false };
}

type LeadSeed = {
  id: string;
  conversationId: string | null;
  parentName: string | null;
  message: string | null;
  kind: string;
  status: string;
  createdAt: string;
  daycareId: string;
  daycareName: string;
  daycareSlug?: string | null;
};

type TourSeed = {
  id: string;
  conversationId: string | null;
  parentName: string | null;
  daycareName: string;
  daycareId: string;
  daycareSlug?: string | null;
  status: string;
  createdAt: string;
};

function stageForLead(kind: string): InboxStage {
  if (kind === "tour") return "tour_requested";
  if (kind === "waitlist") return "waitlist_enrolled";
  if (kind === "info") return "info_sent";
  return "new_inquiry";
}

function blankThread(input: {
  id: string;
  daycareId: string;
  daycareName: string;
  daycareSlug: string;
  parentName: string;
  preview: string;
  at: string;
  stage: InboxStage;
  tourStatus: CentreInboxThread["tourStatus"];
}): CentreInboxThread {
  return {
    id: input.id,
    daycareId: input.daycareId,
    daycareName: input.parentName,
    daycareSlug: input.daycareSlug,
    photo: "/photos/cottage.jpg",
    lastAt: input.at,
    lastBody: input.preview,
    preview: input.preview,
    status: null,
    tourStatus: input.tourStatus,
    phone: null,
    unread: true,
    parentName: input.parentName,
    childAgeLabel: null,
    programLabel: null,
    tourDatetime: null,
    tourHold: null,
    listingVerified: false,
    screeningOnFile: false,
    stage: input.stage,
    slaRemainingMs: null,
    slaOverdue: false,
    confirmedDot: false,
    staffNote: null,
    subsidyNote: null,
    scheduleNote: null,
    requestInfoCount: input.stage === "info_sent" ? 1 : 0,
    centreName: input.daycareName,
    childName: null,
  };
}

/**
 * Threads stay. A request or visit is added only when it has no conversation yet.
 * Parent email and phone are not copied onto the row.
 */
export function mergeUnifiedInbox(
  threads: readonly CentreInboxThread[],
  leads: readonly LeadSeed[],
  tours: readonly TourSeed[],
): CentreInboxThread[] {
  const threadIds = new Set(threads.map((thread) => thread.id));
  const extras: CentreInboxThread[] = [];
  const seen = new Set<string>();
  for (const lead of leads) {
    if (lead.status !== "requested" && lead.status !== "received") continue;
    if (lead.conversationId && threadIds.has(lead.conversationId)) continue;
    const id = `lead:${lead.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const preview = (lead.message || "").replace(/\s+/g, " ").trim().slice(0, 140);
    extras.push(
      blankThread({
        id,
        daycareId: lead.daycareId,
        daycareName: lead.daycareName,
        daycareSlug: lead.daycareSlug || "",
        parentName: (lead.parentName || "").trim() || "Parent",
        preview,
        at: lead.createdAt,
        stage: stageForLead(lead.kind),
        tourStatus: lead.kind === "tour" ? "pending" : null,
      }),
    );
  }
  for (const tour of tours) {
    if (tour.status !== "pending" && tour.status !== "accepted") continue;
    if (tour.conversationId && threadIds.has(tour.conversationId)) continue;
    const id = `tourreq:${tour.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    extras.push(
      blankThread({
        id,
        daycareId: tour.daycareId,
        daycareName: tour.daycareName,
        daycareSlug: tour.daycareSlug || "",
        parentName: (tour.parentName || "").trim() || "Parent",
        preview: "",
        at: tour.createdAt,
        stage: tour.status === "accepted" ? "tour_booked" : "tour_requested",
        tourStatus: tour.status === "accepted" ? "accepted" : "pending",
      }),
    );
  }
  return [...threads, ...extras].sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
}

export function isOrphanInboxId(id: string | null | undefined): boolean {
  const value = String(id || "");
  return value.startsWith("lead:") || value.startsWith("tourreq:");
}
