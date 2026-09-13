/**
 * Tour inventory + soft-hold SLA.
 *
 * Parent book → pending soft-hold (24–48h). Pending and accepted occupy a seat.
 * Expired / declined / lost / cancelled free the slot. Not Instant Book placement.
 */

export const TOUR_HOLD_SLA_MIN_HOURS = 24;
export const TOUR_HOLD_SLA_HOURS = 48;

export const TOUR_SEAT_HOLD_STATUSES = ["pending", "accepted"] as const;
export const TOUR_INVENTORY_STATES = ["open", "soft_hold", "confirmed", "blocked"] as const;

export type TourInventoryState = (typeof TOUR_INVENTORY_STATES)[number];

export const TOUR_INVENTORY_COPY_KEY = {
  open: "tourInventoryOpen",
  soft_hold: "tourInventorySoftHold",
  confirmed: "tourInventoryConfirmed",
  blocked: "tourInventoryBlocked",
} as const;

export function isTourSeatHoldStatus(status: string | null | undefined): boolean {
  return status === "pending" || status === "accepted";
}

export function holdExpiresAtMs(createdAt: string, hours = TOUR_HOLD_SLA_HOURS): number | null {
  const start = Date.parse(createdAt);
  if (!Number.isFinite(start)) return null;
  return start + hours * 60 * 60 * 1000;
}

export function holdExpiresAtIso(from = new Date(), hours = TOUR_HOLD_SLA_HOURS): string {
  return new Date(from.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function resolveHoldExpiresAt(
  holdExpiresAt: string | null | undefined,
  createdAt: string,
  hours = TOUR_HOLD_SLA_HOURS,
): number | null {
  if (holdExpiresAt) {
    const ts = Date.parse(holdExpiresAt);
    if (Number.isFinite(ts)) return ts;
  }
  return holdExpiresAtMs(createdAt, hours);
}

export function tourHoldRemainingMs(
  input: { holdExpiresAt?: string | null; createdAt: string },
  now = Date.now(),
): number | null {
  const deadline = resolveHoldExpiresAt(input.holdExpiresAt, input.createdAt);
  if (deadline == null) return null;
  return deadline - now;
}

export function isSoftHoldExpired(input: {
  status: string;
  holdExpiresAt?: string | null;
  createdAt: string;
  now?: number;
}): boolean {
  if (input.status !== "pending") return false;
  const remaining = tourHoldRemainingMs(input, input.now ?? Date.now());
  return remaining != null && remaining <= 0;
}

export function declineReasonValid(note: string | null | undefined): boolean {
  return (note || "").trim().length >= 2;
}

export function canProposeTourTime(status: string): boolean {
  return status === "pending" || status === "accepted";
}

export function canCancelTour(status: string): boolean {
  return status === "pending" || status === "accepted";
}

/** Window inventory from real seat counts. Past / unbookable → Blocked. */
export function tourInventoryState(input: {
  remaining: number;
  pending: number;
  accepted: number;
  bookable: boolean;
}): TourInventoryState {
  if (!input.bookable) return "blocked";
  if (input.pending > 0) return "soft_hold";
  if (input.remaining <= 0) return input.accepted > 0 ? "confirmed" : "blocked";
  return "open";
}
