/** True only when a live Stripe secret is set. Test keys stay on the internal ledger. */
export function stripeChargesLive(secret = process.env.STRIPE_SECRET_KEY): boolean {
  const key = (secret || "").trim();
  return key.startsWith("sk_live_");
}

/**
 * Bank payouts to centres. Fail closed while the Stripe account is In review
 * or payouts are paused. Set STRIPE_PAYOUTS_LIVE=1 only after payouts clear.
 */
export function stripePayoutsLive(
  secret = process.env.STRIPE_SECRET_KEY,
  payoutsFlag = process.env.STRIPE_PAYOUTS_LIVE,
): boolean {
  if (!stripeChargesLive(secret)) return false;
  const v = String(payoutsFlag || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export const INTERNAL_LEDGER_LABEL = "Internal ledger (not charged)";
