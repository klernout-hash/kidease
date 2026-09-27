/**
 * Thin Stripe Checkout helper (no SDK). Checkout Session fits TanStack Start:
 * the parent is redirected to Stripe and returns to /pay/bill/$id.
 * Never call this with sk_test_ — stripeChargesLive() must already be true.
 *
 * KidEase branding: statement_descriptor_suffix is KIDEASE. Also set the
 * Stripe Dashboard statement descriptor prefix to KidEase so card statements
 * read clearly in CAD.
 */

import { StripeApiError } from "../stripe-public-error.ts";
import { checkoutCurrency, checkoutLocale, checkoutPaymentMethodTypes } from "../stripe-wallets.ts";

export const STRIPE_STATEMENT_SUFFIX = "KIDEASE";

/** Billing country on every KidEase Checkout customer. ISO code, not a label. */
export const CHECKOUT_BILLING_COUNTRY = "CA";

type StripeAddress = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  /** Stripe's address field for a Canadian province. */
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

type StripeCustomer = {
  id?: string | null;
  address?: StripeAddress | null;
};

/** Customer create params. Checkout has no session field for billing country, so the customer address supplies Canada. */
export function canadaCustomerParams(input?: { email?: string | null }): Record<string, unknown> {
  const body: Record<string, unknown> = {
    address: { country: CHECKOUT_BILLING_COUNTRY },
  };
  const email = String(input?.email || "").trim();
  if (email) body.email = email;
  return body;
}

function canadaAddressUpdate(address: StripeAddress | null | undefined): Record<string, string> {
  const next: Record<string, string> = { country: CHECKOUT_BILLING_COUNTRY };
  const line1 = String(address?.line1 || "").trim();
  const line2 = String(address?.line2 || "").trim();
  const city = String(address?.city || "").trim();
  const province = String(address?.state || "").trim();
  const postal = String(address?.postal_code || "").trim();
  if (line1) next.line1 = line1;
  if (line2) next.line2 = line2;
  if (city) next.city = city;
  if (province) next.state = province;
  if (postal) next.postal_code = postal;
  return next;
}

/**
 * Checkout geolocates an empty billing country from the visitor IP.
 * A customer with address.country CA is what Stripe prefills instead.
 */
export async function ensureCanadaStripeCustomer(input: {
  customerId?: string | null;
  email?: string | null;
}): Promise<string> {
  const existing = String(input.customerId || "").trim();
  if (existing) {
    try {
      const customer = await stripeRequest<StripeCustomer>(`/customers/${encodeURIComponent(existing)}`, {}, "GET");
      const country = String(customer.address?.country || "").trim().toUpperCase();
      if (country !== CHECKOUT_BILLING_COUNTRY) {
        await stripeRequest(`/customers/${encodeURIComponent(existing)}`, {
          address: canadaAddressUpdate(customer.address),
        });
      }
      return existing;
    } catch {
      // Stale id: create a Canada customer rather than failing the charge.
    }
  }
  const created = await stripeRequest<StripeCustomer>("/customers", canadaCustomerParams({ email: input.email }));
  const id = String(created.id || "").trim();
  if (!id) throw new Error("Stripe did not return a customer");
  return id;
}

export function appOrigin(): string {
  return (process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://kidease.ca").replace(/\/$/, "");
}

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
  customerId?: string | null;
  locale?: string | null;
  /** Connect account id when the centre can receive funds. Parent never sees this. */
  destinationAccount?: string | null;
  applicationFeeCents?: number;
};

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  payment_intent?: string | null;
  customer?: string | null;
  subscription?: string | null;
};

export type CatalogCheckoutInput = {
  mode: "subscription" | "payment";
  priceId: string;
  quantity?: number;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  customerId?: string | null;
  clientReferenceId?: string | null;
  locale?: string | null;
  metadata: Record<string, string>;
  allowPromotionCodes?: boolean;
};

export type BillingPortalInput = {
  customerId: string;
  returnUrl: string;
  /** Scopes the portal to this subscription so the other role's plan is not listed. */
  subscriptionId?: string | null;
  /** Dashboard portal configuration (parent vs daycare). Omit to use Stripe's default. */
  configurationId?: string | null;
};

export function billingPortalBody(input: BillingPortalInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    customer: input.customerId,
    return_url: input.returnUrl,
  };
  const configuration = String(input.configurationId || "").trim();
  if (configuration) body.configuration = configuration;
  const subscriptionId = String(input.subscriptionId || "").trim();
  if (subscriptionId) {
    body.flow_data = {
      type: "subscription_update",
      subscription_update: { subscription: subscriptionId },
      after_completion: {
        type: "redirect",
        redirect: { return_url: input.returnUrl },
      },
    };
  }
  return body;
}

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

function allowPromotionCodes(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = String(env.STRIPE_ALLOW_PROMOTION_CODES ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export function checkoutSessionBody(input: StripeCheckoutInput): Record<string, unknown> {
  const currency = checkoutCurrency(input.currency);
  const paymentIntent: Record<string, unknown> = {
    metadata: { bill_id: input.billId, kidease: "bill" },
    statement_descriptor_suffix: STRIPE_STATEMENT_SUFFIX,
  };
  if (input.destinationAccount && (input.applicationFeeCents ?? 0) >= 0) {
    paymentIntent.application_fee_amount = input.applicationFeeCents ?? 0;
    paymentIntent.transfer_data = { destination: input.destinationAccount };
  }
  const body: Record<string, unknown> = {
    mode: "payment",
    locale: checkoutLocale(input.locale),
    payment_method_types: checkoutPaymentMethodTypes(),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.billId,
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
    currency,
    metadata: { bill_id: input.billId, kidease: "bill" },
    payment_intent_data: paymentIntent,
    allow_promotion_codes: allowPromotionCodes() ? "true" : undefined,
  };
  if (input.customerId) {
    body.customer = input.customerId;
    body.customer_update = { address: "auto" };
  } else if (input.customerEmail) body.customer_email = input.customerEmail;
  return body;
}

export function catalogCheckoutBody(input: CatalogCheckoutInput): Record<string, unknown> {
  const metadata = { ...input.metadata, kidease: input.metadata.kidease || "catalog" };
  const body: Record<string, unknown> = {
    mode: input.mode,
    locale: checkoutLocale(input.locale),
    payment_method_types: checkoutPaymentMethodTypes(),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.clientReferenceId || undefined,
    line_items: [{ price: input.priceId, quantity: Math.max(1, input.quantity ?? 1) }],
    currency: "cad",
    metadata,
    allow_promotion_codes: (input.allowPromotionCodes ?? allowPromotionCodes()) ? "true" : undefined,
    billing_address_collection: "auto",
  };
  if (input.customerId) {
    body.customer = input.customerId;
    body.customer_update = { address: "auto" };
  } else if (input.customerEmail) body.customer_email = input.customerEmail;
  if (input.mode === "subscription") {
    body.subscription_data = { metadata };
  } else {
    body.payment_intent_data = {
      metadata,
      statement_descriptor_suffix: STRIPE_STATEMENT_SUFFIX,
    };
  }
  return body;
}

type StripeFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

let stripeFetchImpl: StripeFetch = globalThis.fetch.bind(globalThis);

/** Tests only — swap fetch so checkout never hits api.stripe.com. */
export function setStripeFetchForTests(fn: StripeFetch | null) {
  stripeFetchImpl = fn ?? globalThis.fetch.bind(globalThis);
}

export async function stripeRequest<T>(
  path: string,
  body: Record<string, unknown>,
  method: "POST" | "GET" = "POST",
  opts?: { idempotencyKey?: string },
): Promise<T> {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) throw new Error("Stripe is not configured");
  const url = path.startsWith("http") ? path : `https://api.stripe.com/v1${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
  };
  if (opts?.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  if (method === "GET") {
    const params = new URLSearchParams();
    for (const [k, v] of flattenStripeBody(body)) params.append(k, v);
    const joined = params.toString();
    const getUrl = joined ? `${url}${url.includes("?") ? "&" : "?"}${joined}` : url;
    const res = await stripeFetchImpl(getUrl, { method: "GET", headers });
    const json = (await res.json()) as T & { error?: { message?: string } };
    if (!res.ok) {
      throw new StripeApiError(json.error?.message || `Stripe ${path} failed (${res.status})`, res.status);
    }
    return json;
  }
  headers["Content-Type"] = "application/x-www-form-urlencoded";
  const params = new URLSearchParams();
  for (const [k, v] of flattenStripeBody(body)) params.append(k, v);
  const payload = params.toString();
  const res = await stripeFetchImpl(url, { method: "POST", headers, body: payload });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new StripeApiError(json.error?.message || `Stripe ${path} failed (${res.status})`, res.status);
  }
  return json;
}

export async function createStripeCheckoutSession(input: StripeCheckoutInput): Promise<StripeCheckoutSession> {
  const customerId = await ensureCanadaStripeCustomer({
    customerId: input.customerId,
    email: input.customerEmail,
  });
  const json = await stripeRequest<StripeCheckoutSession>(
    "/checkout/sessions",
    checkoutSessionBody({ ...input, customerId, customerEmail: null }),
  );
  if (!json.id) throw new Error("Stripe checkout failed");
  return {
    id: json.id,
    url: json.url ?? null,
    payment_intent: json.payment_intent ?? null,
    customer: customerId,
  };
}

export async function createCatalogCheckoutSession(input: CatalogCheckoutInput): Promise<StripeCheckoutSession> {
  const customerId = await ensureCanadaStripeCustomer({
    customerId: input.customerId,
    email: input.customerEmail,
  });
  const json = await stripeRequest<StripeCheckoutSession>(
    "/checkout/sessions",
    catalogCheckoutBody({ ...input, customerId, customerEmail: null }),
  );
  if (!json.id) throw new Error("Stripe checkout failed");
  return {
    id: json.id,
    url: json.url ?? null,
    payment_intent: json.payment_intent ?? null,
    customer: typeof json.customer === "string" ? json.customer : customerId,
    subscription: typeof json.subscription === "string" ? json.subscription : null,
  };
}

export async function createBillingPortalSession(input: BillingPortalInput): Promise<{ url: string }> {
  const json = await stripeRequest<{ url?: string | null }>("/billing_portal/sessions", billingPortalBody(input));
  if (!json.url) throw new Error("Stripe did not return a billing portal link");
  return { url: json.url };
}

export async function updateSubscriptionCancelAtPeriodEnd(
  subscriptionId: string,
  cancel: boolean,
): Promise<StripeLifecycleShape> {
  const id = String(subscriptionId || "").trim();
  if (!id) throw new Error("No Stripe subscription on this profile yet. Nothing was changed.");
  return stripeRequest<StripeLifecycleShape>(`/subscriptions/${encodeURIComponent(id)}`, {
    cancel_at_period_end: cancel,
  });
}

type StripeLifecycleShape = {
  id?: string | null;
  object?: string | null;
  customer?: string | { id?: string } | null;
  status?: string | null;
  metadata?: Record<string, string | undefined> | null;
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
  current_period_end?: number | null;
  items?: {
    data?: Array<{
      current_period_end?: number | null;
      price?: { id?: string | null } | null;
    }> | null;
  } | null;
};

export type StripeRefundInput = {
  paymentIntentId?: string | null;
  chargeId?: string | null;
  amountCents?: number;
  idempotencyKey: string;
  metadata?: Record<string, string>;
};

export type StripeRefundResult = {
  id: string;
  status: string | null;
  amount: number | null;
};

/** Live refunds only. Caller must have already checked stripeChargesLive(). */
export async function createStripeRefund(input: StripeRefundInput): Promise<StripeRefundResult> {
  const paymentIntent = String(input.paymentIntentId || "").trim();
  const charge = String(input.chargeId || "").trim();
  if (!paymentIntent && !charge) throw new Error("Stripe refund needs a payment intent or charge id");
  const body: Record<string, unknown> = {
    metadata: { kidease: "support_refund", ...(input.metadata || {}) },
  };
  if (paymentIntent) body.payment_intent = paymentIntent;
  else body.charge = charge;
  if (input.amountCents != null && input.amountCents > 0) body.amount = Math.floor(input.amountCents);
  const json = await stripeRequest<{ id?: string; status?: string; amount?: number }>(
    "/refunds",
    body,
    "POST",
    { idempotencyKey: input.idempotencyKey },
  );
  if (!json.id) throw new Error("Stripe refund failed");
  return { id: json.id, status: json.status ?? null, amount: json.amount ?? null };
}
