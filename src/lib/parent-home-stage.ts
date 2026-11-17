import { isEnrolledBookingStatus } from "./daily-care.ts";

export type ParentHomeStage = "pending" | "searching" | "enrolled";
export type ParentHomeSection =
  "care" | "attention" | "bills" | "matches" | "requests" | "saved" | "search" | "area" | "plan";

/** Use family bookings, never the parent's private shortlist tracker labels. */
export function parentHomeStage(
  bookings: readonly { status: string }[],
  settled: boolean,
): ParentHomeStage {
  if (!settled) return "pending";
  return bookings.some((booking) => isEnrolledBookingStatus(booking.status))
    ? "enrolled"
    : "searching";
}

/** DOM order also defines the reading and keyboard order. Mixed families keep search. */
export function parentHomeSectionOrder(stage: ParentHomeStage): readonly ParentHomeSection[] {
  if (stage === "pending") return [];
  return stage === "enrolled"
    ? ["care", "attention", "bills", "matches", "requests", "saved", "search", "area", "plan"]
    : ["matches", "requests", "attention", "saved", "bills", "search", "area", "plan"];
}
