/**
 * Thin Stripe Checkout helper (no SDK). Checkout Session fits TanStack Start:
 * the parent is redirected to Stripe and returns to /pay/bill/$id.
 * Never call this with sk_test_ — stripeChargesLive() must already be true.
 */

export type StripeCheckoutInput = {
  billId: string;
  number: string;
  amountCents: number;
  currency?: string;
  period: string;
  daycareName: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  /** Connect account id when the centre can receive funds. Parent never sees this. */
  destinationAccount?: string | null;
  applicationFeeCents?: number;
};

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  payment_intent?: string | null;
};

export function flattenStripeBody(obj: unknown, prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (obj == null || obj === "") return out;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      const key = `${prefix}[${i}]`;
      if (item != null && typeof item === "object") out.push(...flattenStripeBody(item, key));
      else if (item != null && item !== "") out.push([key, String(item)]);
    });
    return out;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v != null && typeof v === "object") out.push(...flattenStripeBody(v, key));
      else if (v != null && v !== "") out.push([key, String(v)]);
    }
    return out;
  }
  if (prefix) out.push([prefix, String(obj)]);
  return out;
}

export function checkoutSessionBody(input: StripeCheckoutInput): Record<string, unknown> {
  const currency = (input.currency || "cad").toLowerCase();
  const paymentIntent: Record<string, unknown> = {
    metadata: { bill_id: input.billId, kidease: "bill" },
  };
  if (input.destinationAccount && (input.applicationFeeCents ?? 0) >= 0) {
    paymentIntent.application_fee_amount = input.applicationFeeCents ?? 0;
    paymentIntent.transfer_data = { destination: input.destinationAccount };
  }
  return {
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.billId,
    customer_email: input.customerEmail || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: input.amountCents,
          product_data: {
            name: `KidEase bill ${input.number}`,
            description: `${input.daycareName} · ${input.period}`,
          },
        },
      },
    ],
    metadata: { bill_id: input.billId, kidease: "bill" },
    payment_intent_data: paymentIntent,
  };
}

export async function createStripeCheckoutSession(input: StripeCheckoutInput): Promise<StripeCheckoutSession> {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) throw new Error("Stripe is not configured");
  const params = new URLSearchParams();
  for (const [k, v] of flattenStripeBody(checkoutSessionBody(input))) params.append(k, v);
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const json = (await res.json()) as StripeCheckoutSession & { error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message || `Stripe checkout failed (${res.status})`);
  }
  return { id: json.id, url: json.url ?? null, payment_intent: json.payment_intent ?? null };
}
