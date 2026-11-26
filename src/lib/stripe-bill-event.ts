/** Pull a KidEase bill id off a Stripe Checkout / PaymentIntent / Charge object. */

export type StripeBillObject = {
  id?: string;
  object?: string;
  metadata?: Record<string, string | undefined> | null;
  client_reference_id?: string | null;
  payment_intent?: string | { id?: string } | null;
  payment_status?: string | null;
  latest_charge?: string | { id?: string; receipt_url?: string | null } | null;
  charges?: { data?: Array<{ id?: string; receipt_url?: string | null }> } | null;
  receipt_url?: string | null;
  status?: string | null;
  livemode?: boolean | null;
  currency?: string | null;
  amount?: number | null;
  amount_total?: number | null;
  amount_received?: number | null;
  amount_paid?: number | null;
  amount_captured?: number | null;
};

export type StripeBillRef = {
  billId: string | null;
  sessionId: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
  receiptUrl: string | null;
  paid: boolean;
  livemode: boolean | null;
  /** What Stripe says was collected, in cents. Null when the object does not say. */
  amountCents: number | null;
  currency: string | null;
};

function asId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value || null;
  return value.id || null;
}

function pickMeta(obj: StripeBillObject): string | null {
  const meta = obj.metadata || {};
  return (meta.bill_id || meta.invoice_id || obj.client_reference_id || "").trim() || null;
}

function cents(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function collectedCents(data: StripeBillObject, kind: string, type: string): number | null {
  if (kind === "checkout.session" || type.startsWith("checkout.session")) return cents(data.amount_total);
  if (kind === "payment_intent" || type.startsWith("payment_intent")) return cents(data.amount_received);
  if (kind === "invoice" || type.startsWith("invoice")) return cents(data.amount_paid);
  if (kind === "charge" || type.startsWith("charge")) return cents(data.amount_captured ?? data.amount);
  return null;
}

export function extractStripeBillRef(obj: StripeBillObject | null | undefined, type = ""): StripeBillRef {
  const data = obj || {};
  const kind = data.object || "";
  const sessionId = kind === "checkout.session" || type.startsWith("checkout.session") ? data.id || null : null;
  const paymentIntentId =
    kind === "payment_intent" || type.startsWith("payment_intent") ? data.id || null : asId(data.payment_intent);
  const charge =
    kind === "charge" || type.startsWith("charge")
      ? data
      : data.latest_charge && typeof data.latest_charge === "object"
        ? data.latest_charge
        : data.charges?.data?.[0];
  const chargeId =
    kind === "charge" || type.startsWith("charge") ? data.id || null : charge && "id" in charge ? charge.id || null : null;
  const receiptUrl =
    (charge && "receipt_url" in charge ? charge.receipt_url : null) || data.receipt_url || null;
  const sessionUnpaid =
    (kind === "checkout.session" || type.startsWith("checkout.session")) && data.payment_status === "unpaid";
  const paid =
    !sessionUnpaid &&
    (type === "payment_intent.succeeded" ||
      type === "checkout.session.completed" ||
      type === "invoice.paid" ||
      data.payment_status === "paid" ||
      data.status === "paid" ||
      type === "charge.succeeded");
  return {
    billId: pickMeta(data),
    sessionId,
    paymentIntentId,
    chargeId,
    receiptUrl,
    paid,
    livemode: typeof data.livemode === "boolean" ? data.livemode : null,
    amountCents: collectedCents(data, kind, type),
    currency: typeof data.currency === "string" && data.currency.trim() ? data.currency.trim().toLowerCase() : null,
  };
}

/**
 * A paid Stripe object settles a bill only when it was made in the Stripe mode
 * that bill routes to, for exactly the bill amount, in the bill currency.
 * A missing livemode or amount never settles a bill.
 */
export function stripePaymentSettlesBill(
  ref: Pick<StripeBillRef, "livemode" | "amountCents" | "currency">,
  bill: { mode: "test" | "live"; amountCents: number; currency: string },
): boolean {
  if (ref.livemode === null || ref.livemode !== (bill.mode === "live")) return false;
  if (ref.amountCents === null || ref.amountCents !== bill.amountCents) return false;
  if (ref.currency !== null && ref.currency !== (bill.currency || "cad").toLowerCase()) return false;
  return true;
}
