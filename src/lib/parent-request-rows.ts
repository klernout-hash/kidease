import type { LeadKind, LeadRequest, LeadSourceKind } from "@/lib/lead-requests";

/** One parent-facing request. A tour lead and its tour row are the same request. */
export const PARENT_REQUEST_KINDS = ["tour", "enrolment", "waitlist", "spot"] as const;
export type ParentRequestKind = (typeof PARENT_REQUEST_KINDS)[number];

export const PARENT_REQUEST_STATUSES = ["waiting", "confirmed", "declined", "enrolled", "cancelled"] as const;
export type ParentRequestStatus = (typeof PARENT_REQUEST_STATUSES)[number];

export type ParentRequestRow = {
  id: string;
  daycareId: string;
  daycareName: string;
  daycareSlug: string;
  kind: ParentRequestKind;
  status: ParentRequestStatus;
  sentAt: string;
  tourDate: string | null;
  conversationId: string | null;
};

type LeadInput = {
  id: string;
  kind: LeadKind | string;
  status: string;
  daycareId: string;
  daycareName: string;
  daycareSlug: string;
  sourceKind: LeadSourceKind | string | null;
  sourceId: string | null;
  conversationId: string | null;
  createdAt: string;
};

type TourInput = {
  id: string;
  daycareId: string;
  daycareName: string;
  daycareSlug: string;
  status: string;
  createdAt: string;
  conversationId: string | null;
  preferredTimes?: readonly { date?: string | null; time?: string | null }[] | null;
};

type BookingInput = {
  id: string;
  daycareId: string;
  daycareName: string;
  daycareSlug: string;
  status: string;
  createdAt: string;
  conversationId: string | null;
};

export function parentRequestStatusFromTour(status: string | null | undefined): ParentRequestStatus {
  const value = String(status || "").trim().toLowerCase();
  if (value === "enrolled") return "enrolled";
  if (value === "accepted" || value === "completed" || value === "confirmed") return "confirmed";
  if (value === "declined" || value === "no_show") return "declined";
  if (value === "cancelled" || value === "lost" || value === "expired") return "cancelled";
  return "waiting";
}

export function parentRequestStatusFromBooking(status: string | null | undefined): ParentRequestStatus {
  const value = String(status || "").trim().toLowerCase();
  if (value === "accepted" || value === "active") return "enrolled";
  if (value === "declined") return "declined";
  if (value === "cancelled") return "cancelled";
  return "waiting";
}

export function parentRequestStatusFromLead(status: string | null | undefined): ParentRequestStatus {
  const value = String(status || "").trim().toLowerCase();
  if (value === "confirmed" || value === "answered") return "confirmed";
  if (value === "declined") return "declined";
  if (value === "closed") return "cancelled";
  return "waiting";
}

type TourSlotInput = { date?: string | null; time?: string | null };

type SelectableTour = {
  status: string;
  preferredTimes?: readonly TourSlotInput[] | null;
};

export type ParentTourBucket = "upcoming" | "needsReply" | "past";

export type ParentTourSelection<T extends SelectableTour> = {
  /** Confirmed, or accepted with a visit date still ahead. Soonest first. */
  upcoming: T[];
  /** Still open: waiting on the centre, or accepted without a visit date yet. Soonest first. */
  needsReply: T[];
  /** Visit dates that have gone by, and closed requests (declined, cancelled, enrolled, completed). */
  past: T[];
};

const TOUR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOUR_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local wall-clock stamp, `YYYY-MM-DD HH:MM`, the same shape as a slot. */
function localStamp(now: Date): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

/**
 * Slot stamps for one tour, soonest first. A slot with a date and no time
 * counts until the end of that day.
 */
function tourSlotStamps(tour: SelectableTour): string[] {
  const out: string[] = [];
  for (const slot of tour.preferredTimes ?? []) {
    const date = String(slot?.date || "").trim();
    if (!TOUR_DATE.test(date)) continue;
    const time = String(slot?.time || "").trim();
    out.push(`${date} ${TOUR_TIME.test(time) ? time : "23:59"}`);
  }
  return out.sort();
}

/** The next visit slot still ahead of `now`, or null. */
export function nextTourSlot(tour: SelectableTour, now: Date): string | null {
  const stamp = localStamp(now);
  return tourSlotStamps(tour).find((slot) => slot >= stamp) ?? null;
}

/** One status mapping for every parent tour view (home, Requests, Enrolled, tour calendar). */
export function parentTourBucket(tour: SelectableTour, now: Date): ParentTourBucket {
  const raw = String(tour.status || "").trim().toLowerCase();
  const status = parentRequestStatusFromTour(raw);
  if (raw === "completed" || status === "declined" || status === "cancelled" || status === "enrolled") return "past";
  const slots = tourSlotStamps(tour);
  const ahead = nextTourSlot(tour, now);
  if (slots.length > 0 && !ahead) return "past";
  if (raw === "confirmed") return "upcoming";
  if (raw === "accepted" && ahead) return "upcoming";
  return "needsReply";
}

/**
 * Splits a parent's tours into upcoming, still-open, and past.
 * Home "Next tour", the Requests and Enrolled tabs, and the tour calendar all
 * read this, so their counts agree for the same list.
 */
export function selectParentTours<T extends SelectableTour>(
  tours: readonly T[] | null | undefined,
  now: Date,
): ParentTourSelection<T> {
  const out: ParentTourSelection<T> = { upcoming: [], needsReply: [], past: [] };
  for (const tour of tours ?? []) out[parentTourBucket(tour, now)].push(tour);
  const soonest = (a: T, b: T) =>
    String(nextTourSlot(a, now) ?? "9999").localeCompare(String(nextTourSlot(b, now) ?? "9999"));
  out.upcoming.sort(soonest);
  out.needsReply.sort(soonest);
  return out;
}

/** Tour counts for TourCountSummary, from the shared selector. */
export function parentTourCounts(selection: ParentTourSelection<SelectableTour>): {
  openRequests: number;
  bookedSeats: number;
  postedTimes: number;
} {
  return { openRequests: selection.needsReply.length, bookedSeats: selection.upcoming.length, postedTimes: 0 };
}

/** Status a parent sees on a tour row. "Confirmed" only when the visit is still ahead. */
export function parentTourRowStatus(tour: SelectableTour, now: Date): ParentRequestStatus {
  const bucket = parentTourBucket(tour, now);
  if (bucket === "upcoming") return "confirmed";
  if (bucket === "needsReply") return "waiting";
  return parentRequestStatusFromTour(tour.status);
}

function kindFromLead(kind: string): ParentRequestKind {
  if (kind === "waitlist") return "waitlist";
  if (kind === "spot_inquiry" || kind === "info") return "spot";
  return "tour";
}

function tourDateOf(tour: TourInput): string | null {
  const date = tour.preferredTimes?.find((slot) => (slot.date || "").trim())?.date?.trim() || "";
  return date || null;
}

function byNewest(a: ParentRequestRow, b: ParentRequestRow): number {
  return String(b.sentAt).localeCompare(String(a.sentAt));
}

/**
 * Tours, enrolment bookings, waitlists, and spot requests on one list.
 * A lead that is the same tour or the same enrolment is not repeated.
 */
export function parentRequestRows(input: {
  leads?: readonly LeadInput[] | null;
  tours?: readonly TourInput[] | null;
  bookings?: readonly BookingInput[] | null;
  /** Used to label tours. Defaults to the current time. */
  now?: Date;
}): ParentRequestRow[] {
  const now = input.now ?? new Date();
  const leads = input.leads ?? [];
  const tours = input.tours ?? [];
  const bookings = input.bookings ?? [];
  const tourIds = new Set(tours.map((tour) => tour.id));
  const tourCentres = new Set(tours.map((tour) => tour.daycareId));
  const bookingIds = new Set(bookings.map((booking) => booking.id));
  const bookingCentres = new Set(bookings.map((booking) => booking.daycareId));

  const rows: ParentRequestRow[] = [
    ...tours.map((tour) => ({
      id: tour.id,
      daycareId: tour.daycareId,
      daycareName: tour.daycareName,
      daycareSlug: tour.daycareSlug,
      kind: "tour" as const,
      status: parentTourRowStatus(tour, now),
      sentAt: tour.createdAt,
      tourDate: tourDateOf(tour),
      conversationId: tour.conversationId,
    })),
    ...bookings.map((booking) => ({
      id: booking.id,
      daycareId: booking.daycareId,
      daycareName: booking.daycareName,
      daycareSlug: booking.daycareSlug,
      kind: "enrolment" as const,
      status: parentRequestStatusFromBooking(booking.status),
      sentAt: booking.createdAt,
      tourDate: null,
      conversationId: booking.conversationId,
    })),
  ];

  for (const lead of leads) {
    if (lead.sourceKind === "tour_request" && lead.sourceId && tourIds.has(lead.sourceId)) continue;
    if (lead.kind === "tour" && tourCentres.has(lead.daycareId)) continue;
    if (lead.sourceKind === "booking" && lead.sourceId && bookingIds.has(lead.sourceId)) continue;
    if ((lead.kind === "spot_inquiry" || lead.kind === "info") && bookingCentres.has(lead.daycareId)) continue;
    rows.push({
      id: lead.id,
      daycareId: lead.daycareId,
      daycareName: lead.daycareName,
      daycareSlug: lead.daycareSlug,
      kind: kindFromLead(lead.kind),
      status: parentRequestStatusFromLead(lead.status),
      sentAt: lead.createdAt,
      tourDate: null,
      conversationId: lead.conversationId,
    });
  }

  return rows.sort(byNewest);
}

export function parentRequestKindKey(kind: ParentRequestKind): "leadKindTour" | "parentRequestEnrolment" | "leadKindWaitlist" | "leadKindSpot" {
  if (kind === "enrolment") return "parentRequestEnrolment";
  if (kind === "waitlist") return "leadKindWaitlist";
  if (kind === "spot") return "leadKindSpot";
  return "leadKindTour";
}

export function parentRequestStatusKey(
  status: ParentRequestStatus,
): "parentRequestWaiting" | "parentRequestConfirmed" | "parentRequestDeclined" | "parentRequestEnrolled" | "parentRequestCancelled" {
  if (status === "confirmed") return "parentRequestConfirmed";
  if (status === "declined") return "parentRequestDeclined";
  if (status === "enrolled") return "parentRequestEnrolled";
  if (status === "cancelled") return "parentRequestCancelled";
  return "parentRequestWaiting";
}

type _LeadMatches = LeadRequest extends LeadInput ? true : false;
const _leadShape: _LeadMatches = true;
void _leadShape;
