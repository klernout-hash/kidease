/**
 * Booking-deposit honesty. `/pay/$bookingId` must never mark a booking or
 * payment `paid` without Stripe confirmation. Card / wallet PAN fields are
 * decorative and are refused. Interac is staff-reviewed only.
 *
 * Real card charges live on invoice Stripe Checkout (`createBillCheckout`)
 * and Parent Plus Checkout. Do not invent a second charge path here.
 */

import type { PayMethod } from "./types";

export const INTERAC_PENDING_STATUS = "pending_review";

export const BOOKING_CARD_PAY_DISABLED =
  "Card, Apple Pay, Google Pay, and PayPal deposits are not charged on this page. Pay the bill your centre sends with Stripe Checkout, or email support@kidease.ca.";

export const INTERAC_SELF_CONFIRM_DISABLED =
  "Interac is waiting for KidEase staff to confirm the transfer. This page cannot mark it paid.";

export function isInteracMethod(method: string): boolean {
  return method === "interac";
}

export function isDecorativeBookingPayMethod(method: string): boolean {
  return !isInteracMethod(method);
}

/** Card/wallet methods throw. Interac is pending-review only — never `paid`. */
export function bookingPayInsertStatus(method: PayMethod | string): typeof INTERAC_PENDING_STATUS {
  if (isInteracMethod(method)) return INTERAC_PENDING_STATUS;
  throw new Error(BOOKING_CARD_PAY_DISABLED);
}

export function canParentMarkBookingPaid(): false {
  return false;
}
