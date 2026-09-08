import type { PayMethod } from "./types";

/** Featured first on parent checkout (Canada). */
export const FEATURED_PAY_METHODS: PayMethod[] = [
  "card",
  "apple_pay",
  "google_pay",
  "link",
  "interac",
  "acss_debit",
  "customer_balance",
  "paypal",
];

/** Full Stripe catalog KidEase can turn on once the account is connected. */
export const ALL_STRIPE_METHODS: PayMethod[] = [
  "card",
  "apple_pay",
  "google_pay",
  "link",
  "paypal",
  "amazon_pay",
  "cashapp",
  "interac",
  "acss_debit",
  "customer_balance",
  "us_bank_account",
  "afterpay_clearpay",
  "klarna",
  "affirm",
  "alipay",
  "wechat_pay",
  "sepa_debit",
  "ideal",
];

export const STRIPE_METHOD_META: Record<
  PayMethod,
  { stripe: string; instant: boolean; group: "wallet" | "bank" | "bnpl" | "intl" }
> = {
  card: { stripe: "card", instant: true, group: "wallet" },
  apple: { stripe: "card", instant: true, group: "wallet" },
  google: { stripe: "card", instant: true, group: "wallet" },
  apple_pay: { stripe: "card", instant: true, group: "wallet" },
  google_pay: { stripe: "card", instant: true, group: "wallet" },
  link: { stripe: "link", instant: true, group: "wallet" },
  paypal: { stripe: "paypal", instant: true, group: "wallet" },
  amazon_pay: { stripe: "amazon_pay", instant: true, group: "wallet" },
  cashapp: { stripe: "cashapp", instant: true, group: "wallet" },
  interac: { stripe: "interac_present", instant: false, group: "bank" },
  acss_debit: { stripe: "acss_debit", instant: false, group: "bank" },
  customer_balance: { stripe: "customer_balance", instant: false, group: "bank" },
  us_bank_account: { stripe: "us_bank_account", instant: false, group: "bank" },
  afterpay_clearpay: { stripe: "afterpay_clearpay", instant: true, group: "bnpl" },
  klarna: { stripe: "klarna", instant: true, group: "bnpl" },
  affirm: { stripe: "affirm", instant: true, group: "bnpl" },
  alipay: { stripe: "alipay", instant: true, group: "intl" },
  wechat_pay: { stripe: "wechat_pay", instant: true, group: "intl" },
  sepa_debit: { stripe: "sepa_debit", instant: false, group: "intl" },
  ideal: { stripe: "ideal", instant: true, group: "intl" },
};

export function normalizePayMethod(raw: string): PayMethod {
  if (raw === "apple") return "apple_pay";
  if (raw === "google") return "google_pay";
  if ((ALL_STRIPE_METHODS as string[]).includes(raw)) return raw as PayMethod;
  return "card";
}

export function methodSettlesInstantly(method: PayMethod): boolean {
  return STRIPE_METHOD_META[method]?.instant ?? true;
}

/** Posted KidEase Connect fee. Override with KIDEASE_PLATFORM_FEE_BPS (server env). */
export const DEFAULT_PLATFORM_FEE_BPS = 300;
export const MAX_PLATFORM_FEE_BPS = 2000;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function platformFeeBps(raw = process.env.KIDEASE_PLATFORM_FEE_BPS): number {
  const n = Number(raw ?? String(DEFAULT_PLATFORM_FEE_BPS));
  if (!Number.isFinite(n) || n < 0) return DEFAULT_PLATFORM_FEE_BPS;
  return Math.min(Math.round(n), MAX_PLATFORM_FEE_BPS);
}

export function splitFee(gross: number, bps = platformFeeBps()): { platformFee: number; net: number } {
  const fee = Math.round((gross * bps) / 10000);
  return { platformFee: fee, net: Math.max(0, gross - fee) };
}

/** Percent from posted bps. Null when the rate is unknown — do not invent one. */
export function platformFeePercentLabel(bps: number | null | undefined): string | null {
  if (bps == null || !Number.isFinite(bps) || bps < 0) return null;
  return `${(bps / 100).toFixed(1)}%`;
}

export function currentPeriod(at = new Date()): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
}

export function periodLabel(period: string, locale = "en"): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", {
    month: "long",
    year: "numeric",
  });
}
