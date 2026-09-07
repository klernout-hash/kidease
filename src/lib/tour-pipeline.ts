/**
 * Tour → enrol pipeline shown on parent shortlist/inbox and the centre desk.
 *
 * Stored tour statuses stay honest: pending / accepted / declined plus
 * completed / enrolled / lost when a real action happened.
 * Display labels: Requested → Confirmed → Completed → Enrolled / Lost.
 * Booking accepted/active is Enrolled. Booking declined/cancelled is Lost.
 * Missing tour + missing booking → no status (never invented).
 */

import type { BookingStatus, TourStatus } from "@/lib/types";

export const TOUR_PIPELINE_STATUSES = [
  "pending",
  "accepted",
  "completed",
  "enrolled",
  "declined",
  "lost",
] as const;

export type TourPipelineStatus = (typeof TOUR_PIPELINE_STATUSES)[number];

export const PIPELINE_STAGES = ["requested", "confirmed", "completed", "enrolled", "lost"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export function isTourPipelineStatus(value: string): value is TourPipelineStatus {
  return (TOUR_PIPELINE_STATUSES as readonly string[]).includes(value);
}

export function tourToPipelineStage(status: string | null | undefined): PipelineStage | null {
  if (!status) return null;
  if (status === "pending") return "requested";
  if (status === "accepted") return "confirmed";
  if (status === "completed") return "completed";
  if (status === "enrolled") return "enrolled";
  if (status === "declined" || status === "lost") return "lost";
  return null;
}

export function bookingToPipelineStage(status: BookingStatus | null | undefined): PipelineStage | null {
  if (!status) return null;
  if (status === "accepted" || status === "active") return "enrolled";
  if (status === "declined" || status === "cancelled") return "lost";
  if (status === "requested" || status === "under_review" || status === "waitlist") return "requested";
  return null;
}

/**
 * Combine the latest tour and booking on a thread.
 * Enrolment / loss from a real booking wins over an earlier tour step.
 */
export function threadPipelineStage(input: {
  tourStatus?: string | null;
  bookingStatus?: BookingStatus | null;
}): PipelineStage | null {
  const booking = bookingToPipelineStage(input.bookingStatus);
  if (booking === "enrolled" || booking === "lost") return booking;
  const tour = tourToPipelineStage(input.tourStatus);
  if (tour === "enrolled" || tour === "lost") return tour;
  if (tour === "completed") return "completed";
  if (tour === "confirmed") return "confirmed";
  return tour ?? booking;
}

export function canAdvanceTour(current: string, next: string): next is TourStatus {
  if (!isTourPipelineStatus(next)) return false;
  if (current === "pending") return next === "accepted" || next === "declined" || next === "lost";
  if (current === "accepted") return next === "completed" || next === "lost" || next === "enrolled";
  if (current === "completed") return next === "enrolled" || next === "lost";
  return false;
}

export function nextTourPipeline(current: string, next: string): TourStatus | null {
  return canAdvanceTour(current, next) ? (next as TourStatus) : null;
}

/** Booking decisions that should stamp a linked tour — never invent a tour row. */
export function tourStatusFromBooking(status: BookingStatus): TourStatus | null {
  if (status === "accepted" || status === "active") return "enrolled";
  if (status === "declined" || status === "cancelled") return "lost";
  return null;
}

export const PIPELINE_COPY_KEY = {
  requested: "pipelineRequested",
  confirmed: "pipelineConfirmed",
  completed: "pipelineCompleted",
  enrolled: "pipelineEnrolled",
  lost: "pipelineLost",
} as const;
