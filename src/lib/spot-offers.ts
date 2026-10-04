/**
 * Free daycare waitlist and 48-hour spot offers.
 * No fees. Included on every plan. Email stays behind a flag (default off).
 * Node tests load this file directly. No @/ imports.
 */

export const SPOT_OFFER_WINDOW_MS = 48 * 60 * 60 * 1000;

export const WAITLIST_FEE_FORBIDDEN = "KidEase does not charge a waitlist fee.";

export const SPOT_AGES = ["infant", "toddler", "preschool", "any"] as const;
export type SpotAge = (typeof SPOT_AGES)[number];

export const WAITLIST_STATUSES = [
  "waiting",
  "offered",
  "accepted",
  "declined",
  "expired",
  "withdrawn",
] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const OFFER_STATUSES = ["open", "accepted", "declined", "expired"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export type WaitlistEntry = {
  id: string;
  daycareId: string;
  userId: string;
  ageGroup: SpotAge;
  status: WaitlistStatus;
  joinedAt: string;
  sibling?: boolean;
  startDate?: string | null;
};

export type SpotOffer = {
  id: string;
  waitlistId: string;
  daycareId: string;
  userId: string;
  ageGroup: SpotAge;
  status: OfferStatus;
  offeredAt: string;
  expiresAt: string;
};

export type QueueSnapshot = {
  entries: WaitlistEntry[];
  offers: SpotOffer[];
  /** Daycare toggle. Off leaves sibling out of the offer order. */
  siblingPriority?: boolean;
};

export type QueueStep = {
  ok: boolean;
  error?: string;
  state: QueueSnapshot;
  createdOffers: SpotOffer[];
};

const FEE_KEYS = ["fee", "feeCents", "amount", "charge", "waitlistFee", "price", "deposit"] as const;

export function waitlistIncludedOnEveryPlan(): true {
  return true;
}

export function parseSpotAge(raw: unknown): SpotAge | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return (SPOT_AGES as readonly string[]).includes(value) ? (value as SpotAge) : null;
}

/** Reject any waitlist fee. Missing keys are fine. Zero is fine. */
export function rejectWaitlistFee(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const rec = input as Record<string, unknown>;
  for (const key of FEE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(rec, key)) continue;
    const value = rec[key];
    if (value == null || value === "" || value === 0 || value === "0" || value === false) continue;
    return WAITLIST_FEE_FORBIDDEN;
  }
  return null;
}

export function spotOfferMailPlan(enabled: boolean): { sendEmail: boolean; reason: "flag_off" | "flag_on" } {
  return enabled ? { sendEmail: true, reason: "flag_on" } : { sendEmail: false, reason: "flag_off" };
}

export function offerExpiresAt(offeredAtMs: number): string {
  return new Date(offeredAtMs + SPOT_OFFER_WINDOW_MS).toISOString();
}

export function isLiveOffer(offer: SpotOffer, now: number): boolean {
  return offer.status === "open" && Date.parse(offer.expiresAt) > now;
}

function cloneState(state: QueueSnapshot): QueueSnapshot {
  return {
    entries: state.entries.map((row) => ({ ...row })),
    offers: state.offers.map((row) => ({ ...row })),
    siblingPriority: state.siblingPriority === true,
  };
}

function fail(state: QueueSnapshot, error: string): QueueStep {
  return { ok: false, error, state, createdOffers: [] };
}

function byJoined(a: WaitlistEntry, b: WaitlistEntry): number {
  const cmp = a.joinedAt.localeCompare(b.joinedAt);
  if (cmp !== 0) return cmp;
  return a.id.localeCompare(b.id);
}

export function placeInLine(entries: readonly WaitlistEntry[], entryId: string): number | null {
  const mine = entries.find((row) => row.id === entryId);
  if (!mine) return null;
  if (mine.status !== "waiting" && mine.status !== "offered") return null;
  const line = entries
    .filter((row) => row.daycareId === mine.daycareId && (row.status === "waiting" || row.status === "offered"))
    .slice()
    .sort(byJoined);
  const index = line.findIndex((row) => row.id === entryId);
  return index < 0 ? null : index + 1;
}

function startSortKey(value: string | null | undefined) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "9999-99-99";
  return raw;
}

/**
 * Offer order: sibling first only when the daycare turned that on,
 * then an age match, then an earlier start date, then sign-up date.
 * A missing start date stays last. It is not invented.
 */
export function fairOfferOrder(
  entries: readonly WaitlistEntry[],
  options: { siblingPriority: boolean; spotAge: SpotAge },
): WaitlistEntry[] {
  const ageRank = (row: WaitlistEntry) => {
    if (options.spotAge === "any") return 0;
    if (row.ageGroup === options.spotAge) return 0;
    if (row.ageGroup === "any") return 1;
    return 2;
  };
  return entries.slice().sort((a, b) => {
    if (options.siblingPriority) {
      const sibling = Number(b.sibling === true) - Number(a.sibling === true);
      if (sibling !== 0) return sibling;
    }
    const age = ageRank(a) - ageRank(b);
    if (age !== 0) return age;
    const start = startSortKey(a.startDate).localeCompare(startSortKey(b.startDate));
    if (start !== 0) return start;
    return byJoined(a, b);
  });
}

export type WaitlistAuditRow = {
  place: number;
  entryId: string;
  sibling: boolean;
  ageGroup: SpotAge;
  startDate: string;
  joinedAt: string;
};

/** Daycare export. No parent email, phone, or child name. */
export function waitlistAuditCsv(rows: readonly WaitlistAuditRow[]): string {
  const lines = ["place,entry_id,sibling,age,start_date,joined_at"];
  for (const row of rows) {
    lines.push(
      [row.place, row.entryId, row.sibling ? "yes" : "no", row.ageGroup, row.startDate, row.joinedAt].join(","),
    );
  }
  return lines.join("\n");
}

export function auditRowsForOffer(
  entries: readonly WaitlistEntry[],
  options: { siblingPriority: boolean; spotAge: SpotAge },
): WaitlistAuditRow[] {
  return fairOfferOrder(entries, options)
    .filter((row) => row.status === "waiting" || row.status === "offered")
    .map((row, index) => ({
      place: index + 1,
      entryId: row.id,
      sibling: row.sibling === true,
      ageGroup: row.ageGroup,
      startDate: startSortKey(row.startDate) === "9999-99-99" ? "" : startSortKey(row.startDate),
      joinedAt: row.joinedAt,
    }));
}

function pickNext(
  entries: readonly WaitlistEntry[],
  daycareId: string,
  age: SpotAge,
  siblingPriority = false,
): WaitlistEntry | null {
  const waiting = entries.filter((row) => row.daycareId === daycareId && row.status === "waiting");
  const ordered = fairOfferOrder(waiting, { siblingPriority, spotAge: age });
  return ordered.find((row) => age === "any" || row.ageGroup === age || row.ageGroup === "any") ?? null;
}

function openOfferFor(offers: readonly SpotOffer[], daycareId: string, now: number): SpotOffer | undefined {
  return offers.find((row) => row.daycareId === daycareId && isLiveOffer(row, now));
}

function mintOffer(
  state: QueueSnapshot,
  entry: WaitlistEntry,
  now: number,
  nextId: () => string,
): SpotOffer {
  const offer: SpotOffer = {
    id: nextId(),
    waitlistId: entry.id,
    daycareId: entry.daycareId,
    userId: entry.userId,
    ageGroup: entry.ageGroup,
    status: "open",
    offeredAt: new Date(now).toISOString(),
    expiresAt: offerExpiresAt(now),
  };
  entry.status = "offered";
  state.offers.push(offer);
  return offer;
}

function closeOpen(
  state: QueueSnapshot,
  daycareId: string,
  now: number,
  nextStatus: "declined" | "expired",
  entryStatus: WaitlistStatus,
): SpotOffer | null {
  const offer = state.offers.find((row) => row.daycareId === daycareId && row.status === "open");
  if (!offer) return null;
  if (nextStatus === "expired" && Date.parse(offer.expiresAt) > now) return null;
  offer.status = nextStatus;
  const entry = state.entries.find((row) => row.id === offer.waitlistId);
  if (entry && entry.status === "offered") entry.status = entryStatus;
  return offer;
}

function advanceAfterClose(
  state: QueueSnapshot,
  closed: SpotOffer | null,
  now: number,
  nextId: () => string,
): SpotOffer[] {
  if (!closed) return [];
  if (openOfferFor(state.offers, closed.daycareId, now)) return [];
  const next = pickNext(state.entries, closed.daycareId, closed.ageGroup, state.siblingPriority === true);
  if (!next) return [];
  return [mintOffer(state, next, now, nextId)];
}

/** Mark overdue open offers expired and offer the next matching family. */
export function expireDue(state: QueueSnapshot, now: number, nextId: () => string): QueueStep {
  const copy = cloneState(state);
  const created: SpotOffer[] = [];
  const daycares = [...new Set(copy.offers.filter((row) => row.status === "open").map((row) => row.daycareId))];
  for (const daycareId of daycares) {
    const overdue = copy.offers.find(
      (row) => row.daycareId === daycareId && row.status === "open" && Date.parse(row.expiresAt) <= now,
    );
    if (!overdue) continue;
    const closed = closeOpen(copy, daycareId, now, "expired", "expired");
    created.push(...advanceAfterClose(copy, closed, now, nextId));
  }
  return { ok: true, state: copy, createdOffers: created };
}

export function sendSpotToFamily(
  state: QueueSnapshot,
  entryId: string,
  now: number,
  nextId: () => string,
): QueueStep {
  const expired = expireDue(state, now, nextId);
  const copy = expired.state;
  const entry = copy.entries.find((row) => row.id === entryId);
  if (!entry || entry.status !== "waiting") {
    return { ok: false, error: "That family is not waiting.", state: copy, createdOffers: expired.createdOffers };
  }
  if (openOfferFor(copy.offers, entry.daycareId, now)) {
    return {
      ok: false,
      error: "Another family already has an open offer. Wait for their answer.",
      state: copy,
      createdOffers: expired.createdOffers,
    };
  }
  const offer = mintOffer(copy, entry, now, nextId);
  return { ok: true, state: copy, createdOffers: [...expired.createdOffers, offer] };
}

export function respondToOffer(
  state: QueueSnapshot,
  offerId: string,
  decision: "accept" | "decline",
  now: number,
  nextId: () => string,
): QueueStep {
  const expired = expireDue(state, now, nextId);
  const copy = expired.state;
  const offer = copy.offers.find((row) => row.id === offerId);
  if (!offer || !isLiveOffer(offer, now)) {
    if (expired.createdOffers.length) {
      return { ok: false, error: "This offer has ended. The next family has the offer.", state: copy, createdOffers: expired.createdOffers };
    }
    return fail(state, "This offer has ended.");
  }
  const entry = copy.entries.find((row) => row.id === offer.waitlistId);
  if (decision === "accept") {
    offer.status = "accepted";
    if (entry) entry.status = "accepted";
    return { ok: true, state: copy, createdOffers: expired.createdOffers };
  }
  offer.status = "declined";
  if (entry && entry.status === "offered") entry.status = "declined";
  const created = advanceAfterClose(copy, offer, now, nextId);
  return { ok: true, state: copy, createdOffers: [...expired.createdOffers, ...created] };
}

export function withdrawFromWaitlist(
  state: QueueSnapshot,
  entryId: string,
  now: number,
  nextId: () => string,
): QueueStep {
  const expired = expireDue(state, now, nextId);
  const copy = expired.state;
  const entry = copy.entries.find((row) => row.id === entryId);
  if (!entry) return fail(state, "You are not on this waitlist.");
  if (entry.status === "withdrawn") return { ok: true, state: copy, createdOffers: expired.createdOffers };
  if (entry.status === "accepted") return fail(state, "This spot is already accepted.");
  if (entry.status !== "waiting" && entry.status !== "offered") {
    return fail(state, "You are not on this waitlist.");
  }
  const wasOffered = entry.status === "offered";
  entry.status = "withdrawn";
  let created = [...expired.createdOffers];
  if (wasOffered) {
    const offer = copy.offers.find((row) => row.waitlistId === entry.id && row.status === "open");
    if (offer) {
      offer.status = "declined";
      created = [...created, ...advanceAfterClose(copy, offer, now, nextId)];
    }
  }
  return { ok: true, state: copy, createdOffers: created };
}

export function activeEntryForUser(
  entries: readonly WaitlistEntry[],
  daycareId: string,
  userId: string,
): WaitlistEntry | null {
  return (
    entries.find(
      (row) =>
        row.daycareId === daycareId &&
        row.userId === userId &&
        (row.status === "waiting" || row.status === "offered"),
    ) ?? null
  );
}
