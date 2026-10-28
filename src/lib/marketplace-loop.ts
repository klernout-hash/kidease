/**
 * Parent → provider marketplace loop.
 * Booking buttons, tour steps, and waitlist labels stay in one place
 * so a second account cannot invent a status the desk does not offer.
 */
import type { BookingStatus } from "./types.ts";
import { parentWaitlistStatus, type ParentWaitlistStatus } from "./waitlist-tracker.ts";
import { tourStatusStampedByBooking, type TourPipelineStatus } from "./tour-pipeline.ts";

export const PROVIDER_BOOKING_STATUSES = ["under_review", "accepted", "waitlist", "declined"] as const;

export type ProviderBookingStatus = (typeof PROVIDER_BOOKING_STATUSES)[number];

/** Centre desk buttons. Same set the inbox sends. Anything else is rejected. */
export function providerMaySetBookingStatus(next: string): next is ProviderBookingStatus {
  return (PROVIDER_BOOKING_STATUSES as readonly string[]).includes(next);
}

export type MarketplaceLoopState = {
  booking: BookingStatus;
  tour: TourPipelineStatus | null;
  waitlist: ParentWaitlistStatus | null;
};

/** Parent files a spot request. Tour and waitlist follow that real status. */
export function parentOpensMarketplaceLoop(): MarketplaceLoopState {
  return {
    booking: "requested",
    tour: "pending",
    waitlist: parentWaitlistStatus("requested"),
  };
}

/**
 * Provider moves the request. Illegal booking buttons and illegal tour jumps
 * leave the previous state and report why.
 */
export function advanceMarketplaceLoop(
  state: MarketplaceLoopState,
  nextBooking: string,
): { state: MarketplaceLoopState; ok: boolean; error: string | null } {
  if (!providerMaySetBookingStatus(nextBooking)) {
    return { state, ok: false, error: "Invalid status" };
  }
  const booking = nextBooking;
  const tour = state.tour ? tourStatusStampedByBooking(state.tour, booking) ?? state.tour : state.tour;
  return {
    ok: true,
    error: null,
    state: {
      booking,
      tour,
      waitlist: parentWaitlistStatus(booking),
    },
  };
}
