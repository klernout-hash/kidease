/**
 * Server-only Stripe catalog for KidEase LIVE prices.
 *
 * Price IDs come from env — never hardcode secret keys or live price values
 * that belong in Vercel. `price_…` IDs are not secrets; `sk_live_…` is.
 *
 * Required when turning on centre / Plus checkout:
 *   STRIPE_PRICE_PRO_MONTHLY
 *   STRIPE_PRICE_PRO_YEARLY
 *   STRIPE_PRICE_NETWORK_MONTHLY
 *   STRIPE_PRICE_PLUS_MONTHLY
 *   STRIPE_PRICE_PLUS_YEARLY
 *
 * Optional add-ons:
 *   STRIPE_PRICE_FEATURED_CITY   ($29 / month)
 *   STRIPE_PRICE_CLAIM_BOOST     ($99 once)
 *   STRIPE_PRICE_JOB_POST        ($49 once)
 *
 * Optional Dashboard Payment Links (fallback; Checkout Session is preferred):
 *   STRIPE_PAYMENT_LINK_FEATURED_CITY
 *   STRIPE_PAYMENT_LINK_CLAIM_BOOST
 *   STRIPE_PAYMENT_LINK_JOB_POST
 */

export const STRIPE_PRICE_ENV = {
  pro_monthly: "STRIPE_PRICE_PRO_MONTHLY",
  pro_yearly: "STRIPE_PRICE_PRO_YEARLY",
  network_monthly: "STRIPE_PRICE_NETWORK_MONTHLY",
  plus_monthly: "STRIPE_PRICE_PLUS_MONTHLY",
  plus_yearly: "STRIPE_PRICE_PLUS_YEARLY",
  featured_city: "STRIPE_PRICE_FEATURED_CITY",
  claim_boost: "STRIPE_PRICE_CLAIM_BOOST",
  job_post: "STRIPE_PRICE_JOB_POST",
} as const;

export type StripePriceKey = keyof typeof STRIPE_PRICE_ENV;

export const STRIPE_PAYMENT_LINK_ENV = {
  featured_city: "STRIPE_PAYMENT_LINK_FEATURED_CITY",
  claim_boost: "STRIPE_PAYMENT_LINK_CLAIM_BOOST",
  job_post: "STRIPE_PAYMENT_LINK_JOB_POST",
} as const;

export type StripeCatalogKind = "recurring" | "one_time";

export type StripeCatalogItem = {
  key: StripePriceKey;
  lookupKey: string;
  productName: string;
  description: string;
  /** CAD dollars (7.99 stays fractional). */
  amountCad: number;
  kind: StripeCatalogKind;
  interval?: "month" | "year";
  required: boolean;
};

/** CAD one-pager — amounts only, never secret keys. */
export const STRIPE_CATALOG: StripeCatalogItem[] = [
  {
    key: "pro_monthly",
    lookupKey: "kidease_pro_monthly",
    productName: "KidEase Daycare Pro",
    description: "Unlimited inquiries, one featured city, 90-day analytics.",
    amountCad: 49,
    kind: "recurring",
    interval: "month",
    required: true,
  },
  {
    key: "pro_yearly",
    lookupKey: "kidease_pro_yearly",
    productName: "KidEase Daycare Pro",
    description: "Daycare Pro billed yearly (two months free).",
    amountCad: 490,
    kind: "recurring",
    interval: "year",
    required: true,
  },
  {
    key: "network_monthly",
    lookupKey: "kidease_network_monthly",
    productName: "KidEase Network",
    description: "Organization dashboard — $39 per licensed site / month.",
    amountCad: 39,
    kind: "recurring",
    interval: "month",
    required: true,
  },
  {
    key: "plus_monthly",
    lookupKey: "kidease_plus_monthly",
    productName: "KidEase Parent Plus",
    description: "Parent Plus extras — saved-search alerts and priority support.",
    amountCad: 7.99,
    kind: "recurring",
    interval: "month",
    required: true,
  },
  {
    key: "plus_yearly",
    lookupKey: "kidease_plus_yearly",
    productName: "KidEase Parent Plus",
    description: "Parent Plus billed yearly.",
    amountCad: 59,
    kind: "recurring",
    interval: "year",
    required: true,
  },
  {
    key: "featured_city",
    lookupKey: "kidease_featured_city",
    productName: "KidEase Featured city",
    description: "Extra city highlight on search.",
    amountCad: 29,
    kind: "recurring",
    interval: "month",
    required: false,
  },
  {
    key: "claim_boost",
    lookupKey: "kidease_claim_boost",
    productName: "KidEase Claim boost",
    description: "One-time bump when you claim a listing.",
    amountCad: 99,
    kind: "one_time",
    required: false,
  },
  {
    key: "job_post",
    lookupKey: "kidease_job_post",
    productName: "KidEase Job post",
    description: "Post one staff opening.",
    amountCad: 49,
    kind: "one_time",
    required: false,
  },
];

export function envPriceId(key: StripePriceKey, env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env[STRIPE_PRICE_ENV[key]];
  const id = String(raw || "").trim();
  return id.startsWith("price_") ? id : null;
}

export function envPaymentLink(addon: keyof typeof STRIPE_PAYMENT_LINK_ENV, env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env[STRIPE_PAYMENT_LINK_ENV[addon]];
  const url = String(raw || "").trim();
  return url.startsWith("https://") ? url : null;
}

export function catalogPriceReady(key: StripePriceKey, env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(envPriceId(key, env));
}

export function requiredCatalogMissing(env: NodeJS.ProcessEnv = process.env): StripePriceKey[] {
  return STRIPE_CATALOG.filter((item) => item.required && !envPriceId(item.key, env)).map((item) => item.key);
}

export function catalogStatus(env: NodeJS.ProcessEnv = process.env): Record<StripePriceKey, boolean> {
  const out = {} as Record<StripePriceKey, boolean>;
  for (const item of STRIPE_CATALOG) out[item.key] = catalogPriceReady(item.key, env);
  return out;
}

export function providerPriceKey(plan: "pro" | "network", interval: "month" | "year"): StripePriceKey | null {
  if (plan === "pro") return interval === "year" ? "pro_yearly" : "pro_monthly";
  if (plan === "network") return interval === "month" ? "network_monthly" : null;
  return null;
}

export function plusPriceKey(interval: "month" | "year"): StripePriceKey {
  return interval === "year" ? "plus_yearly" : "plus_monthly";
}

export function addonPriceKey(addon: "featured_city" | "claim_boost" | "job_post"): StripePriceKey {
  return addon;
}

export function addonCheckoutMode(addon: "featured_city" | "claim_boost" | "job_post"): "subscription" | "payment" {
  return addon === "featured_city" ? "subscription" : "payment";
}

export function amountToCents(amountCad: number): number {
  return Math.round(amountCad * 100);
}

/** Mask a secret so logs never print sk_live_ / sk_test_ in full. */
export function maskStripeSecret(secret: string | null | undefined): string {
  const key = String(secret || "").trim();
  if (!key) return "(unset)";
  if (key.startsWith("sk_live_")) return "sk_live_…(redacted)";
  if (key.startsWith("sk_test_")) return "sk_test_…(redacted)";
  if (key.startsWith("rk_")) return "rk_…(redacted)";
  return "(set, redacted)";
}
