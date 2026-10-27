/**
 * Parent-to-daycare Stripe Connect payments.
 *
 * Off unless KIDEASE_CONNECT_PAYMENTS is on. This is an env gate, not a
 * PostHog flag, so a remote toggle cannot turn charges on.
 *
 * application_fee_amount is exactly KIDEASE_PLATFORM_FEE_BPS of the invoice
 * (200 = 2% when unset). GST/HST/PST/QST is never added to that fee. Tax on
 * KidEase fees is a separate monthly invoice. The rate follows the daycare's
 * province when a tax method is turned on. Daycares pay Stripe processing
 * fees (on_behalf_of + fees.payer = account).
 *
 * Test keys work when KIDEASE_CONNECT_PAYMENTS is on. sk_live_ / pk_live_
 * also need KIDEASE_CONNECT_LIVE=1. Otherwise live keys are refused.
 * No secret values live here.
 */

export type ConnectEnv = Record<string, string | undefined>;

export const CONNECT_PAYMENTS_ENV = "KIDEASE_CONNECT_PAYMENTS";
export const CONNECT_LIVE_ENV = "KIDEASE_CONNECT_LIVE";
export const CONNECT_FEE_BPS_DEFAULT = 200;
export const CONNECT_FEE_BPS_MAX = 2000;
/** Card plus Canadian pre-authorised debit (PAD / acss_debit). */
export const CONNECT_CHARGE_METHOD_TYPES = ["card", "acss_debit"] as const;

export const FEE_TAX_DESCRIPTION = "Tax on KidEase fees / Taxe sur les frais KidEase";

export type PayMode = "automatic" | "manual";

export type FeeTaxPlan =
  | { kind: "none" }
  | { kind: "manual"; rateId: string | null; taxBps: number }
  | { kind: "province"; rateId: string | null; fallbackBps: number | null }
  | { kind: "stripe_tax" };

export type FeeTaxPlace = {
  province?: string | null;
  postalCode?: string | null;
};

/** Combined GST/HST/PST/QST as parts per million (100% = 1_000_000). */
export type ProvinceFeeTax = {
  code: string;
  perMillion: number;
  labelEn: string;
  labelFr: string;
};

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

/** Live Connect keys. Only the exact value 1 opens them. */
export function connectLiveEnabled(env: ConnectEnv = process.env): boolean {
  return String(env[CONNECT_LIVE_ENV] ?? "").trim() === "1";
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

/**
 * Payments flag on, and the keys are a matching pair.
 * Test keys: sk_test_, publishable missing or pk_test_.
 * Live keys: sk_live_ and pk_live_ (publishable may be missing) only when
 * KIDEASE_CONNECT_PAYMENTS is on and KIDEASE_CONNECT_LIVE is exactly 1.
 * A test key beside a live key stays refused.
 */
export function connectChargeGate(env: ConnectEnv = process.env): ConnectChargeGate {
  if (!connectPaymentsEnabled(env)) return { ok: false, reason: "off" };
  const secret = stripeKeyMode(env.STRIPE_SECRET_KEY, "secret");
  const publishable = stripeKeyMode(env.STRIPE_PUBLISHABLE_KEY, "publishable");
  if (secret === "other" || publishable === "other") return { ok: false, reason: "live" };
  const liveKey = secret === "live" || publishable === "live";
  if (liveKey) {
    if (!connectLiveEnabled(env)) return { ok: false, reason: "live" };
    if (secret !== "live") return { ok: false, reason: "live" };
    if (publishable !== "missing" && publishable !== "live") return { ok: false, reason: "live" };
    return { ok: true };
  }
  if (secret !== "test") return { ok: false, reason: "missing" };
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
 * Published combined GST/HST/PST/QST on a taxable service, by province.
 * Nova Scotia HST is 14% from 1 April 2025. Quebec is GST 5% plus QST
 * 9.975% on the same amount (not compounded). PST does not apply to every
 * kind of service, so this table stays off until KIDEASE_FEE_TAX_MODE=province
 * and an accountant has signed off.
 */
export const PROVINCE_FEE_TAX: readonly ProvinceFeeTax[] = [
  { code: "AB", perMillion: 50_000, labelEn: "Alberta GST", labelFr: "TPS de l'Alberta" },
  { code: "BC", perMillion: 120_000, labelEn: "British Columbia GST and PST", labelFr: "TPS et TVP de la Colombie-Britannique" },
  { code: "MB", perMillion: 120_000, labelEn: "Manitoba GST and RST", labelFr: "TPS et TVD du Manitoba" },
  { code: "NB", perMillion: 150_000, labelEn: "New Brunswick HST", labelFr: "TVH du Nouveau-Brunswick" },
  { code: "NL", perMillion: 150_000, labelEn: "Newfoundland and Labrador HST", labelFr: "TVH de Terre-Neuve-et-Labrador" },
  { code: "NS", perMillion: 140_000, labelEn: "Nova Scotia HST", labelFr: "TVH de la Nouvelle-Écosse" },
  { code: "NT", perMillion: 50_000, labelEn: "Northwest Territories GST", labelFr: "TPS des Territoires du Nord-Ouest" },
  { code: "NU", perMillion: 50_000, labelEn: "Nunavut GST", labelFr: "TPS du Nunavut" },
  { code: "ON", perMillion: 130_000, labelEn: "Ontario HST", labelFr: "TVH de l'Ontario" },
  { code: "PE", perMillion: 150_000, labelEn: "Prince Edward Island HST", labelFr: "TVH de l'Île-du-Prince-Édouard" },
  { code: "QC", perMillion: 149_750, labelEn: "Quebec GST and QST", labelFr: "TPS et TVQ du Québec" },
  { code: "SK", perMillion: 110_000, labelEn: "Saskatchewan GST and PST", labelFr: "TPS et TVP de la Saskatchewan" },
  { code: "YT", perMillion: 50_000, labelEn: "Yukon GST", labelFr: "TPS du Yukon" },
];

const PROVINCE_FEE_TAX_BY_CODE = new Map(PROVINCE_FEE_TAX.map((row) => [row.code, row]));

const PROVINCE_NAME_TO_CODE: Record<string, string> = {
  ab: "AB",
  alberta: "AB",
  bc: "BC",
  "british columbia": "BC",
  "colombie-britannique": "BC",
  "colombie britannique": "BC",
  mb: "MB",
  manitoba: "MB",
  nb: "NB",
  "new brunswick": "NB",
  "nouveau-brunswick": "NB",
  "nouveau brunswick": "NB",
  nl: "NL",
  "newfoundland and labrador": "NL",
  "newfoundland": "NL",
  "terre-neuve-et-labrador": "NL",
  "terre neuve et labrador": "NL",
  ns: "NS",
  "nova scotia": "NS",
  "nouvelle-ecosse": "NS",
  "nouvelle ecosse": "NS",
  nt: "NT",
  "northwest territories": "NT",
  "territoires du nord-ouest": "NT",
  nu: "NU",
  nunavut: "NU",
  on: "ON",
  ontario: "ON",
  pe: "PE",
  pei: "PE",
  "prince edward island": "PE",
  "ile-du-prince-edouard": "PE",
  "ile du prince edouard": "PE",
  qc: "QC",
  pq: "QC",
  quebec: "QC",
  sk: "SK",
  saskatchewan: "SK",
  yt: "YT",
  yukon: "YT",
};

function foldPlace(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canadian province code from a listing value. Blank when it is not one of the 13. */
export function provinceCodeFromPlace(raw: string | null | undefined): string {
  const folded = foldPlace(String(raw || ""));
  if (!folded) return "";
  return PROVINCE_NAME_TO_CODE[folded] || "";
}

export function provinceFeeTax(raw: string | null | undefined): ProvinceFeeTax | null {
  const code = provinceCodeFromPlace(raw);
  return PROVINCE_FEE_TAX_BY_CODE.get(code) ?? null;
}

function formatTaxPercent(perMillion: number, locale: "en" | "fr"): string {
  const pct = perMillion / 10_000;
  const rounded = Math.round(pct * 1000) / 1000;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  if (locale === "fr") return `${text.replace(".", ",")} %`;
  return `${text}%`;
}

export function provinceFeeTaxDescription(row: ProvinceFeeTax): string {
  const en = formatTaxPercent(row.perMillion, "en");
  const fr = formatTaxPercent(row.perMillion, "fr");
  return `Tax on KidEase fees — ${row.labelEn} ${en} / Taxe sur les frais KidEase — ${row.labelFr} ${fr}`;
}

/** Tax cents from a parts-per-million rate. Null when the inputs are not numbers. */
export function taxCentsFromPerMillion(feeCents: number, perMillion: number): number | null {
  const fee = Math.round(Number(feeCents));
  const rate = Number(perMillion);
  if (!Number.isFinite(fee) || fee < 0 || !Number.isFinite(rate) || rate < 0) return null;
  if (fee === 0 || rate === 0) return 0;
  return Math.round((fee * rate) / 1_000_000);
}

function configuredFeeTax(env: ConnectEnv): { manualId: string | null; hasBps: boolean; taxBps: number } {
  const rateId = clean(env.STRIPE_FEE_TAX_RATE_ID);
  const manualId = rateId.startsWith("txr_") ? rateId : null;
  const bpsRaw = env.KIDEASE_FEE_TAX_BPS;
  const hasBps = bpsRaw != null && String(bpsRaw).trim() !== "" && Number.isFinite(Number(bpsRaw));
  const taxBps = hasBps ? Math.min(Math.max(Math.round(Number(bpsRaw)), 0), CONNECT_FEE_BPS_MAX) : -1;
  return { manualId, hasBps, taxBps };
}

/**
 * Tax on the KidEase fee only. Do not invent a rate.
 * STRIPE_AUTOMATIC_TAX uses Stripe Tax for the daycare's province.
 * KIDEASE_FEE_TAX_MODE=province uses the built-in table, then
 * KIDEASE_FEE_TAX_BPS when the province is missing.
 * Otherwise a flat KIDEASE_FEE_TAX_BPS / STRIPE_FEE_TAX_RATE_ID is the manual fallback.
 */
export function feeTaxPlan(env: ConnectEnv = process.env): FeeTaxPlan {
  if (envOn(env.STRIPE_AUTOMATIC_TAX)) return { kind: "stripe_tax" };
  const { manualId, hasBps, taxBps } = configuredFeeTax(env);
  const mode = clean(env.KIDEASE_FEE_TAX_MODE).toLowerCase();
  if (mode === "province" || mode === "table") {
    return { kind: "province", rateId: manualId, fallbackBps: hasBps ? taxBps : null };
  }
  if (hasBps || manualId) return { kind: "manual", rateId: manualId, taxBps };
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

export function stripeTaxCalculationBody(feeCents: number, place?: FeeTaxPlace | null): Record<string, unknown> {
  const amount = Math.round(Number(feeCents));
  const address: Record<string, string> = { country: "CA" };
  const code = provinceCodeFromPlace(place?.province);
  // Stripe names this field `state`. For KidEase it is the province code.
  if (code) address.state = code;
  const postal = clean(place?.postalCode).toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(postal)) {
    address.postal_code = `${postal.slice(0, 3)} ${postal.slice(3)}`;
  }
  return {
    currency: "cad",
    customer_details: {
      address,
      address_source: "billing",
    },
    line_items: [{ amount, reference: "kidease_fee", tax_behavior: "exclusive" }],
  };
}

/** Invoice line is the tax only, so the 2% fee is not charged again. */
export function monthlyFeeTaxLine(input: {
  plan: FeeTaxPlan;
  feeCents: number;
  province?: string | null;
  calculatedTaxCents?: number | null;
}): { amount: number; currency: "cad"; description: string } | null {
  if (input.plan.kind === "none") return null;
  const calculated =
    input.calculatedTaxCents == null || !Number.isFinite(Number(input.calculatedTaxCents))
      ? null
      : Math.round(Number(input.calculatedTaxCents));
  let amount: number | null = null;
  let description = FEE_TAX_DESCRIPTION;
  if (input.plan.kind === "manual") {
    amount = manualFeeTaxCents(input.feeCents, input.plan);
  } else if (input.plan.kind === "province") {
    const row = provinceFeeTax(input.province);
    if (row) {
      amount = taxCentsFromPerMillion(input.feeCents, row.perMillion);
      description = provinceFeeTaxDescription(row);
    } else if (input.plan.fallbackBps != null) {
      amount = manualFeeTaxCents(input.feeCents, {
        kind: "manual",
        rateId: input.plan.rateId,
        taxBps: input.plan.fallbackBps,
      });
    }
  } else {
    amount = calculated;
  }
  if (amount == null || amount < 0) return null;
  if (amount === 0) return null;
  return { amount, currency: "cad", description };
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
  description?: string | null;
  province?: string | null;
}): Record<string, unknown> {
  const province = provinceCodeFromPlace(input.province);
  return {
    customer: input.customerId,
    currency: "cad",
    collection_method: "send_invoice",
    days_until_due: 30,
    auto_advance: false,
    pending_invoice_items_behavior: "exclude",
    metadata: {
      kidease: "fee_tax",
      daycare_id: input.daycareId,
      period: input.period,
      ...(province ? { province } : {}),
    },
    description: clean(input.description) || FEE_TAX_DESCRIPTION,
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
    payment_settings: connectInvoicePaymentSettings(),
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

/** Invoice payment methods. Card, plus Canadian PAD. The daycare absorbs Stripe fees. */
export function connectInvoicePaymentSettings(): Record<string, unknown> {
  return {
    payment_method_types: [...CONNECT_CHARGE_METHOD_TYPES],
    payment_method_options: {
      acss_debit: {
        mandate_options: {
          transaction_type: "personal",
        },
      },
    },
  };
}

export function walletSetupIntentBody(): Record<string, unknown> {
  return {
    usage: "off_session",
    payment_method_types: [...CONNECT_CHARGE_METHOD_TYPES],
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
      acss_debit_payments: { requested: true },
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
  const publishableMode = stripeKeyMode(publishable, "publishable");
  const ready = gate.ok && (publishableMode === "test" || publishableMode === "live");
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
