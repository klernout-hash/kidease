/**
 * Parent ↔ centre coordination threads (Airbnb-style) and tour requests.
 *
 * Live product lives on `conversations` / `messages` + /inbox.
 * FEATURE_INAPP_CHAT remains a lab flag for extra kinds (parent/admin).
 * Do not buy Stream or Sendbird.
 */

export const TOUR_STATUSES = ["pending", "accepted", "declined"] as const;
export type TourStatus = (typeof TOUR_STATUSES)[number];

export const MIN_TOUR_SLOTS = 1;
export const MAX_TOUR_SLOTS = 3;

export type PreferredTime = {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm (24h) */
  time: string;
};

export type ThreadRole = "parent" | "centre" | "admin" | "none";

export type ThreadAccess = {
  canRead: boolean;
  canWrite: boolean;
  role: ThreadRole;
};

export function isTourStatus(value: string): value is TourStatus {
  return (TOUR_STATUSES as readonly string[]).includes(value);
}

export function canRespondTour(status: string): boolean {
  return status === "pending";
}

export function nextTourStatus(current: string, next: string): "accepted" | "declined" | null {
  if (!canRespondTour(current)) return null;
  if (next === "accepted" || next === "declined") return next;
  return null;
}

/** Parent and centre owners read/write. Admin may view only. */
export function resolveThreadAccess(input: {
  userId: string;
  parentUserId: string;
  isCentreOwner: boolean;
  isAdmin: boolean;
}): ThreadAccess {
  const uid = (input.userId || "").trim();
  if (!uid) return { canRead: false, canWrite: false, role: "none" };
  if (uid === input.parentUserId) return { canRead: true, canWrite: true, role: "parent" };
  if (input.isCentreOwner) return { canRead: true, canWrite: true, role: "centre" };
  if (input.isAdmin) return { canRead: true, canWrite: false, role: "admin" };
  return { canRead: false, canWrite: false, role: "none" };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizePreferredTime(raw: unknown): PreferredTime | null {
  if (!raw || typeof raw !== "object") return null;
  const date = String((raw as { date?: unknown }).date ?? "").trim();
  const time = String((raw as { time?: unknown }).time ?? "").trim().slice(0, 5);
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  const iso = `${date}T${time}:00`;
  if (Number.isNaN(new Date(iso).getTime())) return null;
  return { date, time };
}

export function parsePreferredTimes(raw: unknown): PreferredTime[] {
  let list: unknown[] = [];
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text) as unknown;
      list = Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    list = raw;
  }
  const out: PreferredTime[] = [];
  for (const item of list) {
    const slot = normalizePreferredTime(item);
    if (slot) out.push(slot);
    if (out.length >= MAX_TOUR_SLOTS) break;
  }
  return out;
}

export function serializePreferredTimes(times: PreferredTime[]): string {
  return JSON.stringify(times.slice(0, MAX_TOUR_SLOTS).map((t) => ({ date: t.date, time: t.time })));
}

export function preferredTimesValid(times: PreferredTime[]): boolean {
  return times.length >= MIN_TOUR_SLOTS && times.length <= MAX_TOUR_SLOTS;
}

export function formatPreferredTime(slot: PreferredTime, locale: "en" | "fr" | string = "en"): string {
  const iso = `${slot.date}T${slot.time}:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `${slot.date} ${slot.time}`;
  const tag = locale === "fr" ? "fr-CA" : "en-CA";
  return d.toLocaleString(tag, { dateStyle: "medium", timeStyle: "short" });
}

export function formatPreferredTimes(times: PreferredTime[], locale: "en" | "fr" | string = "en"): string {
  return times.map((t) => formatPreferredTime(t, locale)).join(" · ");
}

export function tourSystemBody(input: {
  parentName: string;
  childName?: string | null;
  daycareName: string;
  times: PreferredTime[];
  note?: string | null;
  locale?: "en" | "fr" | string;
}): string {
  const slots = formatPreferredTimes(input.times, input.locale);
  const child = (input.childName || "").trim();
  const note = (input.note || "").trim();
  if (input.locale === "fr") {
    const who = child ? `${input.parentName} pour ${child}` : input.parentName;
    return [
      `${who} a demandé une visite à ${input.daycareName}.`,
      `Moments préférés : ${slots}`,
      note ? `Note : ${note}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  const who = child ? `${input.parentName} for ${child}` : input.parentName;
  return [
    `${who} requested a tour at ${input.daycareName}.`,
    `Preferred times: ${slots}`,
    note ? `Note: ${note}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function tourStatusBody(input: {
  status: "accepted" | "declined";
  daycareName: string;
  note?: string | null;
  locale?: "en" | "fr" | string;
}): string {
  const note = (input.note || "").trim();
  if (input.locale === "fr") {
    const head =
      input.status === "accepted"
        ? `${input.daycareName} a accepté la visite.`
        : `${input.daycareName} a décliné la visite.`;
    return note ? `${head}\nNote : ${note}` : head;
  }
  const head =
    input.status === "accepted"
      ? `${input.daycareName} accepted the tour request.`
      : `${input.daycareName} declined the tour request.`;
  return note ? `${head}\nNote: ${note}` : head;
}
