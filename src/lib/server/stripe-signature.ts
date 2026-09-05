import { createHmac, timingSafeEqual } from "node:crypto";

/** Stripe webhook signature check (same scheme as stripe.webhooks.constructEvent). */
export type StripeEvent = {
  id?: string;
  type?: string;
  data?: {
    object?: {
      id?: string;
      object?: string;
      metadata?: Record<string, string | undefined> | null;
      client_reference_id?: string | null;
      payment_intent?: string | { id?: string } | null;
      payment_status?: string | null;
      latest_charge?: string | { id?: string; receipt_url?: string | null } | null;
      charges?: { data?: Array<{ id?: string; receipt_url?: string | null }> } | null;
      receipt_url?: string | null;
      customer?: string | { id?: string } | null;
      subscription?: string | { id?: string } | null;
      status?: string | null;
      mode?: string | null;
      charge?: string | { id?: string } | null;
      invoice?: string | { id?: string } | null;
    };
  };
};

export class StripeSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeSignatureError";
  }
}

function parseHeader(header: string) {
  const parts = header.split(",").map((p) => p.trim());
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === "t") timestamp = v ?? "";
    if (k === "v1" && v) signatures.push(v);
  }
  return { timestamp, signatures };
}

export function constructStripeEvent(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  toleranceSec = 300,
): StripeEvent {
  if (!secret.trim()) throw new StripeSignatureError("STRIPE_WEBHOOK_SECRET missing");
  if (!signatureHeader.trim()) throw new StripeSignatureError("stripe-signature missing");
  const { timestamp, signatures } = parseHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) throw new StripeSignatureError("malformed stripe-signature");
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) throw new StripeSignatureError("invalid stripe timestamp");
  const age = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (age > toleranceSec) throw new StripeSignatureError("stripe timestamp too old");

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const ok = signatures.some((sig) => {
    const got = Buffer.from(sig, "utf8");
    return got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf);
  });
  if (!ok) throw new StripeSignatureError("stripe signature mismatch");

  try {
    return rawBody ? (JSON.parse(rawBody) as StripeEvent) : {};
  } catch {
    throw new StripeSignatureError("invalid json");
  }
}
