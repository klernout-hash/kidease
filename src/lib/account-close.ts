/**
 * What account deletion cancels now, and what the 30-day purge removes.
 * Pure: scripts/account-close.test.mjs loads this in Node. No database.
 *
 * Billing rows and fraud logs are kept. Payments are not touched.
 */

import { nextTourStatus } from "./threads.ts";

/** Spot requests that are still open. Enrolment (accepted / active) stays until purge. */
export const PENDING_BOOKING_STATUSES = ["requested", "under_review", "waitlist"] as const;

/** Leads the centre has not finished. */
export const OPEN_LEAD_STATUSES = ["requested", "received"] as const;

/** Shown on the tour row. No parent name, email, or child name. */
export const ACCOUNT_CLOSE_NOTE = "Closed because this parent deleted their KidEase account.";

export function bookingCloseStatus(status: string): "cancelled" | null {
  return (PENDING_BOOKING_STATUSES as readonly string[]).includes(status) ? "cancelled" : null;
}

/** Pending and accepted visits are still open. Map them onto the existing lost status. */
export function tourCloseStatus(status: string): "lost" | null {
  const next = nextTourStatus(status, "lost");
  return next === "lost" ? "lost" : null;
}

export function leadCloseStatus(status: string): "closed" | null {
  return (OPEN_LEAD_STATUSES as readonly string[]).includes(status) ? "closed" : null;
}

/** Public deletion page. Same path the stores can list. French is the /fr prefix. */
export function accountDeletionUrl(locale: "en" | "fr"): string {
  return locale === "fr"
    ? "https://www.kidease.ca/fr/delete-account"
    : "https://www.kidease.ca/delete-account";
}
