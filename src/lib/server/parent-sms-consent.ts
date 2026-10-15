import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { PARENT_SMS_CONSENT_TEXT, parentSmsOptInInput } from "@/lib/parent-sms-consent";

/**
 * Writes the optional mobile number and SMS checkbox onto the parent profile.
 * Sign-up still succeeds when this is skipped: callers treat a failure as non-blocking.
 */
export const saveParentSmsOptIn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { phone?: string; smsConsent?: boolean }) => parentSmsOptInInput(input))
  .handler(async ({ context, data }) => {
    if (data.issue) return { ok: false as const, error: data.issue };
    const phone = data.phone || null;
    const flag = data.smsConsent ? 1 : 0;
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into profiles (user_id, role, phone, sms_consent, sms_consent_at)
      values (
        ${context.userId},
        'parent',
        ${phone},
        ${flag},
        case when ${flag}::int = 1 then now() else null end
      )
      on conflict (user_id) do update set
        phone = excluded.phone,
        sms_consent = excluded.sms_consent,
        sms_consent_at = case when excluded.sms_consent = 1 then now() else null end
    `;
    if (data.smsConsent) {
      const { setConsent } = await import("./casl-consent");
      await setConsent({
        userId: context.userId,
        channel: "sms",
        purpose: "service",
        granted: true,
        method: "profile_checkbox",
        statement: PARENT_SMS_CONSENT_TEXT,
        address: phone,
        locale: "en",
      });
    }
    return { ok: true as const, phone: phone ?? "", smsConsent: data.smsConsent };
  });
