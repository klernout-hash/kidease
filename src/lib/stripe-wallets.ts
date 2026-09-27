/**
 * Wallet readiness for hosted Stripe Checkout (the only card charge path).
 *
 * Apple Pay and Google Pay are not Stripe `payment_method_types`. They ride
 * on `card` and appear on checkout.stripe.com when the device/browser
 * supports them. Do not pass `apple_pay` / `google_pay` to Checkout — Stripe
 * rejects those as session types.
 *
 * Hosted Checkout does not need a kidease.ca Apple Pay domain file.
 * `/.well-known/apple-developer-merchantid-domain-association` is served
 * only so Kyle can paste Stripe’s file later if wallets are ever shown on
 * this origin (Payment Element / Express Checkout). Do not invent that file.
 *
 * Do not add a second Payment Element charge path here.
 */

export const CHECKOUT_WALLET_PAYMENT_METHOD_TYPES = ["card"] as const;

/** Future Payment Element / Express Checkout only — not used by hosted Checkout. */
export const PAYMENT_ELEMENT_WALLET_OPTIONS = {
  applePay: "auto",
  googlePay: "auto",
} as const;

export const APPLE_PAY_DOMAIN_ASSOCIATION_PATH =
  "/.well-known/apple-developer-merchantid-domain-association";

export function checkoutPaymentMethodTypes(): string[] {
  return [...CHECKOUT_WALLET_PAYMENT_METHOD_TYPES];
}

/** `fr*` → French checkout, `en*` → English. Anything else is left for the profile fallback. */
export function normalizeCheckoutLocale(raw?: string | null): "en" | "fr" | null {
  const value = String(raw || "").trim().toLowerCase();
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("en")) return "en";
  return null;
}

/**
 * Stripe Checkout `locale` enum. `en-CA` is not in this list and Stripe
 * rejects the session. Source: Checkout Session create, locale.
 */
export const STRIPE_CHECKOUT_LOCALES = [
  "auto",
  "bg",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "en-GB",
  "es",
  "es-419",
  "et",
  "fi",
  "fil",
  "fr",
  "fr-CA",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "lt",
  "lv",
  "ms",
  "mt",
  "nb",
  "nl",
  "pl",
  "pt",
  "pt-BR",
  "ro",
  "ru",
  "sk",
  "sl",
  "sv",
  "th",
  "tr",
  "vi",
  "zh",
  "zh-HK",
  "zh-TW",
] as const;

const STRIPE_CHECKOUT_LOCALE_SET = new Set<string>(STRIPE_CHECKOUT_LOCALES);

/** Keep a mapped locale only when Stripe Checkout accepts it. */
export function supportedCheckoutLocale(value: string): string {
  return STRIPE_CHECKOUT_LOCALE_SET.has(value) ? value : "auto";
}

/** Stripe Checkout locale. English is `en` (not `en-CA`). French stays `fr-CA`. */
export function checkoutLocale(locale?: string | null): string {
  const raw = String(locale || "").trim().toLowerCase();
  if (raw.startsWith("fr")) return supportedCheckoutLocale("fr-CA");
  if (raw.startsWith("en")) return supportedCheckoutLocale("en");
  return supportedCheckoutLocale("auto");
}

/** KidEase charges CAD only. Blank defaults to cad; anything else is refused. */
export function checkoutCurrency(raw?: string | null): string {
  const value = String(raw ?? "cad").trim().toLowerCase();
  if (!value || value === "cad") return "cad";
  throw new Error("KidEase checkout is Canadian dollars (CAD) only");
}
