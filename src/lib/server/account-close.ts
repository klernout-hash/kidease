/**
 * Cancel open parent work when an account is scheduled to close, and
 * drop or anonymize the rest when the 30-day restore window ends.
 * Billing, invoices, and fraud logs are left alone.
 */

import { ACCOUNT_CLOSE_NOTE } from "@/lib/account-close";
import { getSql } from "@/lib/db";

export async function cancelPendingAccountWork(uid: string) {
  const sql = await getSql();
  await sql`
    update bookings
    set status = 'cancelled', status_updated_at = now()
    where user_id = ${uid}
      and status in ('requested', 'under_review', 'waitlist')
  `.catch(() => undefined);
  await sql`
    update tour_requests
    set status = 'lost',
        centre_note = coalesce(centre_note, ${ACCOUNT_CLOSE_NOTE}),
        responded_at = coalesce(responded_at, now())
    where user_id = ${uid}
      and status in ('pending', 'accepted')
  `.catch(() => undefined);
  await sql`
    update lead_requests
    set status = 'closed', updated_at = now()
    where user_id = ${uid}
      and status in ('requested', 'received')
  `.catch(() => undefined);
  await sql`delete from waitlist_interests where user_id = ${uid}`.catch(() => undefined);
  await sql`delete from push_device_tokens where user_id = ${uid}`.catch(() => undefined);
  await sql`delete from web_push_subscriptions where user_id = ${uid}`.catch(() => undefined);
}

/** Final wipe. Safe to call after cancelPendingAccountWork. */
export async function purgeAccountExtras(uid: string) {
  const sql = await getSql();
  await sql`
    update reviews
    set user_id = null, author = 'Parent', review_note = null
    where user_id = ${uid}
  `.catch(() => undefined);
  await sql`delete from listing_review_attempts where user_id = ${uid}`.catch(() => undefined);
  await sql`delete from tour_requests where user_id = ${uid}`.catch(() => undefined);
  await sql`delete from saved_searches where user_id = ${uid}`.catch(() => undefined);
  await sql`delete from search_alert_notices where user_id = ${uid}`.catch(() => undefined);
  await sql`delete from parent_search_checkins where user_id = ${uid}`.catch(() => undefined);
  await sql`delete from notification_prefs where user_id = ${uid}`.catch(() => undefined);
  await sql`delete from notification_outbox where user_id = ${uid}`.catch(() => undefined);
  await sql`delete from push_device_tokens where user_id = ${uid}`.catch(() => undefined);
  await sql`delete from web_push_subscriptions where user_id = ${uid}`.catch(() => undefined);
}
