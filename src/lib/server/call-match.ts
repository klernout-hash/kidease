/**
 * Server side of the matched-pairs rule for calls and video.
 * Fails closed: a query error means "not matched", never "open".
 */

import type { Sql } from "@/lib/db";
import {
  CALL_MATCH_BOOKING_STATUSES,
  CALL_MATCH_TOUR_STATUSES,
  callPairMatched,
} from "@/lib/call-match";

export async function pairCallMatched(
  sql: Sql,
  input: { parentUserId: string; daycareId: string; conversationId?: string | null },
): Promise<boolean> {
  const parent = String(input.parentUserId || "").trim();
  const daycare = String(input.daycareId || "").trim();
  if (!parent || !daycare) return false;
  const conversationId = String(input.conversationId || "").trim() || null;
  try {
    const bookings = await sql<{ status: string }>`
      select status from bookings
      where (user_id = ${parent} and daycare_id = ${daycare})
         or (${conversationId}::text is not null and conversation_id = ${conversationId})
      order by created_at desc
      limit 20
    `.catch(() => [] as { status: string }[]);
    const bookingStatuses = bookings.map((row) => row.status);
    if (callPairMatched({ bookingStatuses })) return true;
    const tours = await sql<{ status: string }>`
      select status from tour_requests
      where (user_id = ${parent} and daycare_id = ${daycare})
         or (${conversationId}::text is not null and conversation_id = ${conversationId})
      order by created_at desc
      limit 20
    `.catch(() => [] as { status: string }[]);
    if (callPairMatched({ tourStatuses: tours.map((row) => row.status) })) return true;
    const handoff = await sql<{ one: number }>`
      select 1 as one from enrolment_handoffs
      where parent_user_id = ${parent} and daycare_id = ${daycare}
      limit 1
    `.catch(() => [] as { one: number }[]);
    if (handoff.length) return true;
    const attendance = await sql<{ one: number }>`
      select 1 as one from attendance
      where parent_user_id = ${parent} and daycare_id = ${daycare}
      limit 1
    `.catch(() => [] as { one: number }[]);
    return attendance.length > 0;
  } catch {
    return false;
  }
}

/** Thread lookup + match in one call. Unknown thread is not matched. */
export async function conversationCallMatched(sql: Sql, conversationId: string): Promise<boolean> {
  const id = String(conversationId || "").trim();
  if (!id) return false;
  const rows = await sql<{ user_id: string; daycare_id: string }>`
    select user_id, daycare_id from conversations where id = ${id} limit 1
  `.catch(() => [] as { user_id: string; daycare_id: string }[]);
  if (!rows[0]) return false;
  return pairCallMatched(sql, { parentUserId: rows[0].user_id, daycareId: rows[0].daycare_id, conversationId: id });
}

export { CALL_MATCH_BOOKING_STATUSES, CALL_MATCH_TOUR_STATUSES };
