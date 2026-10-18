/**
 * Client-reachable CASL createServerFn stubs.
 * Token HMAC and DB helpers stay in casl-consent.ts and are imported only
 * inside handlers so the browser bundle never pulls node:crypto.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { isCaslChannel, isCaslMethod, normalizeCaslAddress, type CaslMethod, type CaslPrefs } from "@/lib/casl";

export const getMyCaslConsents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listConsents } = await import("./casl-consent");
    return listConsents(context.userId);
  });

export const saveMyCaslConsents = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    smsService?: boolean;
    emailService?: boolean;
    emailCommercial?: boolean;
    phone?: string;
    email?: string;
    locale?: string;
    method?: string;
  }) => ({
    smsService: Boolean(input?.smsService),
    emailService: Boolean(input?.emailService),
    emailCommercial: Boolean(input?.emailCommercial),
    phone: String(input?.phone || ""),
    email: String(input?.email || ""),
    locale: input?.locale === "fr" ? ("fr" as const) : ("en" as const),
    method: isCaslMethod(String(input?.method || "")) ? (input!.method as CaslMethod) : ("profile_checkbox" as const),
  }))
  .handler(async ({ context, data }): Promise<CaslPrefs & { smsUnreachable: boolean }> => {
    const { setConsent, listConsents } = await import("./casl-consent");
    let phone = normalizeCaslAddress("sms", data.phone);
    const email = normalizeCaslAddress("email", data.email);
    let grantSms = data.smsService;
    let smsUnreachable = false;
    if (grantSms && phone) {
      try {
        const { decideSmsLookup } = await import("@/lib/sms-lookup");
        const decision = await decideSmsLookup(phone);
        if (decision.phone) phone = decision.phone;
        if (decision.block) {
          grantSms = false;
          smsUnreachable = true;
        }
      } catch {
        /* Lookup failed. Keep the opt-in. */
      }
    }
    await setConsent({
      userId: context.userId,
      channel: "sms",
      purpose: "service",
      granted: grantSms,
      method: data.method,
      address: phone,
      locale: data.locale,
    });
    await setConsent({
      userId: context.userId,
      channel: "email",
      purpose: "service",
      granted: data.emailService,
      method: data.method,
      address: email,
      locale: data.locale,
    });
    await setConsent({
      userId: context.userId,
      channel: "email",
      purpose: "commercial",
      granted: data.emailCommercial,
      method: data.method,
      address: email,
      locale: data.locale,
    });
    const next = await listConsents(context.userId);
    return {
      smsService: next.smsService,
      emailService: next.emailService,
      emailCommercial: next.emailCommercial,
      smsUnreachable,
    };
  });

export const applyPublicUnsubscribe = createServerFn({ method: "POST" })
  .validator((input: { token?: string; channel?: string; address?: string; purpose?: string }) => ({
    token: String(input?.token || "").trim(),
    channel: String(input?.channel || "").trim(),
    address: String(input?.address || "").trim(),
    purpose: String(input?.purpose || "all").trim(),
  }))
  .handler(async ({ data }) => {
    const { applyUnsubscribeToken, withdrawByAddress } = await import("./casl-consent");
    if (data.token) {
      if (data.token.startsWith("ka.")) {
        const { applyAlertUnsubscribeToken } = await import("./alert-dispatch");
        return applyAlertUnsubscribeToken(data.token);
      }
      return applyUnsubscribeToken(data.token);
    }
    if (!isCaslChannel(data.channel)) {
      return { ok: false as const, error: "Choose email or SMS." };
    }
    const purpose = data.purpose === "service" || data.purpose === "commercial" ? data.purpose : "all";
    return withdrawByAddress({
      channel: data.channel,
      address: data.address,
      purpose,
      method: "public_form",
    });
  });
