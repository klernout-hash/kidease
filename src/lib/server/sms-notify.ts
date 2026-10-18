/**
 * Text a parent or daycare only when they consented and have not opted out.
 * Bodies must already name KidEase. Failures never throw to the caller.
 */

import { getSql } from "@/lib/db";
import { smsConsentAllows } from "@/lib/sms-copy";
import { isAddressBlocked, readConsent } from "@/lib/server/casl-consent";
import { sendSms } from "@/lib/server/sms";
import { listCentreOwnerEmails } from "@/lib/server/thread-access";

export async function notifyConsentedUserSms(input: { userId: string; body: string }): Promise<void> {
  const userId = String(input.userId || "").trim();
  if (!userId) return;
  try {
    const sql = await getSql();
    const rows = await sql<{ phone: string | null; sms_consent: number | boolean | null }>`
      select phone, sms_consent from profiles where user_id = ${userId} limit 1
    `.catch(() => [] as { phone: string | null; sms_consent: number | boolean | null }[]);
    const phone = rows[0]?.phone || "";
    const smsConsent = rows[0]?.sms_consent === 1 || rows[0]?.sms_consent === true;
    const casl = await readConsent(userId, "sms", "service");
    const addressBlocked = phone ? await isAddressBlocked("sms", phone, "service") : false;
    const decision = smsConsentAllows({
      smsConsent,
      caslGranted: casl.granted,
      addressBlocked,
    });
    if (!decision.ok) return;
    await sendSms({
      to: phone,
      body: input.body,
      audience: "user",
      consentGranted: true,
    });
  } catch {
    console.error("[kidease-sms] notify skipped");
  }
}

export async function notifyCentreSms(input: { daycareId: string; body: string }): Promise<void> {
  const daycareId = String(input.daycareId || "").trim();
  if (!daycareId) return;
  try {
    const sql = await getSql();
    const owners = await listCentreOwnerEmails(sql, daycareId);
    const members = await sql<{ user_id: string }>`
      select user_id from centre_members
      where daycare_id = ${daycareId} and status = ${"active"}
    `.catch(() => [] as { user_id: string }[]);
    const ids = new Set<string>();
    for (const owner of owners) {
      if (owner.userId) ids.add(owner.userId);
    }
    for (const member of members) {
      if (member.user_id) ids.add(member.user_id);
    }
    await Promise.all([...ids].map((userId) => notifyConsentedUserSms({ userId, body: input.body })));
  } catch {
    console.error("[kidease-sms] centre notify skipped");
  }
}
