import { INTERNAL_LEDGER_LABEL, stripeChargesLive } from "./stripe-live.ts";

/**
 * Payment source of truth.
 *
 * Live `sk_live_` + signed Stripe webhooks are authoritative for bill /
 * subscription status. The KidEase `invoices` / `payments` rows are a
 * projection of those events — not a second ledger that can mark paid
 * on its own.
 *
 * Test keys and missing secrets stay on the internal ledger. This helper
 * does not change Checkout, Connect, or webhook apply.
 */
export type PaymentSourceOfTruth = "stripe" | "internal_ledger";

export function paymentSourceOfTruth(live = stripeChargesLive()): PaymentSourceOfTruth {
  return live ? "stripe" : "internal_ledger";
}

export function paymentSourceLabel(live = stripeChargesLive()): string {
  return live ? "Stripe (source of truth)" : INTERNAL_LEDGER_LABEL;
}
