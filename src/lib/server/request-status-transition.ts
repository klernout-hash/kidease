import type { Sql } from "@/lib/db";
import type { BookingStatus } from "@/lib/types";

/**
 * Claim one status change using the row's current status, not a caller's stale
 * read. PostgreSQL and PGlite both lock and update within this one statement.
 * Only a returned transition owns the handler's capacity and notification work.
 */
export async function claimRequestStatusTransition(
  sql: Sql,
  bookingId: string,
  status: BookingStatus,
): Promise<{ previousStatus: BookingStatus } | null> {
  const claim = (withTimestamp: boolean) =>
    sql.query<{ previous_status: BookingStatus }>(
      `with previous as (
         select id, status from bookings
         where id = $1 and status is distinct from $2
         for update
       )
       update bookings as b
       set status = $2${withTimestamp ? ", status_updated_at = now()" : ""}
       from previous
       where b.id = previous.id and b.status is distinct from $2
       returning previous.status as previous_status`,
      [bookingId, status],
    );
  let rows;
  try {
    rows = await claim(true);
  } catch (error) {
    // Keep the existing compatibility path for pre-0074 local schemas without
    // retrying other database failures as a second, potentially ambiguous write.
    const missingTimestamp = error as { code?: string; message?: string };
    if (
      missingTimestamp.code !== "42703" ||
      !missingTimestamp.message?.includes("status_updated_at")
    )
      throw error;
    rows = await claim(false);
  }
  return rows[0] ? { previousStatus: rows[0].previous_status } : null;
}
