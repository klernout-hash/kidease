import { normalizeCaslPhone } from "./casl.ts";

/**
 * Toll-free opt-in sentence for +1 877-502-7728.
 * Keep this string exact. Twilio matches it word for word.
 */
export const PARENT_SMS_CONSENT_TEXT =
  "I agree to receive text messages from KidEase about my daycare requests and account. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.";

export const PARENT_SMS_TERMS_URL = "https://www.kidease.ca/terms";

/** Shown beside the opt-in. Canadian toll-free format of +18775027728. */
export const PARENT_SMS_FROM_DISPLAY = "1-877-502-7728";

const STASH_KEY = "ke-parent-sms-opt-in";

export function cleanParentMobile(value: unknown): string {
  return String(value ?? "")
    .replace(/[^0-9+()\-.\s]/g, "")
    .trim()
    .slice(0, 32);
}

/** Blank is allowed. A typed value must be a real mobile number. */
export function parentMobileIssue(value: string): string | null {
  const cleaned = cleanParentMobile(value);
  if (!cleaned) return null;
  if (!normalizeCaslPhone(cleaned)) return "Enter a mobile number, or leave this blank.";
  return null;
}

export function parentSignupHead() {
  return {
    meta: [
      { title: "Create a parent account · KidEase" },
      {
        name: "description",
        content:
          "KidEase helps parents find licensed daycare in Canada. Create an account to save centres and ask for a tour. A mobile number is optional.",
      },
    ],
  };
}

export function parentSmsOptInInput(input: { phone?: unknown; smsConsent?: unknown }): {
  phone: string;
  smsConsent: boolean;
  issue: string | null;
} {
  const phone = cleanParentMobile(input?.phone);
  return {
    phone,
    smsConsent: input?.smsConsent === true,
    issue: parentMobileIssue(phone),
  };
}

export function stashParentSmsOptIn(phone: string, smsConsent: boolean) {
  if (typeof window === "undefined") return;
  try {
    const next = parentSmsOptInInput({ phone, smsConsent });
    window.sessionStorage.setItem(
      STASH_KEY,
      JSON.stringify({ phone: next.phone, smsConsent: next.smsConsent }),
    );
  } catch {
    /* private mode */
  }
}

export function takeParentSmsOptIn(): { phone: string; smsConsent: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(STASH_KEY);
    const parsed = JSON.parse(raw) as { phone?: unknown; smsConsent?: unknown };
    const next = parentSmsOptInInput(parsed);
    if (next.issue) return { phone: "", smsConsent: false };
    return { phone: next.phone, smsConsent: next.smsConsent };
  } catch {
    return null;
  }
}
