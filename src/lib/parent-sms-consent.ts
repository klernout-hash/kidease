import { normalizeCaslPhone } from "./casl.ts";
import { pageSeoHead } from "./page-seo.ts";

/**
 * Toll-free opt-in sentence for +1 877-502-7728.
 * Keep this string exact. Twilio matches it word for word.
 */
export const PARENT_SMS_CONSENT_TEXT =
  "I agree to receive text messages from KidEase about my daycare requests and account. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.";

/** Shown on /fr/signup. ARRÊT and AIDE are accepted by the inbound keyword parser. */
export const PARENT_SMS_CONSENT_TEXT_FR =
  "J’accepte de recevoir des textos de KidEase au sujet de mes demandes de garde et de mon compte. La fréquence des messages varie. Des frais de messagerie et de données peuvent s’appliquer. Répondez ARRÊT pour vous désabonner, AIDE pour obtenir de l’aide.";

export function parentSmsConsentText(locale: string): string {
  return locale === "fr" ? PARENT_SMS_CONSENT_TEXT_FR : PARENT_SMS_CONSENT_TEXT;
}

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

export function parentSignupHead(locale: "en" | "fr" = "en") {
  if (locale === "fr") {
    return pageSeoHead({
      title: "Créer un compte parent · KidEase",
      description:
        "KidEase aide les parents à trouver une garderie permise au Canada. Créez un compte pour enregistrer des centres et demander une visite. Le cellulaire est facultatif.",
      path: "/fr/signup",
      locale: "fr",
    });
  }
  return pageSeoHead({
    title: "Create a parent account · KidEase",
    description:
      "KidEase helps parents find licensed child care in Canada. Create an account to save centres and ask for a tour. A mobile number is optional.",
    path: "/signup",
    locale: "en",
  });
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

/** True when Lookup said texts cannot reach the number, so SMS stayed off. */
export function smsOptInWasBlocked(result: unknown): boolean {
  return Boolean(
    result &&
      typeof result === "object" &&
      (result as { smsUnreachable?: unknown }).smsUnreachable === true,
  );
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
