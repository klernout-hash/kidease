/**
 * Centre lead tracker. One family, one centre, one stage.
 * Rules are pure: the same signals always pick the same stage.
 * This file does not send mail, text, or push, and it does not read child health.
 * scripts/centre-leads.test.mjs loads it in Node.
 */
import { centreCanWriteLeads, type CentreMemberRole } from "./centre-roles.ts";
import { quietHourInZone } from "./family-time.ts";
import { resolveTourCentre, type TourCentreDecision } from "./tour-phase0.ts";

export const CENTRE_LEAD_STAGES = [
  "inquiry",
  "tour_booked",
  "toured",
  "applied",
  "waitlisted",
  "offered",
  "enrolled",
  "lost",
] as const;
export type CentreLeadStage = (typeof CENTRE_LEAD_STAGES)[number];

export const LOST_REASONS = [
  "tour_declined",
  "tour_no_show",
  "tour_expired",
  "tour_lost",
  "application_declined",
  "booking_cancelled",
  "offer_declined",
  "offer_expired",
  "waitlist_withdrawn",
  "waitlist_declined",
  "parent_withdrew",
  "chose_other",
  "no_response",
  "other",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const LEAD_SOURCES = [
  "inquiry",
  "tour",
  "waitlist",
  "application",
  "offer",
  "enrolment",
  "website",
  "manual",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** Same ids as the hidden QA centre. Emails stay in qa-tour-access.ts. */
export const HIDDEN_LEAD_CENTRE_IDS = ["qa-reviewer-demo"] as const;

const STAGE_RANK: Record<CentreLeadStage, number> = {
  lost: 0,
  inquiry: 1,
  tour_booked: 2,
  toured: 3,
  applied: 4,
  waitlisted: 5,
  offered: 6,
  enrolled: 7,
};

export function isCentreLeadStage(value: string | null | undefined): value is CentreLeadStage {
  return (CENTRE_LEAD_STAGES as readonly string[]).includes(String(value || ""));
}

export function isLostReason(value: string | null | undefined): value is LostReason {
  return (LOST_REASONS as readonly string[]).includes(String(value || ""));
}

export function isHiddenLeadCentre(id: string | null | undefined): boolean {
  return (HIDDEN_LEAD_CENTRE_IDS as readonly string[]).includes(String(id || "").trim());
}

export type TourSignal = { status: string };
export type BookingSignal = { status: string };
export type WaitSignal = { status: string };
export type OfferSignal = { status: string };

export type LeadSignals = {
  inquiry: boolean;
  tours: readonly TourSignal[];
  bookings: readonly BookingSignal[];
  waitlist: readonly WaitSignal[];
  offers: readonly OfferSignal[];
  agreementStatus: string | null;
};

export type StageDecision = {
  stage: CentreLeadStage;
  ruleId: string;
  lostReason: LostReason | null;
};

const OPEN_BOOKING = new Set(["requested", "under_review"]);
const ENROLLED_BOOKING = new Set(["accepted", "active"]);
const SIGNED_AGREEMENT = new Set(["completed", "parent_signed"]);

function has(rows: readonly { status: string }[], status: string): boolean {
  return rows.some((row) => row.status === status);
}

/**
 * Highest open step wins. A loss wins only when nothing is still open.
 * Enrolment beats a loss. A booked tour beats an older decline.
 */
export function deriveCentreLeadStage(signals: LeadSignals): StageDecision | null {
  const tours = signals.tours;
  const bookings = signals.bookings;
  const waitlist = signals.waitlist;
  const offers = signals.offers;
  const agreement = String(signals.agreementStatus || "");

  if (bookings.some((row) => ENROLLED_BOOKING.has(row.status))) {
    return { stage: "enrolled", ruleId: "enrolled_booking", lostReason: null };
  }
  if (has(tours, "enrolled")) return { stage: "enrolled", ruleId: "enrolled_tour", lostReason: null };
  if (SIGNED_AGREEMENT.has(agreement)) return { stage: "enrolled", ruleId: "enrolled_agreement", lostReason: null };
  if (has(offers, "accepted")) return { stage: "enrolled", ruleId: "enrolled_offer", lostReason: null };
  if (has(waitlist, "accepted")) return { stage: "enrolled", ruleId: "enrolled_waitlist", lostReason: null };

  if (has(offers, "open") || has(waitlist, "offered")) {
    return { stage: "offered", ruleId: "open_offer", lostReason: null };
  }
  if (has(waitlist, "waiting") || has(bookings, "waitlist")) {
    return { stage: "waitlisted", ruleId: has(waitlist, "waiting") ? "waitlist_row" : "waitlist_booking", lostReason: null };
  }
  if (bookings.some((row) => OPEN_BOOKING.has(row.status))) {
    return { stage: "applied", ruleId: "open_application", lostReason: null };
  }
  if (has(tours, "accepted")) return { stage: "tour_booked", ruleId: "tour_accepted", lostReason: null };
  const lost = lossFromSignals(signals);
  if (has(tours, "completed") && !lost) return { stage: "toured", ruleId: "tour_completed", lostReason: null };
  if (lost) return { stage: "lost", ruleId: lost.ruleId, lostReason: lost.reason };
  if (
    signals.inquiry ||
    tours.length > 0 ||
    bookings.length > 0 ||
    waitlist.length > 0 ||
    offers.length > 0 ||
    agreement === "draft" ||
    agreement === "sent"
  ) {
    return { stage: "inquiry", ruleId: "inquiry", lostReason: null };
  }
  return null;
}

function lossFromSignals(signals: LeadSignals): { ruleId: string; reason: LostReason } | null {
  const tours = signals.tours.map((row) => row.status);
  const bookings = signals.bookings.map((row) => row.status);
  const offers = signals.offers.map((row) => row.status);
  const waitlist = signals.waitlist.map((row) => row.status);
  if (tours.includes("no_show")) return { ruleId: "lost_tour", reason: "tour_no_show" };
  if (offers.includes("expired")) return { ruleId: "lost_offer", reason: "offer_expired" };
  if (bookings.includes("declined")) return { ruleId: "lost_booking", reason: "application_declined" };
  if (bookings.includes("cancelled")) return { ruleId: "lost_booking", reason: "booking_cancelled" };
  if (tours.includes("declined")) return { ruleId: "lost_tour", reason: "tour_declined" };
  if (tours.includes("expired")) return { ruleId: "lost_tour", reason: "tour_expired" };
  if (waitlist.includes("withdrawn")) return { ruleId: "lost_waitlist", reason: "waitlist_withdrawn" };
  if (offers.includes("declined")) return { ruleId: "lost_offer", reason: "offer_declined" };
  if (waitlist.includes("declined") || waitlist.includes("expired")) {
    return { ruleId: "lost_waitlist", reason: "waitlist_declined" };
  }
  if (tours.includes("lost")) return { ruleId: "lost_tour", reason: "tour_lost" };
  return null;
}

export type Reached = {
  inquiry: boolean;
  tour: boolean;
  toured: boolean;
  applied: boolean;
  enrolled: boolean;
};

/** Bits come from signals we actually saw. A later stage does not invent an earlier tour. */
export function reachedFromSignals(signals: LeadSignals): Reached {
  const tours = signals.tours.map((row) => row.status);
  const bookings = signals.bookings.map((row) => row.status);
  const enrolled =
    bookings.some((status) => ENROLLED_BOOKING.has(status)) ||
    tours.includes("enrolled") ||
    SIGNED_AGREEMENT.has(String(signals.agreementStatus || "")) ||
    signals.offers.some((row) => row.status === "accepted") ||
    signals.waitlist.some((row) => row.status === "accepted");
  const tour = tours.some((status) => status === "accepted" || status === "completed" || status === "enrolled");
  const toured = tours.includes("completed") || tours.includes("enrolled");
  const applied = bookings.some((status) =>
    OPEN_BOOKING.has(status) || status === "waitlist" || ENROLLED_BOOKING.has(status),
  );
  const inquiry = signals.inquiry || tour || toured || applied || enrolled || signals.waitlist.length > 0 || signals.offers.length > 0;
  return { inquiry, tour, toured, applied, enrolled };
}

export function mergeReached(left: Reached, right: Reached): Reached {
  return {
    inquiry: left.inquiry || right.inquiry,
    tour: left.tour || right.tour,
    toured: left.toured || right.toured,
    applied: left.applied || right.applied,
    enrolled: left.enrolled || right.enrolled,
  };
}

export function emptyReached(): Reached {
  return { inquiry: false, tour: false, toured: false, applied: false, enrolled: false };
}

function sourceFromSignals(signals: LeadSignals): LeadSource {
  const decision = deriveCentreLeadStage(signals);
  if (!decision) return "inquiry";
  if (decision.stage === "enrolled") return "enrolment";
  if (decision.stage === "offered") return "offer";
  if (decision.stage === "waitlisted") return "waitlist";
  if (decision.stage === "applied") return "application";
  if (decision.stage === "tour_booked" || decision.stage === "toured") return "tour";
  return "inquiry";
}

export type LeadFact = {
  parentUserId: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  childLabel: string | null;
  ageGroup: string | null;
  desiredStart: string | null;
  signals: LeadSignals;
  startedAt: string;
  activityAt: string;
  tourAt: string | null;
  offerExpiresAt: string | null;
  sourceHint?: LeadSource | null;
};

export type StoredLead = {
  id: string;
  daycareId: string;
  parentUserId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  childLabel: string | null;
  ageGroup: string | null;
  desiredStart: string | null;
  source: LeadSource;
  stage: CentreLeadStage;
  autoStage: CentreLeadStage | null;
  autoRule: string | null;
  stageLocked: boolean;
  lostReason: LostReason | null;
  assignedUserId: string | null;
  reached: Reached;
  startedAt: string;
  lastActivityAt: string;
  tourAt: string | null;
  offerExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HistoryEvent = {
  fromStage: CentreLeadStage | null;
  toStage: CentreLeadStage;
  ruleId: string;
  lostReason: LostReason | null;
  at: string;
};

export type ManualStage = {
  stage: CentreLeadStage;
  lostReason?: string | null;
  unlock?: boolean;
};

function keepText(next: string | null | undefined, previous: string | null): string | null {
  const value = String(next || "").trim();
  return value || previous;
}

function newest<T extends { at: string }>(rows: readonly T[]): T | undefined {
  return [...rows].sort((left, right) => Date.parse(right.at) - Date.parse(left.at))[0];
}

function latestIso(values: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const value of values) {
    const ms = Date.parse(String(value || ""));
    if (!Number.isFinite(ms)) continue;
    if (ms >= bestMs) {
      bestMs = ms;
      best = new Date(ms).toISOString();
    }
  }
  return best;
}

function earliestIso(values: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = Infinity;
  for (const value of values) {
    const ms = Date.parse(String(value || ""));
    if (!Number.isFinite(ms)) continue;
    if (ms <= bestMs) {
      bestMs = ms;
      best = new Date(ms).toISOString();
    }
  }
  return best;
}

export function cleanAgeGroup(value: string | null | undefined): string | null {
  const age = String(value || "").trim().toLowerCase();
  if (age === "infant" || age === "toddler" || age === "preschool" || age === "any") return age;
  return null;
}

export function cleanStartMonth(value: string | null | undefined): string | null {
  const month = String(value || "").trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
}

export function cleanContact(value: string | null | undefined, max = 120): string | null {
  const text = String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  return text || null;
}

export function cleanNote(value: string | null | undefined): string | null {
  const text = String(value || "").replace(/\s+/g, " ").trim().slice(0, 2000);
  return text || null;
}

type RawRow = {
  userId: string;
  at: string;
  status?: string;
  kind?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  childLabel?: string | null;
  ageGroup?: string | null;
  startMonth?: string | null;
  startAt?: string | null;
  expiresAt?: string | null;
};

export type SourceBundle = {
  conversations: readonly { userId: string; lastAt: string }[];
  leads: readonly RawRow[];
  tours: readonly RawRow[];
  bookings: readonly RawRow[];
  waitlist: readonly RawRow[];
  offers: readonly RawRow[];
  agreements: readonly { userId: string; status: string; at: string }[];
  people: readonly { userId: string; name: string | null; email: string | null }[];
};

/** Group existing rows by the parent who shared them with this centre. */
export function factsFromSources(bundle: SourceBundle): LeadFact[] {
  const ids = new Set<string>();
  const add = (id: string | null | undefined) => {
    const value = String(id || "").trim();
    if (value) ids.add(value);
  };
  for (const row of bundle.conversations) add(row.userId);
  for (const row of bundle.leads) add(row.userId);
  for (const row of bundle.tours) add(row.userId);
  for (const row of bundle.bookings) add(row.userId);
  for (const row of bundle.waitlist) add(row.userId);
  for (const row of bundle.offers) add(row.userId);
  for (const row of bundle.agreements) add(row.userId);

  const people = new Map(bundle.people.map((person) => [person.userId, person]));
  const facts: LeadFact[] = [];
  for (const userId of ids) {
    const leads = bundle.leads.filter((row) => row.userId === userId);
    const tours = bundle.tours.filter((row) => row.userId === userId);
    const bookings = bundle.bookings.filter((row) => row.userId === userId);
    const waitlist = bundle.waitlist.filter((row) => row.userId === userId);
    const offers = bundle.offers.filter((row) => row.userId === userId);
    const agreements = bundle.agreements.filter((row) => row.userId === userId);
    const talked = bundle.conversations.some((row) => row.userId === userId);
    const signed = agreements.find((row) => row.status === "completed" || row.status === "parent_signed");
    const signals: LeadSignals = {
      inquiry: talked || leads.length > 0,
      tours: tours.map((row) => ({ status: String(row.status || "") })),
      bookings: bookings.map((row) => ({ status: String(row.status || "") })),
      waitlist: waitlist.map((row) => ({ status: String(row.status || "") })),
      offers: offers.map((row) => ({ status: String(row.status || "") })),
      agreementStatus: signed?.status ?? newest(agreements)?.status ?? null,
    };
    if (!deriveCentreLeadStage(signals)) continue;
    const person = people.get(userId);
    const name =
      cleanContact(person?.name) ||
      cleanContact(tours.find((row) => row.name)?.name) ||
      cleanContact(leads.find((row) => row.name)?.name);
    const email =
      cleanContact(person?.email, 180) ||
      cleanContact(tours.find((row) => row.email)?.email, 180) ||
      cleanContact(leads.find((row) => row.email)?.email, 180);
    const phone =
      cleanContact(tours.find((row) => row.phone)?.phone, 40) ||
      cleanContact(leads.find((row) => row.phone)?.phone, 40);
    const childLabel =
      cleanContact(waitlist.find((row) => row.childLabel)?.childLabel, 80) ||
      cleanContact(tours.find((row) => row.childLabel)?.childLabel, 80);
    const latestBooking = newest(bookings);
    const latestWait = newest(waitlist);
    const ageGroup = cleanAgeGroup(latestBooking?.ageGroup) || cleanAgeGroup(latestWait?.ageGroup);
    const desiredStart = cleanStartMonth(latestBooking?.startMonth);
    const times = [
      ...bundle.conversations.filter((row) => row.userId === userId).map((row) => row.lastAt),
      ...leads.map((row) => row.at),
      ...tours.map((row) => row.at),
      ...bookings.map((row) => row.at),
      ...waitlist.map((row) => row.at),
      ...offers.map((row) => row.at),
      ...agreements.map((row) => row.at),
    ];
    const startedAt = earliestIso(times);
    const activityAt = latestIso(times);
    if (!startedAt || !activityAt) continue;
    const openTour = tours
      .filter((row) => row.status === "accepted" && row.startAt)
      .map((row) => row.startAt || "")
      .sort();
    const openOffer = offers
      .filter((row) => row.status === "open" && row.expiresAt)
      .map((row) => row.expiresAt || "")
      .sort();
    facts.push({
      parentUserId: userId,
      contactName: name,
      contactEmail: email,
      contactPhone: phone,
      childLabel,
      ageGroup,
      desiredStart,
      signals,
      startedAt,
      activityAt,
      tourAt: openTour[0] || null,
      offerExpiresAt: openOffer[0] || null,
    });
  }
  return facts;
}

export function applyLeadUpdate(input: {
  existing: StoredLead | null;
  fact: LeadFact | null;
  manual?: ManualStage | null;
  now: string;
  id: string;
  daycareId: string;
}): { lead: StoredLead; event: HistoryEvent | null; error?: string } {
  const now = input.now;
  const manual = input.manual;
  const fact = input.fact;
  const auto = fact ? deriveCentreLeadStage(fact.signals) : null;
  const existing = input.existing;

  if (manual && !manual.unlock) {
    if (!isCentreLeadStage(manual.stage)) return fail(existing, "bad_stage");
    if (manual.stage === "lost" && !isLostReason(manual.lostReason)) return fail(existing, "lost_reason");
    const base = existing ?? blankLead(input, fact, auto);
    const next = paintFact(base, fact, auto, now);
    const reason = manual.stage === "lost" ? (manual.lostReason as LostReason) : null;
    const changed = next.stage !== manual.stage || next.stageLocked !== true || next.lostReason !== reason;
    next.stage = manual.stage;
    next.stageLocked = true;
    next.lostReason = reason;
    next.autoRule = "manual";
    next.reached = mergeReached(next.reached, reachedForStage(manual.stage));
    return {
      lead: next,
      event: changed
        ? { fromStage: existing?.stage ?? null, toStage: manual.stage, ruleId: "manual", lostReason: reason, at: now }
        : null,
    };
  }

  if (!existing && !auto) return fail(null, "empty");
  const base = existing ?? blankLead(input, fact, auto);
  const next = paintFact(base, fact, auto, now);
  if (manual?.unlock) next.stageLocked = false;
  if (!existing && auto) {
    next.stage = auto.stage;
    next.lostReason = auto.lostReason;
    return {
      lead: next,
      event: { fromStage: null, toStage: auto.stage, ruleId: auto.ruleId, lostReason: auto.lostReason, at: now },
    };
  }
  if (next.stageLocked || !auto) return { lead: next, event: null };
  if (next.stage === auto.stage && next.lostReason === auto.lostReason) return { lead: next, event: null };
  const from = existing ? existing.stage : null;
  next.stage = auto.stage;
  next.lostReason = auto.lostReason;
  next.reached = mergeReached(next.reached, reachedFromSignals(fact?.signals ?? emptySignals()));
  return {
    lead: next,
    event: { fromStage: from, toStage: auto.stage, ruleId: auto.ruleId, lostReason: auto.lostReason, at: now },
  };
}

function fail(existing: StoredLead | null, error: string): { lead: StoredLead; event: null; error: string } {
  return {
    lead:
      existing ?? {
        id: "",
        daycareId: "",
        parentUserId: null,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        childLabel: null,
        ageGroup: null,
        desiredStart: null,
        source: "inquiry",
        stage: "inquiry",
        autoStage: null,
        autoRule: null,
        stageLocked: false,
        lostReason: null,
        assignedUserId: null,
        reached: emptyReached(),
        startedAt: "",
        lastActivityAt: "",
        tourAt: null,
        offerExpiresAt: null,
        createdAt: "",
        updatedAt: "",
      },
    event: null,
    error,
  };
}

function emptySignals(): LeadSignals {
  return { inquiry: false, tours: [], bookings: [], waitlist: [], offers: [], agreementStatus: null };
}

function reachedForStage(stage: CentreLeadStage): Reached {
  return {
    inquiry: stage !== "lost",
    tour: stage === "tour_booked" || stage === "toured",
    toured: stage === "toured",
    applied: stage === "applied" || stage === "waitlisted" || stage === "offered" || stage === "enrolled",
    enrolled: stage === "enrolled",
  };
}

function blankLead(
  input: { id: string; daycareId: string; now: string },
  fact: LeadFact | null,
  auto: StageDecision | null,
): StoredLead {
  const stage = auto?.stage ?? "inquiry";
  return {
    id: input.id,
    daycareId: input.daycareId,
    parentUserId: fact?.parentUserId ?? null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    childLabel: null,
    ageGroup: null,
    desiredStart: null,
    source: fact?.sourceHint || (fact ? sourceFromSignals(fact.signals) : "manual"),
    stage,
    autoStage: auto?.stage ?? null,
    autoRule: auto?.ruleId ?? null,
    stageLocked: false,
    lostReason: auto?.lostReason ?? null,
    assignedUserId: null,
    reached: fact ? reachedFromSignals(fact.signals) : reachedForStage(stage),
    startedAt: fact?.startedAt ?? input.now,
    lastActivityAt: fact?.activityAt ?? input.now,
    tourAt: fact?.tourAt ?? null,
    offerExpiresAt: fact?.offerExpiresAt ?? null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function paintFact(lead: StoredLead, fact: LeadFact | null, auto: StageDecision | null, now: string): StoredLead {
  if (!fact) {
    return { ...lead, autoStage: auto?.stage ?? lead.autoStage, autoRule: auto?.ruleId ?? lead.autoRule, updatedAt: now };
  }
  const activity = latestIso([lead.lastActivityAt, fact.activityAt]) || now;
  return {
    ...lead,
    parentUserId: lead.parentUserId || fact.parentUserId,
    contactName: keepText(fact.contactName, lead.contactName),
    contactEmail: keepText(fact.contactEmail, lead.contactEmail),
    contactPhone: keepText(fact.contactPhone, lead.contactPhone),
    childLabel: keepText(fact.childLabel, lead.childLabel),
    ageGroup: fact.ageGroup || lead.ageGroup,
    desiredStart: fact.desiredStart || lead.desiredStart,
    autoStage: auto?.stage ?? null,
    autoRule: auto?.ruleId ?? null,
    reached: mergeReached(lead.reached, reachedFromSignals(fact.signals)),
    startedAt: earliestIso([lead.startedAt, fact.startedAt]) || lead.startedAt,
    lastActivityAt: activity,
    tourAt: fact.tourAt,
    offerExpiresAt: fact.offerExpiresAt,
    updatedAt: now,
  };
}

export function assignLead(
  lead: StoredLead,
  staffUserId: string | null,
  memberIds: readonly string[],
): { lead: StoredLead; error?: string } {
  const id = String(staffUserId || "").trim();
  if (!id) return { lead: { ...lead, assignedUserId: null } };
  if (!memberIds.includes(id)) return { lead, error: "not_on_team" };
  return { lead: { ...lead, assignedUserId: id } };
}

/** Selected centre must be one this person belongs to. Never the first centre on the account. */
export function resolveLeadCentre(
  selectedId: string | null | undefined,
  memberships: readonly string[],
): TourCentreDecision {
  return resolveTourCentre({ selectedId, memberships });
}

export function centreLeadAccess(input: {
  centreRole: CentreMemberRole | null;
  daycareId: string;
  accessibleIds: readonly string[];
  action: "read" | "write" | "keys";
}): { ok: true } | { ok: false; error: "not_found" } {
  const daycareId = input.daycareId.trim();
  if (!daycareId || !input.accessibleIds.includes(daycareId) || !input.centreRole) {
    return { ok: false, error: "not_found" };
  }
  if (input.action === "read") return { ok: true };
  if (input.action === "keys") {
    return input.centreRole === "owner" || input.centreRole === "manager" ? { ok: true } : { ok: false, error: "not_found" };
  }
  return centreCanWriteLeads(input.centreRole) ? { ok: true } : { ok: false, error: "not_found" };
}

export type LeadFilter = {
  stage?: string | null;
  ageGroup?: string | null;
  desiredStart?: string | null;
  source?: string | null;
  query?: string | null;
};

export function filterCentreLeads<T extends {
  stage: string;
  ageGroup: string | null;
  desiredStart: string | null;
  source: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  childLabel: string | null;
  noteText?: string | null;
}>(leads: readonly T[], filters: LeadFilter): T[] {
  const stage = String(filters.stage || "").trim();
  const age = String(filters.ageGroup || "").trim();
  const start = String(filters.desiredStart || "").trim();
  const source = String(filters.source || "").trim();
  const query = String(filters.query || "").trim().toLowerCase();
  return leads.filter((lead) => {
    if (stage && lead.stage !== stage) return false;
    if (age && lead.ageGroup !== age) return false;
    if (start && !(lead.desiredStart || "").startsWith(start)) return false;
    if (source && lead.source !== source) return false;
    if (!query) return true;
    const hay = [lead.contactName, lead.contactEmail, lead.contactPhone, lead.childLabel, lead.noteText]
      .join(" ")
      .toLowerCase();
    return hay.includes(query);
  });
}

export type FunnelReport = {
  byStage: Record<CentreLeadStage, number>;
  reached: { inquiry: number; tour: number; toured: number; applied: number; enrolled: number };
  conversion: {
    inquiryToTour: number | null;
    tourToApplication: number | null;
    applicationToEnrolment: number | null;
  };
  medianDays: Record<CentreLeadStage, number | null>;
  lostReasons: { reason: string; count: number }[];
};

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(value * 10) / 10;
}

export function centreLeadFunnel(
  leads: readonly { stage: CentreLeadStage; lostReason: string | null; reached: Reached }[],
  events: readonly { leadId: string; fromStage: CentreLeadStage | null; toStage: CentreLeadStage; at: string }[],
): FunnelReport {
  const byStage = Object.fromEntries(CENTRE_LEAD_STAGES.map((stage) => [stage, 0])) as Record<CentreLeadStage, number>;
  const reached = { inquiry: 0, tour: 0, toured: 0, applied: 0, enrolled: 0 };
  const lost = new Map<string, number>();
  for (const lead of leads) {
    if (isCentreLeadStage(lead.stage)) byStage[lead.stage] += 1;
    if (lead.reached.inquiry) reached.inquiry += 1;
    if (lead.reached.tour) reached.tour += 1;
    if (lead.reached.toured) reached.toured += 1;
    if (lead.reached.applied) reached.applied += 1;
    if (lead.reached.enrolled) reached.enrolled += 1;
    if (lead.stage === "lost" && lead.lostReason) lost.set(lead.lostReason, (lost.get(lead.lostReason) || 0) + 1);
  }
  const spans = new Map<CentreLeadStage, number[]>();
  const byLead = new Map<string, { fromStage: CentreLeadStage | null; toStage: CentreLeadStage; at: string }[]>();
  for (const event of events) {
    const list = byLead.get(event.leadId) ?? [];
    list.push(event);
    byLead.set(event.leadId, list);
  }
  for (const list of byLead.values()) {
    const ordered = [...list].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const current = ordered[i]!;
      const next = ordered[i + 1]!;
      const days = (Date.parse(next.at) - Date.parse(current.at)) / 86_400_000;
      if (!Number.isFinite(days) || days < 0) continue;
      const bucket = spans.get(current.toStage) ?? [];
      bucket.push(days);
      spans.set(current.toStage, bucket);
    }
  }
  const medianDays = Object.fromEntries(
    CENTRE_LEAD_STAGES.map((stage) => [stage, median(spans.get(stage) ?? [])]),
  ) as Record<CentreLeadStage, number | null>;
  return {
    byStage,
    reached,
    conversion: {
      inquiryToTour: rate(reached.tour, reached.inquiry),
      tourToApplication: rate(reached.applied, reached.tour),
      applicationToEnrolment: rate(reached.enrolled, reached.applied),
    },
    medianDays,
    lostReasons: [...lost.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
  };
}

export type AlertKind = "new_lead" | "stale" | "tour_tomorrow" | "offer_expiring";

export type AlertPlan = {
  key: string;
  kind: AlertKind;
  leadId: string;
  inApp: true;
  email: "held" | "skip";
  push: "held" | "skip";
  sms: "skip";
  reason: string;
};

const DAY_MS = 86_400_000;

function dayKey(iso: string, timeZone: string): string | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return null;
  }
}

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year || 1970, (month || 1) - 1, date || 1));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

/**
 * In-app only. Email and push stay held behind preferences, CASL, quiet hours, and the live flag.
 * Nothing before the enable time is replayed. SMS is never planned.
 */
export function planCentreLeadAlerts(input: {
  now: Date;
  enabledAt: string | null;
  staleDays: number;
  timeZone: string | null;
  emailWanted: boolean;
  pushWanted: boolean;
  caslEmail: boolean;
  live: boolean;
  quiet?: boolean;
  leads: readonly {
    id: string;
    stage: CentreLeadStage;
    startedAt: string;
    lastActivityAt: string;
    tourAt: string | null;
    offerExpiresAt: string | null;
  }[];
  already: ReadonlySet<string>;
}): AlertPlan[] {
  const enabled = input.enabledAt ? Date.parse(input.enabledAt) : NaN;
  if (!Number.isFinite(enabled)) return [];
  const staleDays = Number.isFinite(input.staleDays) && input.staleDays >= 1 ? Math.min(30, Math.floor(input.staleDays)) : 3;
  const zone = input.timeZone || "UTC";
  const quiet = input.quiet ?? quietHourInZone(input.now, input.timeZone);
  const today = dayKey(input.now.toISOString(), zone);
  const plans: AlertPlan[] = [];
  for (const lead of input.leads) {
    const started = Date.parse(lead.startedAt);
    if (Number.isFinite(started) && started >= enabled && lead.stage !== "lost" && lead.stage !== "enrolled") {
      pushAlert(plans, input.already, {
        key: `new:${lead.id}`,
        kind: "new_lead",
        leadId: lead.id,
        quiet,
        emailWanted: input.emailWanted,
        pushWanted: input.pushWanted,
        caslEmail: input.caslEmail,
        live: input.live,
      });
    }
    if (lead.stage !== "lost" && lead.stage !== "enrolled") {
      const activity = Date.parse(lead.lastActivityAt);
      const staleAt = activity + staleDays * DAY_MS;
      if (Number.isFinite(activity) && staleAt >= enabled && input.now.getTime() >= staleAt) {
        pushAlert(plans, input.already, {
          key: `stale:${lead.id}:${lead.lastActivityAt}`,
          kind: "stale",
          leadId: lead.id,
          quiet,
          emailWanted: input.emailWanted,
          pushWanted: input.pushWanted,
          caslEmail: input.caslEmail,
          live: input.live,
        });
      }
    }
    if (lead.tourAt && today) {
      const tourDay = dayKey(lead.tourAt, zone);
      const tourMs = Date.parse(lead.tourAt);
      if (tourDay && tourDay === addDays(today, 1) && tourMs >= enabled) {
        pushAlert(plans, input.already, {
          key: `tour:${lead.id}:${tourDay}`,
          kind: "tour_tomorrow",
          leadId: lead.id,
          quiet,
          emailWanted: input.emailWanted,
          pushWanted: input.pushWanted,
          caslEmail: input.caslEmail,
          live: input.live,
        });
      }
    }
    if (lead.offerExpiresAt) {
      const expires = Date.parse(lead.offerExpiresAt);
      const left = expires - input.now.getTime();
      if (expires >= enabled && left > 0 && left <= DAY_MS) {
        pushAlert(plans, input.already, {
          key: `offer:${lead.id}:${lead.offerExpiresAt}`,
          kind: "offer_expiring",
          leadId: lead.id,
          quiet,
          emailWanted: input.emailWanted,
          pushWanted: input.pushWanted,
          caslEmail: input.caslEmail,
          live: input.live,
        });
      }
    }
  }
  return plans;
}

function pushAlert(
  plans: AlertPlan[],
  already: ReadonlySet<string>,
  input: {
    key: string;
    kind: AlertKind;
    leadId: string;
    quiet: boolean;
    emailWanted: boolean;
    pushWanted: boolean;
    caslEmail: boolean;
    live: boolean;
  },
) {
  if (already.has(input.key)) return;
  const emailOk = input.emailWanted && input.caslEmail && input.live && !input.quiet;
  const pushOk = input.pushWanted && input.live && !input.quiet;
  plans.push({
    key: input.key,
    kind: input.kind,
    leadId: input.leadId,
    inApp: true,
    email: emailOk ? "held" : "skip",
    push: pushOk ? "held" : "skip",
    sms: "skip",
    reason: input.quiet ? "quiet" : input.live ? "held" : "flag",
  });
}

/** This build never releases email, push, or SMS. */
export function leadAlertMaySend(plan: AlertPlan): false {
  void plan;
  return false;
}

export function planLeadStageEvent(input: {
  hiddenCentre: boolean;
  from: string | null;
  to: string;
  rule: string;
  lostReason: string | null;
}): { event: "centre_lead_stage"; properties: { source: string; result: string; type: string; reason: string } } | null {
  if (input.hiddenCentre) return null;
  if (!isCentreLeadStage(input.to)) return null;
  return {
    event: "centre_lead_stage",
    properties: {
      source: input.rule.slice(0, 40),
      result: input.to,
      type: (input.from || "none").slice(0, 40),
      reason: (input.lostReason || "none").slice(0, 40),
    },
  };
}

const HEALTH = /allerg|medic|immun|birth|doctor|emergency|health|diagnos|\bsin\b|custody/i;

export function healthFieldNames(body: Record<string, unknown> | null | undefined): string[] {
  return Object.keys(body || {}).filter((key) => HEALTH.test(key));
}

export type PublicNote = { id: string; body: string; createdAt: string };

export type PublicLead = {
  id: string;
  stage: CentreLeadStage;
  stageLocked: boolean;
  lostReason: LostReason | null;
  source: LeadSource;
  ageGroup: string | null;
  desiredStart: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  childLabel: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  notes?: PublicNote[];
};

export function toPublicLead(row: Record<string, unknown>): PublicLead {
  const stage = isCentreLeadStage(String(row.stage || "")) ? (row.stage as CentreLeadStage) : "inquiry";
  const source = (LEAD_SOURCES as readonly string[]).includes(String(row.source || ""))
    ? (row.source as LeadSource)
    : "inquiry";
  const notes = Array.isArray(row.notes)
    ? row.notes.flatMap((note) => {
        if (!note || typeof note !== "object") return [];
        const item = note as Record<string, unknown>;
        const body = cleanNote(String(item.body || ""));
        if (!body) return [];
        return [{ id: String(item.id || ""), body, createdAt: String(item.createdAt || "") }];
      })
    : undefined;
  return {
    id: String(row.id || ""),
    stage,
    stageLocked: row.stageLocked === true,
    lostReason: isLostReason(String(row.lostReason || "")) ? (row.lostReason as LostReason) : null,
    source,
    ageGroup: cleanAgeGroup(String(row.ageGroup || "")),
    desiredStart: cleanStartMonth(String(row.desiredStart || "")),
    contactName: cleanContact(String(row.contactName || "")),
    contactEmail: cleanContact(String(row.contactEmail || ""), 180),
    contactPhone: cleanContact(String(row.contactPhone || ""), 40),
    childLabel: cleanContact(String(row.childLabel || ""), 80),
    assignedTo: cleanContact(String(row.assignedTo || row.assignedUserId || ""), 80),
    createdAt: String(row.createdAt || ""),
    updatedAt: String(row.updatedAt || ""),
    lastActivityAt: String(row.lastActivityAt || ""),
    notes,
  };
}

export const LEAD_PRIVACY_NOTICE = {
  en: "This is information the family shared with your centre. KidEase does not include child health details. Once this data leaves KidEase, your centre is responsible for it under PIPEDA and Quebec Law 25.",
  fr: "Ce sont les renseignements que la famille a partagés avec votre centre. KidEase n’inclut aucun renseignement de santé de l’enfant. Quand ces données quittent KidEase, votre centre en est responsable selon la LPRPDE et la Loi 25 du Québec.",
} as const;

export function stageRank(stage: CentreLeadStage): number {
  return STAGE_RANK[stage];
}
