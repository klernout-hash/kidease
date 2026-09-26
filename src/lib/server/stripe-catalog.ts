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
 * Proposals (hidden until the env price ID is set; Check prices will not create them):
 *   STRIPE_PRICE_NETWORK_YEARLY          year, $390 CAD per site
 *   STRIPE_PRICE_PARENT_ALERTS_MONTHLY   month, $14.99 CAD
 *   STRIPE_PRICE_PARENT_ALERTS_YEARLY    year, $149 CAD
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

import { daycareAddon } from "../upgrade-plans.ts";

export const STRIPE_PRICE_ENV = {
  pro_monthly: "STRIPE_PRICE_PRO_MONTHLY",
  pro_yearly: "STRIPE_PRICE_PRO_YEARLY",
  network_monthly: "STRIPE_PRICE_NETWORK_MONTHLY",
  network_yearly: "STRIPE_PRICE_NETWORK_YEARLY",
  plus_monthly: "STRIPE_PRICE_PLUS_MONTHLY",
  plus_yearly: "STRIPE_PRICE_PLUS_YEARLY",
  parent_alerts_monthly: "STRIPE_PRICE_PARENT_ALERTS_MONTHLY",
  parent_alerts_yearly: "STRIPE_PRICE_PARENT_ALERTS_YEARLY",
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
  /** Kyle has not approved this price. Catalog bootstrap must not create it. */
  proposal?: boolean;
};

/** CAD one-pager — amounts only, never secret keys. */
export const STRIPE_CATALOG: StripeCatalogItem[] = [
  {
    key: "pro_monthly",
    lookupKey: "kidease_pro_monthly",
    productName: "KidEase Daycare Pro",
    description: "Unlimited messages and tours, one featured city in search, 90 days of views and requests.",
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
    key: "network_yearly",
    lookupKey: "kidease_network_yearly",
    productName: "KidEase Network",
    description: "Proposal: $390 per licensed site / year. Same 3-site minimum as monthly. Not created until Kyle approves.",
    amountCad: 390,
    kind: "recurring",
    interval: "year",
    required: false,
    proposal: true,
  },
  {
    key: "plus_monthly",
    lookupKey: "kidease_plus_monthly",
    productName: "KidEase Parent Plus",
    description: "Parent ↔ centre video tour, when video is on. Search, messages, and alerts stay free.",
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
    key: "parent_alerts_monthly",
    lookupKey: "kidease_parent_alerts_monthly",
    productName: "KidEase Parent Alerts",
    description:
      "Proposal: SMS and push on top of the Parent Plus video tour, when those channels are on. Email stays free.",
    amountCad: 14.99,
    kind: "recurring",
    interval: "month",
    required: false,
    proposal: true,
  },
  {
    key: "parent_alerts_yearly",
    lookupKey: "kidease_parent_alerts_yearly",
    productName: "KidEase Parent Alerts",
    description: "Proposal: Parent Alerts billed yearly. Hidden until Kyle sets the price ID.",
    amountCad: 149,
    kind: "recurring",
    interval: "year",
    required: false,
    proposal: true,
  },
  {
    key: "featured_city",
    lookupKey: "kidease_featured_city",
    productName: "KidEase Featured city",
    description: daycareAddon("featured_city").benefit.en,
    amountCad: daycareAddon("featured_city").amountCad,
    kind: "recurring",
    interval: "month",
    required: false,
  },
  {
    key: "claim_boost",
    lookupKey: "kidease_claim_boost",
    productName: "KidEase Claim boost",
    description: daycareAddon("claim_boost").benefit.en,
    amountCad: daycareAddon("claim_boost").amountCad,
    kind: "one_time",
    required: false,
  },
  {
    key: "job_post",
    lookupKey: "kidease_job_post",
    productName: "KidEase Job post",
    description: daycareAddon("job_post").benefit.en,
    amountCad: daycareAddon("job_post").amountCad,
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
  if (plan === "network") return interval === "year" ? "network_yearly" : "network_monthly";
  return null;
}

export function plusPriceKey(interval: "month" | "year"): StripePriceKey {
  return interval === "year" ? "plus_yearly" : "plus_monthly";
}

export function parentPriceKey(plan: "plus" | "alerts", interval: "month" | "year"): StripePriceKey {
  if (plan === "alerts") return interval === "year" ? "parent_alerts_yearly" : "parent_alerts_monthly";
  return plusPriceKey(interval);
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
