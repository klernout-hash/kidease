/**
 * Stripe webhook → product event (C7). Pure, so it is easy to test. Only
 * webhook paths that exist today: a refund on a centre bill, a Connect payout,
 * and a failed parent invoice. `bill_processing` waits for the PAD/3DS
 * webhook work (payment_intent.processing is not handled yet).
 */
import type { ProductEventName } from "./product-events.ts";

export type PlannedWebhookEvent = {
  event: ProductEventName;
  properties: Record<string, string>;
};

export function webhookProductEvent(
  type: string,
  input: { billStatus?: string | null; invoiceId?: string | null },
): PlannedWebhookEvent | null {
  if (type === "charge.refunded" && input.billStatus === "refunded") {
    return { event: "refund_issued", properties: { source: "centre_bill", result: "refunded" } };
  }
  if (type === "payout.paid") {
    return { event: "payout_paid", properties: { source: "connect", result: "paid" } };
  }
  if (type === "invoice.payment_failed" && input.invoiceId) {
    return { event: "bill_payment_failed", properties: { source: "parent_invoice", result: "failed" } };
  }
  return null;
}
