/**
 * Cancel, resume, and payment-failed grace for paid subscriptions.
 * One-time add-ons (Claim boost, Job post) are not subscriptions and are not cancelled here.
 * Benefits stay on through past_due. They end when Stripe deletes the subscription.
 */

import { DAYCARE_ADDONS, paidPlanPrice } from "./upgrade-plans.ts";

export type BillingLocale = "en" | "fr";

export type BillingProduct = "pro" | "network" | "plus" | "alerts" | "featured_city";

export type PriceLane = {
  lane: "provider_plan" | "parent_plus" | "featured_city";
  plan: string;
  interval: "month" | "year" | null;
};

const PRICE_LANES: Record<string, PriceLane> = {
  pro_monthly: { lane: "provider_plan", plan: "pro", interval: "month" },
  pro_yearly: { lane: "provider_plan", plan: "pro", interval: "year" },
  network_monthly: { lane: "provider_plan", plan: "network", interval: "month" },
  network_yearly: { lane: "provider_plan", plan: "network", interval: "year" },
  plus_monthly: { lane: "parent_plus", plan: "plus", interval: "month" },
  plus_yearly: { lane: "parent_plus", plan: "plus", interval: "year" },
  parent_alerts_monthly: { lane: "parent_plus", plan: "alerts", interval: "month" },
  parent_alerts_yearly: { lane: "parent_plus", plan: "alerts", interval: "year" },
  featured_city: { lane: "featured_city", plan: "featured_city", interval: "month" },
};

/** Active, trialing, and past_due (Stripe retry grace). Canceled and unpaid are off. */
export function subscriptionAccessOpen(status: string | null | undefined): boolean {
  const value = String(status || "")
    .trim()
    .toLowerCase();
  return value === "active" || value === "trialing" || value === "past_due";
}

export function checkoutBlockedByLiveSubscription(status: string | null | undefined): boolean {
  return subscriptionAccessOpen(status);
}

export const ALREADY_BILLED =
  "This subscription is already billed. Use Manage or cancel to switch or end it. Nothing was charged.";

export const PAYMENT_FAILED_NOTICE = {
  en: "A payment didn’t go through. Your benefits stay on while Stripe retries. Update the card in Manage or cancel.",
  fr: "Un paiement n’est pas passé. Vos avantages restent actifs pendant que Stripe réessaie. Mettez la carte à jour dans Gérer ou annuler.",
} as const;

export function unixToIso(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

export function formatBillingDate(iso: string, locale: BillingLocale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "long",
    timeZone: "America/Toronto",
  }).format(date);
}

export function billingStatusLine(input: {
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
  locale: BillingLocale;
}): string {
  const date = input.periodEnd ? formatBillingDate(input.periodEnd, input.locale) : "";
  if (input.cancelAtPeriodEnd) {
    if (date) return input.locale === "fr" ? `Annulation le ${date}` : `Cancels on ${date}`;
    return input.locale === "fr"
      ? "Annulation à la fin de la période en cours."
      : "Cancels at the end of the current period.";
  }
  if (date) return input.locale === "fr" ? `Renouvellement le ${date}` : `Renews on ${date}`;
  return input.locale === "fr"
    ? "Renouvellement à la fin de la période en cours."
    : "Renews at the end of the current period.";
}

function money(amount: number, locale: BillingLocale): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  const formatted = new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
  return formatted;
}

export function billingPriceLabel(input: {
  product: BillingProduct;
  interval: "month" | "year";
  locale: BillingLocale;
}): string {
  if (input.product === "featured_city") {
    const amount = DAYCARE_ADDONS.find((addon) => addon.id === "featured_city")?.amountCad ?? 29;
    const value = money(amount, input.locale);
    return input.locale === "fr" ? `${value} / mois` : `${value}/month`;
  }
  const price = paidPlanPrice(input.product);
  const monthly = price?.monthlyCad ?? 0;
  const yearly = price?.yearlyCad ?? 0;
  const amount = input.interval === "year" ? yearly : monthly;
  const value = money(amount, input.locale);
  if (input.product === "network") {
    if (input.interval === "year") return input.locale === "fr" ? `${value} / site / an` : `${value}/site/year`;
    return input.locale === "fr" ? `${value} / site / mois` : `${value}/site/month`;
  }
  if (input.interval === "year") return input.locale === "fr" ? `${value} / an` : `${value}/year`;
  return input.locale === "fr" ? `${value} / mois` : `${value}/month`;
}

const PRODUCT_NAME: Record<BillingProduct, { en: string; fr: string }> = {
  pro: { en: "Pro", fr: "Pro" },
  network: { en: "Network", fr: "Réseau" },
  plus: { en: "Parent Plus", fr: "Parent Plus" },
  alerts: { en: "Parent Alerts", fr: "Alertes parents" },
  featured_city: { en: "Featured city", fr: "Ville en vedette" },
};

export function billingProductName(product: BillingProduct, locale: BillingLocale): string {
  return PRODUCT_NAME[product][locale];
}

/** Calm end-of-period copy. Not a purchase celebration. */
export function cancelEndCopy(input: {
  product: BillingProduct;
  endsAtIso: string | null;
  locale: BillingLocale;
}): { title: string; body: string } {
  const date = input.endsAtIso ? formatBillingDate(input.endsAtIso, input.locale) : "";
  const name = billingProductName(input.product, input.locale);
  if (input.product === "featured_city") {
    return input.locale === "fr"
      ? {
          title: date ? `Ville en vedette se termine le ${date}.` : "Ville en vedette se termine à la fin de la période.",
          body: "La mise en avant s’arrête alors. Le forfait du centre ne change pas.",
        }
      : {
          title: date ? `Featured city will end on ${date}.` : "Featured city will end at the period end.",
          body: "The search pin turns off then. Your centre plan is unchanged.",
        };
  }
  if (input.locale === "fr") {
    return {
      title: date ? `Votre forfait ${name} se termine le ${date}.` : `Votre forfait ${name} se termine à la fin de la période.`,
      body: "Vous resterez sur Gratuit.",
    };
  }
  return {
    title: date ? `Your ${name} plan will end on ${date}.` : `Your ${name} plan will end at the period end.`,
    body: "You'll stay on Free.",
  };
}

export function priceLaneForId(
  priceId: string | null | undefined,
  envIds: Partial<Record<string, string | null | undefined>>,
): PriceLane | null {
  const id = String(priceId || "").trim();
  if (!id) return null;
  for (const [key, value] of Object.entries(envIds)) {
    if (value && value === id && PRICE_LANES[key]) return PRICE_LANES[key];
  }
  return null;
}

function metadataLane(metadata: Record<string, string>): string | null {
  if (metadata.kidease === "addon" && metadata.addon === "featured_city") return "featured_city";
  if (metadata.kidease === "parent_plus") return "parent_plus";
  if (metadata.kidease === "provider_sub" || metadata.kidease === "catalog") {
    if (metadata.plan === "plus" || metadata.plan === "alerts") return "parent_plus";
    return "provider_plan";
  }
  if (metadata.plan === "pro" || metadata.plan === "network") return "provider_plan";
  if (metadata.plan === "plus" || metadata.plan === "alerts") return "parent_plus";
  return null;
}

/** Same subscription, new price. A price from another lane is ignored so lanes do not cross. */
export function mergePriceLane(input: {
  metadata: Record<string, string>;
  matchedLane: string | null;
  priceLane: PriceLane | null;
}): Record<string, string> {
  const price = input.priceLane;
  if (!price) return input.metadata;
  const lane = metadataLane(input.metadata) || input.matchedLane;
  if (lane !== price.lane) return input.metadata;
  return {
    ...input.metadata,
    plan: price.plan,
    ...(price.interval ? { interval: price.interval } : {}),
  };
}

/**
 * Live Customer Portal settings for Kyle. Two configurations so a parent
 * cannot switch onto a daycare price, and Featured city is not swapped with Pro.
 */
export const STRIPE_PORTAL_LIVE_SETTINGS = [
  "Cancellation: allowed, at period end (not immediately). Prorate nothing on cancel. Keep the subscription until current_period_end.",
  "Payment method update: allowed, so a failed payment can be retried from Manage or cancel.",
  "Parent configuration (STRIPE_BILLING_PORTAL_PARENT): products Parent Plus and Parent Alerts only, monthly and yearly prices in one switch group. Switching updates the existing subscription (proration on), so a second subscription is not created.",
  "Daycare configuration (STRIPE_BILLING_PORTAL_DAYCARE): products Pro, Network, and Featured city. Pro and Network monthly and yearly prices are one switch group. Network quantity is per site, minimum 3. Featured city is its own subscription: cancellation at period end, not in the Pro/Network switch group.",
  "Do not put parent products and daycare products in the same portal configuration.",
  "One-time prices (Claim boost, Job post) are not in the portal. They are not cancelled.",
].join("\n");
