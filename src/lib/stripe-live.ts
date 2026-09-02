/** True only when a live Stripe secret is set. Test keys stay on the internal ledger. */
export function stripeChargesLive(secret = process.env.STRIPE_SECRET_KEY): boolean {
  const key = (secret || "").trim();
  return key.startsWith("sk_live_");
}

export const INTERNAL_LEDGER_LABEL = "Internal ledger (not charged)";
