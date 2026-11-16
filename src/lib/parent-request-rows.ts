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
  preferredTimes?: readonly { date?: string | null }[] | null;
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
}): ParentRequestRow[] {
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
      status: parentRequestStatusFromTour(tour.status),
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
