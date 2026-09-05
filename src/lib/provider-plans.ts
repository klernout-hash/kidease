/**
 * KidEase daycare SaaS packages (CAD). Not parent family payments.
 * Checkout runs only when stripeChargesLive() and the matching STRIPE_PRICE_* env is set.
 */

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
  "Internal ledger only. Subscribe saves the pick on this profile. No card is charged until Stripe live keys and price IDs are set.";

export const PROVIDER_CHECKOUT_LIVE_MESSAGE =
  "Live Stripe checkout. Subscribe opens Stripe. Manage billing in the customer portal after the first successful checkout.";

type LocaleText = { en: string; fr: string };

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
    tagline: { en: "Get listed and take a few inquiries.", fr: "Soyez listé et recevez quelques demandes." },
    monthly: 0,
    yearly: 0,
    perSite: false,
    minSites: 1,
    features: [
      { en: "Centre listing on KidEase", fr: "Fiche du centre sur KidEase" },
      { en: "Basic vacancy updates", fr: "Mise à jour simple des places" },
      { en: "10 messages and tours / month", fr: "10 messages et visites / mois" },
    ],
  },
  {
    id: "pro",
    name: { en: "Pro", fr: "Pro" },
    tagline: { en: "Unlimited inquiries and a featured city.", fr: "Demandes illimitées et une ville en vedette." },
    monthly: 49,
    yearly: 490,
    perSite: false,
    minSites: 1,
    features: [
      { en: "Unlimited inquiries", fr: "Demandes illimitées" },
      { en: "1 featured city included", fr: "1 ville en vedette incluse" },
      { en: "90-day analytics", fr: "Analytique sur 90 jours" },
    ],
  },
  {
    id: "network",
    name: { en: "Network", fr: "Réseau" },
    tagline: { en: "Org dashboard for 3 or more sites.", fr: "Tableau de bord pour 3 sites ou plus." },
    monthly: 39,
    yearly: null,
    perSite: true,
    minSites: 3,
    features: [
      { en: "$39 per site / month", fr: "39 $ par site / mois" },
      { en: "Organization dashboard", fr: "Tableau de bord de l’organisme" },
      { en: "Built for 3+ licensed sites", fr: "Pour 3 sites permis ou plus" },
    ],
  },
];

export const PROVIDER_ADDONS: ProviderAddon[] = [
  {
    id: "featured_city",
    name: { en: "Featured city", fr: "Ville en vedette" },
    amount: 29,
    cadence: "month",
    blurb: { en: "Extra city highlight on search.", fr: "Mise en avant dans une ville de plus." },
  },
  {
    id: "claim_boost",
    name: { en: "Claim boost", fr: "Boost de réclamation" },
    amount: 99,
    cadence: "once",
    blurb: { en: "One-time bump when you claim a listing.", fr: "Coup de pouce unique à la réclamation." },
  },
  {
    id: "job_post",
    name: { en: "Job post", fr: "Offre d’emploi" },
    amount: 49,
    cadence: "once",
    blurb: { en: "Post one staff opening.", fr: "Publier une offre de personnel." },
  },
];

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
    free: { en: "Limited", fr: "Limité" },
    pro: { en: "Unlimited", fr: "Illimité" },
    network: { en: "Unlimited", fr: "Illimité" },
  },
  {
    id: "featured",
    label: { en: "Featured city", fr: "Ville en vedette" },
    free: { en: "—", fr: "—" },
    pro: { en: "1 included", fr: "1 incluse" },
    network: { en: "Add-on", fr: "Option" },
  },
  {
    id: "analytics",
    label: { en: "Analytics", fr: "Analytique" },
    free: { en: "—", fr: "—" },
    pro: { en: "90 days", fr: "90 jours" },
    network: { en: "Org dashboard", fr: "Tableau org." },
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
