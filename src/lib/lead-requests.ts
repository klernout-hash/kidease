import type { BookingStatus, TourStatus } from "./types";

export const LEAD_KINDS = ["tour", "waitlist", "spot_inquiry"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

export const LEAD_STATUSES = [
  "requested",
  "confirmed",
  "declined",
  "received",
  "answered",
  "closed",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_ACTIONS = ["confirm", "decline", "answered"] as const;
export type LeadAction = (typeof LEAD_ACTIONS)[number];

export const LEAD_SOURCE_KINDS = ["tour_request", "booking", "waitlist_interest"] as const;
export type LeadSourceKind = (typeof LEAD_SOURCE_KINDS)[number];

export const LISTING_ASKS = ["tour", "spot", "waitlist"] as const;
export type ListingAsk = (typeof LISTING_ASKS)[number];

export const PARENT_REQUESTS_SEARCH = { tab: "enrolled" as const };
export const PARENT_REQUESTS_HREF = "/parent?tab=enrolled";
export const DAYCARE_INBOX_HREF = "/provider?desk=requests";

export type LeadRequest = {
  id: string;
  kind: LeadKind;
  status: LeadStatus;
  userId: string;
  parentName: string | null;
  parentEmail: string | null;
  daycareId: string;
  daycareName: string;
  daycareSlug: string;
  message: string | null;
  replyNote: string | null;
  sourceKind: LeadSourceKind | null;
  sourceId: string | null;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
};

export type LeadCounts = {
  open: number;
  requested: number;
  confirmed: number;
  declined: number;
  received: number;
  answered: number;
  closed: number;
  total: number;
};

const OPEN_STATUSES: LeadStatus[] = ["requested", "received"];

export function isLeadKind(value: string | null | undefined): value is LeadKind {
  return LEAD_KINDS.includes(value as LeadKind);
}

export function isLeadStatus(value: string | null | undefined): value is LeadStatus {
  return LEAD_STATUSES.includes(value as LeadStatus);
}

export function isLeadAction(value: string | null | undefined): value is LeadAction {
  return LEAD_ACTIONS.includes(value as LeadAction);
}

export function isListingAsk(value: unknown): value is ListingAsk {
  return LISTING_ASKS.includes(value as ListingAsk);
}

export function parseListingAsk(value: unknown): ListingAsk | undefined {
  return isListingAsk(value) ? value : undefined;
}

export function listingAskHref(slug: string, ask: ListingAsk): string {
  return `/daycare/${slug}?ask=${ask}`;
}

export function leadKindFromAsk(ask: ListingAsk): LeadKind {
  if (ask === "spot") return "spot_inquiry";
  return ask;
}

export function isOpenLeadStatus(status: LeadStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function actionToLeadStatus(action: LeadAction): LeadStatus {
  if (action === "confirm") return "confirmed";
  if (action === "decline") return "declined";
  return "answered";
}

export function nextLeadStatus(current: string, action: LeadAction): LeadStatus | null {
  if (!isLeadStatus(current)) return null;
  const next = actionToLeadStatus(action);
  if (current === next) return null;
  if (current === "closed") return null;
  if (current === "declined" && next !== "closed") return null;
  return next;
}

export function tourStatusToLead(status: string | null | undefined): LeadStatus {
  if (status === "accepted") return "confirmed";
  if (status === "declined" || status === "lost") return "declined";
  if (status === "completed" || status === "enrolled") return "closed";
  return "requested";
}

export function bookingStatusToLead(status: string | null | undefined): LeadStatus {
  if (status === "under_review" || status === "waitlist") return "received";
  if (status === "accepted") return "confirmed";
  if (status === "declined") return "declined";
  if (status === "active" || status === "cancelled") return "closed";
  return "requested";
}

export function emptyLeadCounts(): LeadCounts {
  return {
    open: 0,
    requested: 0,
    confirmed: 0,
    declined: 0,
    received: 0,
    answered: 0,
    closed: 0,
    total: 0,
  };
}

export function tallyLeadCounts(statuses: readonly string[]): LeadCounts {
  const counts = emptyLeadCounts();
  for (const raw of statuses) {
    if (!isLeadStatus(raw)) continue;
    counts[raw] += 1;
    counts.total += 1;
    if (isOpenLeadStatus(raw)) counts.open += 1;
  }
  return counts;
}

export function leadKindCopyKey(kind: LeadKind): "leadKindTour" | "leadKindWaitlist" | "leadKindSpot" {
  if (kind === "waitlist") return "leadKindWaitlist";
  if (kind === "spot_inquiry") return "leadKindSpot";
  return "leadKindTour";
}

export function leadStatusCopyKey(
  status: LeadStatus,
):
  | "leadStatusRequested"
  | "leadStatusConfirmed"
  | "leadStatusDeclined"
  | "leadStatusReceived"
  | "leadStatusAnswered"
  | "leadStatusClosed" {
  if (status === "confirmed") return "leadStatusConfirmed";
  if (status === "declined") return "leadStatusDeclined";
  if (status === "received") return "leadStatusReceived";
  if (status === "answered") return "leadStatusAnswered";
  if (status === "closed") return "leadStatusClosed";
  return "leadStatusRequested";
}

export function leadNotifyKind(kind: LeadKind): "tour_request" | "spot_request" | "waitlist_request" {
  if (kind === "waitlist") return "waitlist_request";
  if (kind === "spot_inquiry") return "spot_request";
  return "tour_request";
}

export function leadReplyPreview(status: LeadStatus, daycareName: string, note?: string | null): string {
  const base =
    status === "confirmed"
      ? `${daycareName} confirmed your request.`
      : status === "declined"
        ? `${daycareName} declined your request.`
        : status === "answered"
          ? `${daycareName} answered your request.`
          : `${daycareName} updated your request.`;
  const extra = (note || "").trim();
  return extra ? `${base} ${extra}` : base;
}

/** AuthZ: parent who filed it, owning centre, or admin. */
export function canReadLead(input: {
  actorUserId: string;
  parentUserId: string;
  daycareId: string;
  ownedDaycareIds: readonly string[];
  isAdmin?: boolean;
}): boolean {
  if (input.isAdmin) return true;
  if (input.actorUserId && input.actorUserId === input.parentUserId) return true;
  return input.ownedDaycareIds.includes(input.daycareId);
}

/** Centre owner or admin can change status. The parent who filed it cannot. */
export function canUpdateLeadStatus(input: {
  daycareId: string;
  ownedDaycareIds: readonly string[];
  isAdmin?: boolean;
}): boolean {
  if (input.isAdmin) return true;
  return input.ownedDaycareIds.includes(input.daycareId);
}

export function leadKindFromSource(source: LeadSourceKind): LeadKind {
  if (source === "booking") return "spot_inquiry";
  if (source === "waitlist_interest") return "waitlist";
  return "tour";
}

export function sourceKindFromLead(kind: LeadKind): LeadSourceKind {
  if (kind === "spot_inquiry") return "booking";
  if (kind === "waitlist") return "waitlist_interest";
  return "tour_request";
}

export function mapExistingLeadStatus(input: {
  kind: LeadKind;
  tourStatus?: TourStatus | string | null;
  bookingStatus?: BookingStatus | string | null;
}): LeadStatus {
  if (input.kind === "tour") return tourStatusToLead(input.tourStatus);
  if (input.kind === "spot_inquiry") return bookingStatusToLead(input.bookingStatus);
  return "requested";
}
