/**
 * Daycare inbox admissions stages (Sprint 2a).
 * Derived from real tour / booking / reply rows — never invented.
 * Filter chips: All · Unread · New inquiry → … → Support.
 */

import type { BookingStatus, TourStatus } from "./types.ts";

export const INBOX_STAGES = [
  "new_inquiry",
  "info_sent",
  "tour_requested",
  "tour_booked",
  "follow_up",
  "waitlist_enrolled",
  "support",
] as const;

export type InboxStage = (typeof INBOX_STAGES)[number];

export const INBOX_FILTERS = ["all", "unread", ...INBOX_STAGES] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export const INBOX_STAGE_COPY: Record<InboxStage, string> = {
  new_inquiry: "inboxStageNewInquiry",
  info_sent: "inboxStageInfoSent",
  tour_requested: "inboxStageTourRequested",
  tour_booked: "inboxStageTourBooked",
  follow_up: "inboxStageFollowUp",
  waitlist_enrolled: "inboxStageWaitlistEnrolled",
  support: "inboxStageSupport",
};

export const INBOX_FILTER_COPY: Record<InboxFilter, string> = {
  all: "inboxFilterAll",
  unread: "inboxFilterUnread",
  ...INBOX_STAGE_COPY,
};

export type InboxTourHold = "open" | "soft_hold" | "confirmed" | "blocked";

const WAITLIST_OR_ENROLLED = new Set(["waitlist", "accepted", "active"]);

export function isInboxStage(value: string | null | undefined): value is InboxStage {
  return Boolean(value && (INBOX_STAGES as readonly string[]).includes(value));
}

export function isInboxFilter(value: string | null | undefined): value is InboxFilter {
  return Boolean(value && (INBOX_FILTERS as readonly string[]).includes(value));
}

export function parseInboxFilter(raw: unknown): InboxFilter {
  return isInboxFilter(typeof raw === "string" ? raw : "") ? raw : "all";
}

export function deriveInboxStage(input: {
  tourStatus?: string | null;
  bookingStatus?: string | null;
  providerReplied?: boolean;
  hasParentMessage?: boolean;
}): InboxStage {
  const tour = (input.tourStatus || "").trim().toLowerCase();
  const booking = (input.bookingStatus || "").trim().toLowerCase();

  if (WAITLIST_OR_ENROLLED.has(booking) || tour === "enrolled") return "waitlist_enrolled";
  if (tour === "accepted") return "tour_booked";
  if (tour === "pending") return "tour_requested";
  if (tour === "completed" || tour === "declined" || tour === "lost" || tour === "expired") return "follow_up";
  if (input.providerReplied) return "info_sent";
  if (input.hasParentMessage) return "new_inquiry";
  return "support";
}

export function deriveTourHold(input: {
  tourStatus?: string | null;
  hasPreferredTimes?: boolean;
}): InboxTourHold | null {
  const tour = (input.tourStatus || "").trim().toLowerCase();
  if (!tour) return null;
  if (tour === "accepted" || tour === "completed" || tour === "enrolled") return "confirmed";
  if (tour === "declined" || tour === "lost" || tour === "expired") return "blocked";
  if (tour === "pending") return input.hasPreferredTimes ? "soft_hold" : "open";
  return null;
}

export function inboxConfirmedDot(input: {
  tourStatus?: string | null;
  bookingStatus?: string | null;
}): boolean {
  const tour = (input.tourStatus || "").trim().toLowerCase();
  const booking = (input.bookingStatus || "").trim().toLowerCase();
  return tour === "accepted" || tour === "enrolled" || booking === "accepted" || booking === "active";
}

/** Unread clears only on an explicit staff action — never on list/preview/thread open. */
export function inboxClearsUnreadOn(
  event: "list_open" | "preview" | "thread_open" | "mark_read" | "reply" | "accept",
): boolean {
  return event === "mark_read" || event === "reply" || event === "accept";
}

export type CentreInboxThread = {
  id: string;
  daycareId: string;
  daycareName: string;
  daycareSlug: string;
  photo: string;
  lastAt: string;
  lastBody: string;
  preview: string;
  status: BookingStatus | null;
  tourStatus: TourStatus | null;
  phone: string | null;
  unread: boolean;
  parentName: string;
  childAgeLabel: string | null;
  programLabel: string | null;
  tourDatetime: string | null;
  tourHold: InboxTourHold | null;
  listingVerified: boolean;
  screeningOnFile: boolean;
  stage: InboxStage;
  slaRemainingMs: number | null;
  slaOverdue: boolean;
  confirmedDot: boolean;
  staffNote: string | null;
  subsidyNote: string | null;
  scheduleNote: string | null;
  requestInfoCount: number;
};

export function threadMatchesQuery(thread: Pick<CentreInboxThread, "parentName" | "preview" | "daycareName">, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [thread.parentName, thread.preview, thread.daycareName].some((part) =>
    (part || "").toLowerCase().includes(q),
  );
}

export function filterCentreThreads(
  threads: CentreInboxThread[],
  input: { filter: InboxFilter; query?: string },
): CentreInboxThread[] {
  const query = input.query || "";
  return threads.filter((thread) => {
    if (!threadMatchesQuery(thread, query)) return false;
    if (input.filter === "all") return true;
    if (input.filter === "unread") return thread.unread;
    return thread.stage === input.filter;
  });
}

export function inboxInitials(name: string | null | undefined): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase();
  return letters || "?";
}
