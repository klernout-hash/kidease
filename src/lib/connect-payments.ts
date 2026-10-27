/**
 * Parent-to-daycare Stripe Connect payments.
 *
 * Off unless KIDEASE_CONNECT_PAYMENTS is on. This is an env gate, not a
 * PostHog flag, so a remote toggle cannot turn charges on.
 *
 * application_fee_amount is exactly KIDEASE_PLATFORM_FEE_BPS of the invoice
 * (200 = 2% when unset). GST/PST is never added to that fee. Tax on KidEase
 * fees is a separate monthly invoice, and only when a Stripe Tax calculation
 * or a configured rate is set. Daycares pay Stripe processing fees
 * (on_behalf_of + fees.payer = account).
 *
 * Test keys only. sk_live_ / pk_live_ are refused. No secret values live here.
 */

export type ConnectEnv = Record<string, string | undefined>;

export const CONNECT_PAYMENTS_ENV = "KIDEASE_CONNECT_PAYMENTS";
export const CONNECT_FEE_BPS_DEFAULT = 200;
export const CONNECT_FEE_BPS_MAX = 2000;

export type PayMode = "automatic" | "manual";

export type FeeTaxPlan =
  | { kind: "none" }
  | { kind: "manual"; rateId: string | null; taxBps: number }
  | { kind: "stripe_tax" };

export type ConnectChargeGate =
  | { ok: true }
  | { ok: false; reason: "off" | "missing" | "live" };

function envOn(raw: string | undefined | null): boolean {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function clean(raw: string | undefined | null): string {
  return String(raw || "").trim();
}

export function connectPaymentsEnabled(env: ConnectEnv = process.env): boolean {
  return envOn(env[CONNECT_PAYMENTS_ENV]);
}

export type StripeKeyMode = "missing" | "test" | "live" | "other";

export function stripeKeyMode(raw: string | undefined | null, kind: "secret" | "publishable"): StripeKeyMode {
  const key = clean(raw);
  if (!key) return "missing";
  const test = kind === "secret" ? "sk_test_" : "pk_test_";
  const live = kind === "secret" ? "sk_live_" : "pk_live_";
  if (key.startsWith(test)) return "test";
  if (key.startsWith(live)) return "live";
  return "other";
}

/** Flag on, secret is sk_test_, and the publishable key is missing or pk_test_. */
export function connectChargeGate(env: ConnectEnv = process.env): ConnectChargeGate {
  if (!connectPaymentsEnabled(env)) return { ok: false, reason: "off" };
  const secret = stripeKeyMode(env.STRIPE_SECRET_KEY, "secret");
  const publishable = stripeKeyMode(env.STRIPE_PUBLISHABLE_KEY, "publishable");
  if (secret === "live" || publishable === "live") return { ok: false, reason: "live" };
  if (secret !== "test") return { ok: false, reason: "missing" };
  if (publishable === "other") return { ok: false, reason: "live" };
  return { ok: true };
}

export function connectFeeBps(raw: string | undefined | null = process.env.KIDEASE_PLATFORM_FEE_BPS): number {
  if (raw == null || String(raw).trim() === "") return CONNECT_FEE_BPS_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return CONNECT_FEE_BPS_DEFAULT;
  return Math.min(Math.round(n), CONNECT_FEE_BPS_MAX);
}

/** Exactly bps of the invoice. Tax is not included. */
export function applicationFeeCents(invoiceCents: number, bps = connectFeeBps()): number {
  const cents = Math.round(Number(invoiceCents));
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  return Math.round((cents * bps) / 10000);
}

export function destinationChargeFields(input: { invoiceCents: number; destination: string; bps?: number }): {
  amount: number;
  currency: "cad";
  application_fee_amount: number;
  on_behalf_of: string;
  transfer_data: { destination: string };
} {
  const destination = clean(input.destination);
  if (!destination.startsWith("acct_")) throw new Error("Connect account id required");
  const amount = Math.round(Number(input.invoiceCents));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invoice amount required");
  const fee = applicationFeeCents(amount, input.bps ?? connectFeeBps());
  if (fee > amount) throw new Error("Fee is larger than the invoice");
  return {
    amount,
    currency: "cad",
    application_fee_amount: fee,
    on_behalf_of: destination,
    transfer_data: { destination },
  };
}

/**
 * Tax on the KidEase fee only. None when neither Stripe Tax nor a manual
 * rate is configured — do not invent GST or PST.
 */
export function feeTaxPlan(env: ConnectEnv = process.env): FeeTaxPlan {
  const rateId = clean(env.STRIPE_FEE_TAX_RATE_ID);
  const bpsRaw = env.KIDEASE_FEE_TAX_BPS;
  const hasBps = bpsRaw != null && String(bpsRaw).trim() !== "" && Number.isFinite(Number(bpsRaw));
  const manualId = rateId.startsWith("txr_") ? rateId : null;
  if (hasBps || manualId) {
    const taxBps = hasBps ? Math.min(Math.max(Math.round(Number(bpsRaw)), 0), CONNECT_FEE_BPS_MAX) : -1;
    return { kind: "manual", rateId: manualId, taxBps };
  }
  if (envOn(env.STRIPE_AUTOMATIC_TAX)) return { kind: "stripe_tax" };
  return { kind: "none" };
}

/** Manual rate only. Stripe Tax amounts come back from the API, never guessed. */
export function manualFeeTaxCents(feeCents: number, plan: FeeTaxPlan): number | null {
  if (plan.kind !== "manual" || plan.taxBps < 0) return null;
  const fee = Math.round(Number(feeCents));
  if (!Number.isFinite(fee) || fee < 0) return null;
  if (fee === 0 || plan.taxBps === 0) return 0;
  return Math.round((fee * plan.taxBps) / 10000);
}

export function stripeTaxCalculationBody(feeCents: number): Record<string, unknown> {
  const amount = Math.round(Number(feeCents));
  return {
    currency: "cad",
    customer_details: {
      address: { country: "CA" },
      address_source: "billing",
    },
    line_items: [{ amount, reference: "kidease_fee", tax_behavior: "exclusive" }],
  };
}

/** Invoice line is the tax only, so the 2% fee is not charged again. */
export function monthlyFeeTaxLine(input: {
  plan: FeeTaxPlan;
  feeCents: number;
  calculatedTaxCents?: number | null;
}): { amount: number; currency: "cad"; description: string } | null {
  if (input.plan.kind === "none") return null;
  const manual = manualFeeTaxCents(input.feeCents, input.plan);
  const calculated =
    input.calculatedTaxCents == null || !Number.isFinite(Number(input.calculatedTaxCents))
      ? null
      : Math.round(Number(input.calculatedTaxCents));
  const amount = input.plan.kind === "manual" && manual != null ? manual : calculated;
  if (amount == null || amount < 0) return null;
  if (amount === 0) return null;
  return { amount, currency: "cad", description: "Tax on KidEase fees" };
}

/** A repeated bill does not add its tax twice. */
export function appendMonthlyFeeTax(input: {
  recordedBillIds: string[];
  billId: string;
  feeCents: number;
  taxCents: number;
  priorFeeCents: number;
  priorTaxCents: number;
}): { feeCents: number; taxCents: number; record: boolean } {
  const fee = Math.max(0, Math.round(Number(input.feeCents)) || 0);
  const tax = Math.max(0, Math.round(Number(input.taxCents)) || 0);
  const priorFee = Math.max(0, Math.round(Number(input.priorFeeCents)) || 0);
  const priorTax = Math.max(0, Math.round(Number(input.priorTaxCents)) || 0);
  if (!input.billId || input.recordedBillIds.includes(input.billId)) {
    return { feeCents: priorFee, taxCents: priorTax, record: false };
  }
  return { feeCents: priorFee + fee, taxCents: priorTax + tax, record: true };
}

/** True when `period` is an earlier YYYY-MM than `current`. */
export function isEarlierPeriod(period: string, current: string): boolean {
  return /^\d{4}-\d{2}$/.test(period) && /^\d{4}-\d{2}$/.test(current) && period < current;
}

export function monthlyFeeTaxInvoiceBody(input: {
  customerId: string;
  daycareId: string;
  period: string;
}): Record<string, unknown> {
  return {
    customer: input.customerId,
    currency: "cad",
    collection_method: "send_invoice",
    days_until_due: 30,
    auto_advance: false,
    pending_invoice_items_behavior: "exclude",
    metadata: { kidease: "fee_tax", daycare_id: input.daycareId, period: input.period },
    description: "Tax on KidEase fees",
  };
}

export function parsePayMode(raw: unknown): PayMode {
  return raw === "automatic" ? "automatic" : "manual";
}

/** Billing invoice. Smart Retries stay on Stripe's Billing setting for charge_automatically. */
export function parentInvoiceBody(input: {
  mode: PayMode;
  customerId: string;
  destination: string;
  invoiceCents: number;
  billId: string;
  defaultPaymentMethod?: string | null;
  bps?: number;
}): Record<string, unknown> {
  const charge = destinationChargeFields({
    invoiceCents: input.invoiceCents,
    destination: input.destination,
    bps: input.bps,
  });
  const body: Record<string, unknown> = {
    customer: input.customerId,
    currency: "cad",
    collection_method: input.mode === "automatic" ? "charge_automatically" : "send_invoice",
    auto_advance: input.mode === "automatic",
    on_behalf_of: charge.on_behalf_of,
    transfer_data: charge.transfer_data,
    application_fee_amount: charge.application_fee_amount,
    pending_invoice_items_behavior: "exclude",
    metadata: { kidease: "bill", bill_id: input.billId },
  };
  if (input.mode === "manual") body.days_until_due = 30;
  const method = clean(input.defaultPaymentMethod);
  if (input.mode === "automatic" && method.startsWith("pm_")) body.default_payment_method = method;
  return body;
}

export function parentInvoiceLine(invoiceCents: number, description: string): Record<string, unknown> {
  const amount = Math.round(Number(invoiceCents));
  return { amount, currency: "cad", description: description.slice(0, 250) || "Daycare bill" };
}

export function walletSetupIntentBody(): Record<string, unknown> {
  return {
    usage: "off_session",
    payment_method_types: ["card", "acss_debit"],
    payment_method_options: {
      acss_debit: {
        currency: "cad",
        mandate_options: {
          payment_schedule: "sporadic",
          transaction_type: "personal",
        },
      },
    },
  };
}

/** Drop Stripe's hosted invoice page. Parents pay in the app. */
export function withoutHostedInvoice<T extends Record<string, unknown>>(invoice: T): T {
  const next = { ...invoice };
  delete next.hosted_invoice_url;
  delete next.invoice_pdf;
  return next;
}

export function connectedAccountBody(): Record<string, unknown> {
  return {
    country: "CA",
    controller: {
      stripe_dashboard: { type: "none" },
      fees: { payer: "account" },
      losses: { payments: "application" },
      requirement_collection: "application",
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  };
}

export function accountSessionBody(accountId: string): Record<string, unknown> {
  const account = clean(accountId);
  if (!account.startsWith("acct_")) throw new Error("Connect account id required");
  return {
    account,
    components: {
      account_onboarding: { enabled: true },
      payouts: { enabled: true },
    },
  };
}

export type ConnectPublicState = {
  enabled: boolean;
  ready: boolean;
  blockedLive: boolean;
  publishableKey: string | null;
  appleMerchantId: string | null;
  googlePayMerchantId: string | null;
};

export function publicConnectState(env: ConnectEnv = process.env): ConnectPublicState {
  const enabled = connectPaymentsEnabled(env);
  const gate = connectChargeGate(env);
  const publishable = clean(env.STRIPE_PUBLISHABLE_KEY);
  const ready = gate.ok && stripeKeyMode(publishable, "publishable") === "test";
  const blockedLive = enabled && gate.ok === false && gate.reason === "live";
  return {
    enabled,
    ready,
    blockedLive,
    publishableKey: ready ? publishable : null,
    appleMerchantId: enabled ? clean(env.APPLE_MERCHANT_ID) || null : null,
    googlePayMerchantId: enabled ? clean(env.GOOGLE_PAY_MERCHANT_ID) || null : null,
  };
}

export type WalletMethodKind = "card" | "apple_pay" | "google_pay" | "acss_debit";

export type WalletMethodView = {
  id: string;
  brand: string;
  last4: string;
  nickname: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  kind: WalletMethodKind;
};

type StripeMethod = {
  id?: string;
  type?: string;
  metadata?: Record<string, string | undefined> | null;
  card?: {
    brand?: string;
    last4?: string;
    exp_month?: number;
    exp_year?: number;
    wallet?: { type?: string } | null;
  } | null;
  acss_debit?: { bank_name?: string; last4?: string } | null;
};

export function shapeWalletMethod(raw: StripeMethod | null | undefined, defaultId: string | null): WalletMethodView | null {
  if (!raw?.id) return null;
  const wallet = raw.card?.wallet?.type;
  const kind: WalletMethodKind =
    wallet === "apple_pay" ? "apple_pay" : wallet === "google_pay" ? "google_pay" : raw.type === "acss_debit" ? "acss_debit" : "card";
  const last4 = clean(kind === "acss_debit" ? raw.acss_debit?.last4 : raw.card?.last4);
  if (!/^\d{4}$/.test(last4)) return null;
  const brand =
    kind === "apple_pay"
      ? "Apple Pay"
      : kind === "google_pay"
        ? "Google Pay"
        : kind === "acss_debit"
          ? clean(raw.acss_debit?.bank_name) || "Bank"
          : clean(raw.card?.brand) || "Card";
  const nickname = clean(raw.metadata?.nickname) || null;
  const expMonth = kind === "card" || kind === "apple_pay" || kind === "google_pay" ? Number(raw.card?.exp_month) || null : null;
  const expYear = kind === "card" || kind === "apple_pay" || kind === "google_pay" ? Number(raw.card?.exp_year) || null : null;
  return {
    id: raw.id,
    brand,
    last4,
    nickname,
    expMonth,
    expYear,
    isDefault: Boolean(defaultId && raw.id === defaultId),
    kind,
  };
}

export type ConnectEventAction =
  | { kind: "ignore" }
  | {
      kind: "account";
      accountId: string;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      detailsSubmitted: boolean;
    }
  | { kind: "payout"; payoutId: string }
  | { kind: "fee_tax"; invoiceId: string; status: string; daycareId: string | null; period: string | null }
  | { kind: "bill"; billId: string | null };

function metaOf(object: Record<string, unknown> | null): Record<string, string> {
  const raw = object?.metadata;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value != null && String(value).trim()) out[key] = String(value).trim();
  }
  return out;
}

export function classifyConnectEvent(type: string, object: Record<string, unknown> | null): ConnectEventAction {
  const meta = metaOf(object);
  if (type === "account.updated") {
    const accountId = clean(typeof object?.id === "string" ? object.id : "");
    if (!accountId.startsWith("acct_")) return { kind: "ignore" };
    return {
      kind: "account",
      accountId,
      chargesEnabled: object?.charges_enabled === true,
      payoutsEnabled: object?.payouts_enabled === true,
      detailsSubmitted: object?.details_submitted === true,
    };
  }
  if (type === "payout.paid") {
    const payoutId = clean(typeof object?.id === "string" ? object.id : "");
    if (!/^po_/.test(payoutId)) return { kind: "ignore" };
    return { kind: "payout", payoutId };
  }
  if (type === "invoice.paid" && meta.kidease === "fee_tax") {
    const invoiceId = clean(typeof object?.id === "string" ? object.id : "");
    if (!invoiceId.startsWith("in_")) return { kind: "ignore" };
    return {
      kind: "fee_tax",
      invoiceId,
      status: "paid",
      daycareId: meta.daycare_id || null,
      period: meta.period || null,
    };
  }
  if ((type === "invoice.paid" || type === "payment_intent.succeeded") && (meta.kidease === "bill" || meta.bill_id)) {
    return { kind: "bill", billId: meta.bill_id || null };
  }
  return { kind: "ignore" };
}

export function webhookSecrets(env: ConnectEnv = process.env): string[] {
  const values = [clean(env.STRIPE_WEBHOOK_SECRET), clean(env.STRIPE_CONNECT_WEBHOOK_SECRET)].filter(Boolean);
  return [...new Set(values)];
}
