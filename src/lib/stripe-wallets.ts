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

/** Stripe Checkout locale. `auto` follows the browser; CAD stays on the session. */
export function checkoutLocale(locale?: string | null): string {
  const raw = String(locale || "").trim().toLowerCase();
  if (raw.startsWith("fr")) return "fr-CA";
  if (raw.startsWith("en")) return "en-CA";
  return "auto";
}

export function checkoutCurrency(raw?: string | null): string {
  const value = String(raw || "cad").trim().toLowerCase();
  return value || "cad";
}
