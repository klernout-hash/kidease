/**
 * KidEase daycare SaaS packages (CAD). Not parent family payments.
 * Checkout runs only when stripeChargesLive() and the matching STRIPE_PRICE_* env is set.
 */

import { DAYCARE_ADDONS, daycareUpgradePlan, paidPlanPrice, type PlanLine } from "./upgrade-plans.ts";

export const PROVIDER_PLAN_IDS = ["free", "pro", "network"] as const;
export type ProviderPlanId = (typeof PROVIDER_PLAN_IDS)[number];

export const PROVIDER_INTERVALS = ["month", "year"] as const;
export type ProviderInterval = (typeof PROVIDER_INTERVALS)[number];

export const PROVIDER_ADDON_IDS = ["featured_city", "claim_boost", "job_post"] as const;
export type ProviderAddonId = (typeof PROVIDER_ADDON_IDS)[number];

/** Code path is wired. Real charges still require sk_live_ + STRIPE_PRICE_* env. */
export const PROVIDER_CHECKOUT_LIVE = true;

export const PROVIDER_SUBSCRIPTION_GHOST_MESSAGE =
  "Admin preview — this is what centre directors will see. Providers without admin cannot open this tab.";

export const PROVIDER_CHECKOUT_STUB_MESSAGE =
  "Coming soon — checkout next. Subscribe saves the pick on this profile. No card is charged.";

export const PROVIDER_CHECKOUT_REHEARSAL_MESSAGE =
  "Card payments are not live yet. Subscribe saves the pick on this profile. No card is charged until Stripe live keys and price IDs are set.";

export const PROVIDER_CHECKOUT_LIVE_MESSAGE =
  "Live Stripe checkout. Subscribe opens Stripe. Manage billing in the customer portal after the first successful checkout.";

type LocaleText = PlanLine;

export type ProviderPlan = {
  id: ProviderPlanId;
  name: LocaleText;
  tagline: LocaleText;
  monthly: number;
  yearly: number | null;
  perSite: boolean;
  minSites: number;
  features: LocaleText[];
};

export type ProviderAddon = {
  id: ProviderAddonId;
  name: LocaleText;
  amount: number;
  cadence: "month" | "once";
  blurb: LocaleText;
};

export const PROVIDER_PLANS: ProviderPlan[] = [
  {
    id: "free",
    name: { en: "Free", fr: "Gratuit" },
    tagline: daycareUpgradePlan("free").pitch,
    monthly: 0,
    yearly: 0,
    perSite: false,
    minSites: 1,
    features: daycareUpgradePlan("free").benefits,
  },
  {
    id: "pro",
    name: { en: "Pro", fr: "Pro" },
    tagline: daycareUpgradePlan("pro").pitch,
    monthly: paidPlanPrice("pro")?.monthlyCad ?? 49,
    yearly: paidPlanPrice("pro")?.yearlyCad ?? 490,
    perSite: false,
    minSites: 1,
    features: daycareUpgradePlan("pro").benefits,
  },
  {
    id: "network",
    name: { en: "Network", fr: "Réseau" },
    tagline: daycareUpgradePlan("network").pitch,
    monthly: paidPlanPrice("network")?.monthlyCad ?? 39,
    yearly: paidPlanPrice("network")?.yearlyCad ?? 390,
    perSite: true,
    minSites: 3,
    features: daycareUpgradePlan("network").benefits,
  },
];

export const PROVIDER_ADDONS: ProviderAddon[] = DAYCARE_ADDONS.map((addon) => ({
  id: addon.id,
  name: addon.name,
  amount: addon.amountCad,
  cadence: addon.cadence,
  blurb: addon.benefit,
}));

export const PROVIDER_COMPARE: Array<{
  id: string;
  label: LocaleText;
  free: LocaleText;
  pro: LocaleText;
  network: LocaleText;
}> = [
  {
    id: "listing",
    label: { en: "Centre listing", fr: "Fiche du centre" },
    free: { en: "Yes", fr: "Oui" },
    pro: { en: "Yes", fr: "Oui" },
    network: { en: "Yes", fr: "Oui" },
  },
  {
    id: "vacancy",
    label: { en: "Basic vacancy", fr: "Places de base" },
    free: { en: "Yes", fr: "Oui" },
    pro: { en: "Yes", fr: "Oui" },
    network: { en: "Yes", fr: "Oui" },
  },
  {
    id: "messages",
    label: { en: "Messages & tours", fr: "Messages et visites" },
    free: { en: "10 / month", fr: "10 / mois" },
    pro: { en: "Unlimited", fr: "Illimité" },
    network: { en: "Unlimited", fr: "Illimité" },
  },
  {
    id: "inquiries",
    label: { en: "Inquiries", fr: "Demandes" },
    free: { en: "10 / month", fr: "10 / mois" },
    pro: { en: "Unlimited", fr: "Illimité" },
    network: { en: "Unlimited", fr: "Illimité" },
  },
  {
    id: "featured",
    label: { en: "Featured city", fr: "Ville en vedette" },
    free: { en: "—", fr: "—" },
    pro: { en: "Included", fr: "Incluse" },
    network: { en: "Add-on", fr: "Option" },
  },
  {
    id: "analytics",
    label: { en: "Analytics", fr: "Analytique" },
    free: { en: "7 days", fr: "7 jours" },
    pro: { en: "90 days", fr: "90 jours" },
    network: { en: "90 days + site totals", fr: "90 jours + totaux" },
  },
  {
    id: "sites",
    label: { en: "Sites", fr: "Sites" },
    free: { en: "1", fr: "1" },
    pro: { en: "1", fr: "1" },
    network: { en: "3+", fr: "3+" },
  },
];

export function isProviderPlanId(raw: string | null | undefined): raw is ProviderPlanId {
  return PROVIDER_PLAN_IDS.includes((raw || "") as ProviderPlanId);
}

export function isProviderInterval(raw: string | null | undefined): raw is ProviderInterval {
  return PROVIDER_INTERVALS.includes((raw || "") as ProviderInterval);
}

export function parseProviderAddons(raw: string | null | undefined): ProviderAddonId[] {
  const set = new Set(
    String(raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return PROVIDER_ADDON_IDS.filter((id) => set.has(id));
}

export function serializeProviderAddons(ids: readonly string[]): string {
  return PROVIDER_ADDON_IDS.filter((id) => ids.includes(id)).join(",");
}

export function withProviderAddon(
  raw: string | null | undefined,
  id: ProviderAddonId,
  on: boolean,
): string {
  const ids = parseProviderAddons(raw);
  const next = on ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((item) => item !== id);
  return serializeProviderAddons(next);
}

export function providerPlan(id: string | null | undefined): ProviderPlan {
  return PROVIDER_PLANS.find((p) => p.id === id) ?? PROVIDER_PLANS[0]!;
}

export function planPriceCad(plan: ProviderPlan, interval: ProviderInterval, siteCount = 1): number {
  const sites = Math.max(plan.minSites, siteCount, 1);
  if (plan.yearly != null && interval === "year" && !plan.perSite) return plan.yearly;
  const base = plan.monthly;
  return plan.perSite ? base * sites : base;
}

export function planPriceHint(plan: ProviderPlan, interval: ProviderInterval, locale: "en" | "fr"): string {
  if (plan.id === "free") return locale === "fr" ? "0 $ / mois" : "$0 / month";
  if (plan.perSite) {
    return locale === "fr" ? "39 $ / site / mois" : "$39 / site / month";
  }
  if (interval === "year" && plan.yearly != null) {
    return locale === "fr" ? "490 $ / an" : "$490 / year";
  }
  return locale === "fr" ? "49 $ / mois" : "$49 / month";
}
