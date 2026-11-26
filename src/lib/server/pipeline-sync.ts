import type { Sql } from "@/lib/db";
import type { BookingStatus } from "@/lib/types";

/** Booking status → the parent's lead card status. Other states leave the card alone. */
export function leadStatusForBooking(status: BookingStatus): "confirmed" | "declined" | null {
  if (status === "accepted" || status === "active") return "confirmed";
  if (status === "declined" || status === "cancelled") return "declined";
  return null;
}

/** After the owner accepts or declines a spot request, move the matching lead so the parent gets the alert. */
export async function syncBookingLeadStatus(
  sql: Sql,
  bookingId: string,
  status: BookingStatus,
  actorId: string,
) {
  const next = leadStatusForBooking(status);
  if (!next) return;
  await sql`
    update lead_requests
    set status = ${next},
        responded_by = coalesce(responded_by, ${actorId}),
        responded_at = coalesce(responded_at, now()),
        updated_at = now()
    where source_kind = 'booking'
      and source_id = ${bookingId}
      and status not in ('closed', ${next})
  `;
}

/** A lead card "confirm" or "decline" on a spot request also answers the booking. */
export async function applyLeadDecisionToBooking(bookingId: string, action: "confirm" | "decline") {
  const { updateRequestStatus } = await import("@/lib/server/family");
  await updateRequestStatus({
    data: { bookingId, status: action === "confirm" ? "accepted" : "declined" },
  });
}
