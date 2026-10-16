/**
 * Persist Twilio SMS delivery rows. Never log the message body or auth token.
 */

import { getSql } from "@/lib/db";
import type { SmsDeliveryRecord } from "@/lib/server/sms-status";

export async function upsertSmsDelivery(row: SmsDeliveryRecord): Promise<void> {
  if (!row.messageSid) return;
  const sql = await getSql();
  await sql`
    insert into sms_delivery_status (
      message_sid, message_status, to_e164, from_e164, error_code, keyword, updated_at
    ) values (
      ${row.messageSid},
      ${row.messageStatus},
      ${row.toE164},
      ${row.fromE164},
      ${row.errorCode},
      ${row.keyword},
      now()
    )
    on conflict (message_sid) do update set
      message_status = excluded.message_status,
      to_e164 = coalesce(excluded.to_e164, sms_delivery_status.to_e164),
      from_e164 = coalesce(excluded.from_e164, sms_delivery_status.from_e164),
      error_code = coalesce(excluded.error_code, sms_delivery_status.error_code),
      keyword = coalesce(excluded.keyword, sms_delivery_status.keyword),
      updated_at = now()
  `;
}
