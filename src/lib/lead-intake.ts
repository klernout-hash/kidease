/**
 * One plan for every way a family becomes a lead at a centre.
 * Pure: no database, no mail, no text, no outside CRM.
 * scripts/lead-intake.test.mjs loads this file in Node.
 */
import { stageRank, type CentreLeadStage, type LeadSource } from "./centre-leads.ts";

export const LEAD_ENTRY_POINTS = [
  "listing_inquiry",
  "contact_form",
  "enrol_now",
  "assisted_enrol",
  "tour_request",
  "tour_booking",
  "tour_completed",
  "waitlist_join",
  "area_waitlist",
  "spot_alert",
  "application",
  "family_application",
  "saved_share",
  "listing_message",
  "claim_inquiry",
  "future_opening",
  "schedule_match",
  "lead_inbox",
  "requests",
  "tracker_record",
  "manual_add",
  "booking_accepted",
  "spot_offer",
] as const;

export type LeadEntryPoint = (typeof LEAD_ENTRY_POINTS)[number];

/** KidEase's own business. These never become a centre's family lead. */
export const KIDEASE_BUSINESS_EVENTS = [
  "provider_signup",
  "listing_claim",
  "claim_verify",
  "operator_demo",
  "daycare_prospect",
  "government_contact",
] as const;

export type KidEaseBusinessEvent = (typeof KIDEASE_BUSINESS_EVENTS)[number];

export function isKidEaseBusinessLead(event: string): boolean {
  return (KIDEASE_BUSINESS_EVENTS as readonly string[]).includes(event.trim());
}

export function isLeadEntryPoint(event: string): event is LeadEntryPoint {
  return (LEAD_ENTRY_POINTS as readonly string[]).includes(event);
}

const SPEC: Record<LeadEntryPoint, { source: LeadSource; stage: CentreLeadStage; needsShare?: boolean }> = {
  listing_inquiry: { source: "inquiry", stage: "inquiry" },
  contact_form: { source: "inquiry", stage: "inquiry" },
  enrol_now: { source: "application", stage: "applied" },
  assisted_enrol: { source: "application", stage: "applied" },
  tour_request: { source: "tour", stage: "tour_booked" },
  tour_booking: { source: "tour", stage: "tour_booked" },
  tour_completed: { source: "tour", stage: "toured" },
  waitlist_join: { source: "waitlist", stage: "waitlisted" },
  area_waitlist: { source: "waitlist", stage: "waitlisted" },
  spot_alert: { source: "waitlist", stage: "waitlisted" },
  application: { source: "application", stage: "applied" },
  family_application: { source: "application", stage: "applied" },
  saved_share: { source: "inquiry", stage: "inquiry", needsShare: true },
  listing_message: { source: "inquiry", stage: "inquiry" },
  claim_inquiry: { source: "inquiry", stage: "inquiry" },
  future_opening: { source: "inquiry", stage: "inquiry" },
  schedule_match: { source: "inquiry", stage: "inquiry" },
  lead_inbox: { source: "inquiry", stage: "inquiry" },
  requests: { source: "inquiry", stage: "inquiry" },
  tracker_record: { source: "inquiry", stage: "inquiry" },
  manual_add: { source: "manual", stage: "inquiry" },
  booking_accepted: { source: "enrolment", stage: "enrolled" },
  spot_offer: { source: "offer", stage: "offered" },
};

/** Why a live caller does not exist yet. The planner still accepts the entry when a centre and family are known. */
export const ENTRY_GAP: Partial<Record<LeadEntryPoint, string>> = {
  area_waitlist: "An area waitlist has no centre until the parent contacts one. The join itself is not a centre lead.",
  spot_alert: "A spot alert is an outbound notice, not a request to one centre. Joining that centre's waitlist is the lead.",
  saved_share: "Saving or following a centre has no share-with-centre choice, so those taps stay off the pipeline.",
  claim_inquiry: "A claimed listing uses the same contact form as any other listing. There is no second claim-page form.",
  future_opening: "No future-opening interest form exists in the product yet.",
  schedule_match: "No schedule-match interest form exists in the product yet.",
};

export type LeadIntakeInput = {
  entry: LeadEntryPoint;
  daycareId?: string | null;
  parentUserId?: string | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  childId?: string | null;
  childLabel?: string | null;
  ageGroup?: string | null;
  desiredStart?: string | null;
  schedule?: string | null;
  roomWanted?: string | null;
  shareOptIn?: boolean;
  firstTouchAt?: string | null;
  source?: LeadSource | null;
};

export type LeadPlan =
  | { wired: false; reason: string }
  | {
      wired: true;
      entry: LeadEntryPoint;
      source: LeadSource;
      stage: CentreLeadStage;
      daycareId: string;
      parentUserId: string | null;
      email: string | null;
      name: string | null;
      phone: string | null;
      childId: string | null;
      childLabel: string | null;
      ageGroup: string | null;
      desiredStart: string | null;
      schedule: string | null;
      roomWanted: string | null;
      firstTouchAt: string | null;
    };

function clean(value: string | null | undefined, max = 180): string | null {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

export function planLeadIntake(input: Omit<LeadIntakeInput, "entry"> & { entry: string }): LeadPlan {
  if (isKidEaseBusinessLead(input.entry)) return { wired: false, reason: "kidease_business_lead" };
  if (!isLeadEntryPoint(input.entry)) return { wired: false, reason: "unknown entry" };
  const spec = SPEC[input.entry];
  const daycareId = clean(input.daycareId, 80);
  if (!daycareId) return { wired: false, reason: "no centre" };
  if (spec.needsShare && input.shareOptIn !== true) {
    return { wired: false, reason: "parent did not opt to share" };
  }
  let parentUserId = clean(input.parentUserId, 120);
  let email = clean(input.email, 180)?.toLowerCase() ?? null;
  if (parentUserId?.startsWith("guest:")) {
    email = email || clean(parentUserId.slice("guest:".length), 180)?.toLowerCase() || null;
    parentUserId = null;
  }
  if (!parentUserId && !email && !(input.entry === "manual_add" && clean(input.name))) {
    return { wired: false, reason: "no family" };
  }
  const source = input.source && input.entry === "manual_add" ? input.source : spec.source;
  return {
    wired: true,
    entry: input.entry,
    source,
    stage: spec.stage,
    daycareId,
    parentUserId,
    email,
    name: clean(input.name, 120),
    phone: clean(input.phone, 40),
    childId: clean(input.childId, 80),
    childLabel: clean(input.childLabel, 80),
    ageGroup: clean(input.ageGroup, 40),
    desiredStart: clean(input.desiredStart, 40),
    schedule: clean(input.schedule, 40),
    roomWanted: clean(input.roomWanted, 80),
    firstTouchAt: clean(input.firstTouchAt, 40),
  };
}

export function entryForLeadKind(kind: string, sourceKind?: string | null): LeadEntryPoint {
  if (kind === "tour") return sourceKind === "tour_booking" ? "tour_booking" : "tour_request";
  if (kind === "waitlist") return "waitlist_join";
  if (kind === "spot_inquiry") return "application";
  if (kind === "info") return "listing_inquiry";
  return "requests";
}

export type ExistingLead = {
  stage: string;
  source: string;
  startedAt: string;
  stageLocked?: boolean;
};

export function mergeLeadIntake(existing: ExistingLead | null, plan: Extract<LeadPlan, { wired: true }>, at: string) {
  const touch = plan.firstTouchAt || at;
  if (!existing) {
    return { created: true as const, stage: plan.stage, source: plan.source, startedAt: touch, timeline: true as const };
  }
  const incoming = stageRank(plan.stage);
  const current = stageRank(existing.stage as CentreLeadStage);
  const known = Number.isFinite(current);
  const stage = existing.stageLocked || (known && current >= incoming) ? (existing.stage as CentreLeadStage) : plan.stage;
  const earlier = Boolean(touch) && touch < existing.startedAt;
  return {
    created: false as const,
    stage,
    source: (earlier ? plan.source : existing.source) as LeadSource,
    startedAt: earlier ? touch : existing.startedAt,
    timeline: true as const,
  };
}
