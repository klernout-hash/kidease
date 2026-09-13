/**
 * Daycare Today home: urgency rows from tours, unread threads, and listing gaps.
 * Never invents SLA, leads, or next times. Previews stay name-only — no notes.
 */

import { TOUR_SLA_HOURS } from "@/lib/demand-heat";
import { isOpenLeadStatus, type LeadRequest } from "@/lib/lead-requests";
import { listingCompleteness } from "@/lib/listing-readiness";
import { listingStatusFromClaim } from "@/lib/listing-status";
import { isClaimVerified, normalizeLicenseStatus, type TrustListing } from "@/lib/trust";
import type { Conversation, Daycare, PreferredTime, TourRequest } from "@/lib/types";

export const TODAY_PRIMARY_NAV_IDS = ["today", "messages", "tours", "listings"] as const;
export type TodayPrimaryNavId = (typeof TODAY_PRIMARY_NAV_IDS)[number];

export type TodayTone = "navy" | "ok" | "danger";
export type TodayKind = "tour_request" | "unread" | "action" | "confirmed_tour";
export type TodayHref =
  | { to: "/inbox/$id"; params: { id: string }; search?: { view: "centre" } }
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

export type ScreeningGapCentre = {
  daycareId: string;
  daycareName: string;
  screeningOnFile: boolean;
  people: Array<{
    docs: Array<{ status: string }>;
  }>;
};

const ACTION_DOC = new Set(["missing", "letter_ready", "uploaded", "admin_review", "rejected", "expired"]);

export function isTodayPrimaryNavId(id: string): id is TodayPrimaryNavId {
  return (TODAY_PRIMARY_NAV_IDS as readonly string[]).includes(id);
}

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

export function earliestPreferredStart(times: PreferredTime[], now = Date.now()): number | null {
  let next: number | null = null;
  for (const slot of times) {
    const ts = preferredSlotStart(slot);
    if (ts == null) continue;
    if (next == null || ts < next) next = ts;
  }
  if (next == null) return null;
  return next;
}

export function tourSlaDeadlineMs(createdAt: string): number | null {
  const start = Date.parse(createdAt);
  if (!Number.isFinite(start)) return null;
  return start + TOUR_SLA_HOURS * 60 * 60 * 1000;
}

export function tourSlaRemainingMs(createdAt: string, now = Date.now()): number | null {
  const deadline = tourSlaDeadlineMs(createdAt);
  if (deadline == null) return null;
  return deadline - now;
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

export function listingNeedsVerified(item: TrustListing): boolean {
  return !isClaimVerified(item);
}

export function listingNeedsLicence(
  item: TrustListing &
    Pick<
      Daycare,
      | "id"
      | "hours"
      | "infantMonthly"
      | "toddlerMonthly"
      | "preschoolMonthly"
      | "partTimeMonthly"
      | "province"
      | "ageMinMonths"
      | "ageMaxMonths"
      | "licenseNumber"
      | "photos"
      | "agesKnown"
    >,
): boolean {
  const status = normalizeLicenseStatus(item.licenseStatus);
  if (status === "expired" || status === "suspended") return true;
  const complete = listingCompleteness(item);
  return !complete.hasLicense;
}

export function listingNeedsCompleteness(item: Daycare): boolean {
  return !listingCompleteness(item).ready;
}

export function centreNeedsScreening(centre: ScreeningGapCentre): boolean {
  if (centre.screeningOnFile) return false;
  if (!centre.people.length) return true;
  return centre.people.some((person) => person.docs.some((doc) => ACTION_DOC.has(doc.status)));
}

export function previewName(raw: string | null | undefined, fallback: string): string {
  const name = (raw || "").trim();
  if (!name) return fallback;
  return name.slice(0, 80);
}

export function collectActionRequired(input: {
  listings: Daycare[];
  screening?: ScreeningGapCentre[];
}): TodayRow[] {
  const rows: TodayRow[] = [];
  const seen = new Set<string>();
  for (const listing of input.listings) {
    const name = previewName(listing.name, listing.id);
    if (listingNeedsVerified(listing)) {
      const status = listingStatusFromClaim(listing.claimStatus, { live: listing.live });
      const id = `verified:${listing.id}`;
      if (!seen.has(id)) {
        seen.add(id);
        rows.push({
          id,
          kind: "action",
          tone: status === "declined" ? "danger" : "navy",
          title: name,
          detail: "verified",
          href: { to: "/provider", search: { desk: "licence" } },
          sortAt: status === "declined" ? 1 : 2,
        });
      }
    }
    if (listingNeedsLicence(listing)) {
      const id = `licence:${listing.id}`;
      if (!seen.has(id)) {
        seen.add(id);
        rows.push({
          id,
          kind: "action",
          tone: "navy",
          title: name,
          detail: "licence",
          href: { to: "/provider", search: { desk: "licence" } },
          sortAt: 3,
        });
      }
    }
    if (listingNeedsCompleteness(listing)) {
      const id = `listing:${listing.id}`;
      if (!seen.has(id)) {
        seen.add(id);
        rows.push({
          id,
          kind: "action",
          tone: "navy",
          title: name,
          detail: "listing",
          href: { to: "/provider", search: { desk: "listings" } },
          sortAt: 4,
        });
      }
    }
  }
  for (const centre of input.screening ?? []) {
    if (!centreNeedsScreening(centre)) continue;
    const id = `screening:${centre.daycareId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      kind: "action",
      tone: "navy",
      title: previewName(centre.daycareName, centre.daycareId),
      detail: "screening",
      href: { to: "/provider", search: { desk: "screening" } },
      sortAt: 2,
    });
  }
  return rows;
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

export function collectPendingTourRows(
  tours: TourRequest[],
  fallbackName: string,
  now = Date.now(),
): TodayRow[] {
  return tours
    .filter((tour) => tour.status === "pending")
    .map((tour) => {
      const remaining = tourSlaRemainingMs(tour.createdAt, now);
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
          search: { view: "centre" as const },
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

export function collectConfirmedTodayRows(
  tours: TourRequest[],
  fallbackName: string,
  now = Date.now(),
): TodayRow[] {
  return tours
    .filter((tour) => isConfirmedTourToday(tour, now))
    .map((tour) => {
      const start = earliestPreferredStart(tour.preferredTimes, now) ?? (Date.parse(tour.createdAt) || now);
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

export function buildTodayRows(input: {
  tours: TourRequest[];
  threads: Array<Pick<Conversation, "id" | "daycareName" | "unread" | "lastAt">>;
  listings: Daycare[];
  screening?: ScreeningGapCentre[];
  fallbackName: string;
  now?: number;
}): TodayRow[] {
  const now = input.now ?? Date.now();
  const pending = collectPendingTourRows(input.tours, input.fallbackName, now).sort((a, b) => a.sortAt - b.sortAt);
  const unread = collectUnreadMessageRows(input.threads, input.fallbackName).sort((a, b) => b.sortAt - a.sortAt);
  const actions = collectActionRequired({ listings: input.listings, screening: input.screening }).sort(
    (a, b) => a.sortAt - b.sortAt,
  );
  const confirmed = collectConfirmedTodayRows(input.tours, input.fallbackName, now).sort((a, b) => a.sortAt - b.sortAt);
  return [...pending, ...unread, ...actions, ...confirmed];
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
  const href: TodayHref =
    openLeads > 0
      ? { to: "/provider", search: { desk: "requests" } }
      : next != null
        ? { to: "/provider", search: { desk: "tours" } }
        : { to: "/provider", search: { desk: "tours" } };
  return {
    kind: "all_set",
    untilLabel: next != null ? new Date(next).toISOString() : null,
    href,
  };
}
