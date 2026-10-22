import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { parentSmsConsentText, parentSmsOptInInput } from "@/lib/parent-sms-consent";

/**
 * Writes the optional mobile number and SMS checkbox onto the parent profile.
 * Sign-up still succeeds when this is skipped: callers treat a failure as non-blocking.
 */
export const saveParentSmsOptIn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { phone?: string; smsConsent?: boolean; locale?: string }) => ({
    ...parentSmsOptInInput(input),
    locale: input?.locale === "fr" ? ("fr" as const) : ("en" as const),
  }))
  .handler(async ({ context, data }) => {
    if (data.issue) return { ok: false as const, error: data.issue };
    let phone = data.phone || null;
    let smsConsent = data.smsConsent;
    let smsUnreachable = false;
    if (phone) {
      const { isE164, normalizeE164 } = await import("@/lib/sms");
      const e164 = normalizeE164(phone);
      if (isE164(e164)) phone = e164;
    }
    if (smsConsent && phone) {
      try {
        const { decideSmsLookup } = await import("@/lib/sms-lookup");
        const decision = await decideSmsLookup(phone);
        if (decision.phone) phone = decision.phone;
        if (decision.block) {
          smsConsent = false;
          smsUnreachable = true;
        }
      } catch {
        /* Lookup failed. Keep the opt-in. */
      }
    }
    const flag = smsConsent ? 1 : 0;
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
    if (smsConsent) {
      const { setConsent } = await import("./casl-consent");
      await setConsent({
        userId: context.userId,
        channel: "sms",
        purpose: "service",
        granted: true,
        method: "profile_checkbox",
        statement: parentSmsConsentText(data.locale),
        address: phone,
        locale: data.locale,
      });
    }
    return { ok: true as const, phone: phone ?? "", smsConsent, smsUnreachable };
  });
