/**
 * Today home SLA and row helpers with no path-alias imports so Node tests can load them.
 */

import { isOpenLeadStatus, type LeadRequest } from "./lead-requests.ts";
import { TOUR_HOLD_SLA_HOURS, tourHoldRemainingMs } from "./tour-hold.ts";
import type { Conversation, PreferredTime, TourRequest } from "./types.ts";

export const TODAY_TOUR_SLA_HOURS = TOUR_HOLD_SLA_HOURS;

export type TodayTone = "navy" | "ok" | "danger";
export type TodayKind = "tour_request" | "unread" | "action" | "confirmed_tour";
export type TodayHref =
  | { to: "/inbox/$id"; params: { id: string }; search?: { view: "centre"; tour?: string } }
  | { to: "/inbox"; search: { view: "centre" } }
  | { to: "/provider"; search: { desk: "listings" | "tours" | "licence" | "screening" | "requests" } };

export type TodayRow = {
  id: string;
  kind: TodayKind;
  tone: TodayTone;
  title: string;
  detail: string;
  href: TodayHref;
  tourId?: string;
  conversationId?: string;
  canDecide?: boolean;
  slaRemainingMs?: number;
  slaOverdue?: boolean;
  sortAt: number;
};

export type TodayEmptyTruth = {
  kind: "all_set";
  untilLabel: string | null;
  href: TodayHref;
};

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function preferredSlotStart(slot: PreferredTime): number | null {
  const ts = Date.parse(`${slot.date}T${slot.time}:00`);
  return Number.isFinite(ts) ? ts : null;
}

export function earliestPreferredStart(times: PreferredTime[]): number | null {
  let next: number | null = null;
  for (const slot of times) {
    const ts = preferredSlotStart(slot);
    if (ts == null) continue;
    if (next == null || ts < next) next = ts;
  }
  return next;
}

export function tourSlaDeadlineMs(createdAt: string, holdExpiresAt?: string | null): number | null {
  const remaining = tourHoldRemainingMs({ createdAt, holdExpiresAt }, 0);
  if (remaining == null) return null;
  return remaining;
}

export function tourSlaRemainingMs(
  createdAt: string,
  now = Date.now(),
  holdExpiresAt?: string | null,
): number | null {
  return tourHoldRemainingMs({ createdAt, holdExpiresAt }, now);
}

export function formatSlaCountdown(remainingMs: number | null): { overdue: boolean; hours: number; minutes: number } {
  if (remainingMs == null) return { overdue: false, hours: 0, minutes: 0 };
  if (remainingMs <= 0) return { overdue: true, hours: 0, minutes: 0 };
  const minutes = Math.floor(remainingMs / 60_000);
  return { overdue: false, hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

export function isConfirmedTourToday(tour: Pick<TourRequest, "status" | "preferredTimes">, now = Date.now()): boolean {
  if (tour.status !== "accepted") return false;
  const today = localDateKey(new Date(now));
  return tour.preferredTimes.some((slot) => slot.date === today);
}

export function nextConfirmedTourAt(
  tours: Array<Pick<TourRequest, "status" | "preferredTimes">>,
  now = Date.now(),
): number | null {
  let next: number | null = null;
  for (const tour of tours) {
    if (tour.status !== "accepted") continue;
    for (const slot of tour.preferredTimes) {
      const ts = preferredSlotStart(slot);
      if (ts == null || ts < now) continue;
      if (next == null || ts < next) next = ts;
    }
  }
  return next;
}

export function previewName(raw: string | null | undefined, fallback: string): string {
  const name = (raw || "").trim();
  if (!name) return fallback;
  return name.slice(0, 80);
}

export function collectUnreadMessageRows(
  threads: Array<Pick<Conversation, "id" | "daycareName" | "unread" | "lastAt">>,
  fallbackName: string,
): TodayRow[] {
  return threads
    .filter((thread) => thread.unread)
    .map((thread) => ({
      id: `unread:${thread.id}`,
      kind: "unread" as const,
      tone: "navy" as const,
      title: previewName(thread.daycareName, fallbackName),
      detail: "unread",
      href: { to: "/inbox/$id" as const, params: { id: thread.id }, search: { view: "centre" as const } },
      conversationId: thread.id,
      sortAt: Date.parse(thread.lastAt) || 0,
    }));
}

export function collectPendingTourRows(tours: TourRequest[], fallbackName: string, now = Date.now()): TodayRow[] {
  return tours
    .filter((tour) => tour.status === "pending")
    .map((tour) => {
      const remaining = tourSlaRemainingMs(tour.createdAt, now, tour.holdExpiresAt);
      const overdue = remaining != null && remaining <= 0;
      return {
        id: `tour:${tour.id}`,
        kind: "tour_request" as const,
        tone: overdue ? ("danger" as const) : ("navy" as const),
        title: previewName(tour.parentName, fallbackName),
        detail: previewName(tour.daycareName, tour.daycareId),
        href: {
          to: "/inbox/$id" as const,
          params: { id: tour.conversationId },
          search: { view: "centre" as const, tour: tour.id },
        },
        tourId: tour.id,
        conversationId: tour.conversationId,
        canDecide: true,
        slaRemainingMs: remaining ?? undefined,
        slaOverdue: overdue,
        sortAt: remaining ?? (Date.parse(tour.createdAt) || 0),
      };
    });
}

export function collectConfirmedTodayRows(tours: TourRequest[], fallbackName: string, now = Date.now()): TodayRow[] {
  return tours
    .filter((tour) => isConfirmedTourToday(tour, now))
    .map((tour) => {
      const start = earliestPreferredStart(tour.preferredTimes) ?? (Date.parse(tour.createdAt) || now);
      return {
        id: `confirmed:${tour.id}`,
        kind: "confirmed_tour" as const,
        tone: "ok" as const,
        title: previewName(tour.parentName, fallbackName),
        detail: previewName(tour.daycareName, tour.daycareId),
        href: {
          to: "/inbox/$id" as const,
          params: { id: tour.conversationId },
          search: { view: "centre" as const },
        },
        tourId: tour.id,
        conversationId: tour.conversationId,
        sortAt: start,
      };
    });
}

export function todayEmptyTruth(input: {
  rows: TodayRow[];
  tours: Array<Pick<TourRequest, "status" | "preferredTimes">>;
  leads: Array<Pick<LeadRequest, "status">>;
  now?: number;
}): TodayEmptyTruth | null {
  if (input.rows.length) return null;
  const now = input.now ?? Date.now();
  const next = nextConfirmedTourAt(input.tours, now);
  const openLeads = input.leads.filter((row) => isOpenLeadStatus(row.status)).length;
  return {
    kind: "all_set",
    untilLabel: next != null ? new Date(next).toISOString() : null,
    href: { to: "/provider", search: { desk: openLeads > 0 ? "requests" : "tours" } },
  };
}
