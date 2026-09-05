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
};

export type StripeBillRef = {
  billId: string | null;
  sessionId: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
  receiptUrl: string | null;
  paid: boolean;
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
  const paid =
    type === "payment_intent.succeeded" ||
    type === "checkout.session.completed" ||
    data.payment_status === "paid" ||
    type === "charge.succeeded";
  return {
    billId: pickMeta(data),
    sessionId,
    paymentIntentId,
    chargeId,
    receiptUrl,
    paid,
  };
}
