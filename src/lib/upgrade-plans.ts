/**
 * One copy source for each role: Free plus two paid upgrades.
 * Every benefit is a gate the code actually applies.
 * Parent Alerts stays hidden until both of its Stripe price env vars are set.
 * Network yearly ($390/site) is a proposal until STRIPE_PRICE_NETWORK_YEARLY is set.
 */

export type PlanLocale = "en" | "fr";

export type PlanLine = { en: string; fr: string };

export type UpgradePlanCopy = {
  id: string;
  role: "parent" | "daycare";
  recommended: boolean;
  name: PlanLine;
  /** Shown under the price. Free uses this as the usable-plan line. */
  pitch: PlanLine;
  benefits: PlanLine[];
};

export type PaidPlanId = "plus" | "alerts" | "pro" | "network";

export type PaidPlanPrice = {
  id: PaidPlanId;
  monthlyCad: number;
  yearlyCad: number;
  /** Hide the whole tier until both monthly and yearly Stripe price env vars are set. */
  hideUntilBothPrices: boolean;
  /** Yearly amount is a proposal. Checkout stays off until that env var is set. */
  yearlyProposal: boolean;
};

/**
 * Amounts kept in sync with STRIPE_CATALOG. Percentages are computed, never typed in by hand.
 * Parent Alerts ($14.99 / $149) and Network yearly ($390/site) are proposals for Kyle.
 */
export const PAID_PLAN_PRICES: PaidPlanPrice[] = [
  { id: "plus", monthlyCad: 7.99, yearlyCad: 59, hideUntilBothPrices: false, yearlyProposal: false },
  { id: "alerts", monthlyCad: 14.99, yearlyCad: 149, hideUntilBothPrices: true, yearlyProposal: true },
  { id: "pro", monthlyCad: 49, yearlyCad: 490, hideUntilBothPrices: false, yearlyProposal: false },
  { id: "network", monthlyCad: 39, yearlyCad: 390, hideUntilBothPrices: false, yearlyProposal: true },
];

/** Catalog keys. Client-safe strings; the server maps them to STRIPE_PRICE_* env names. */
export const PAID_PLAN_PRICE_KEYS: Record<PaidPlanId, { month: string; year: string }> = {
  plus: { month: "plus_monthly", year: "plus_yearly" },
  alerts: { month: "parent_alerts_monthly", year: "parent_alerts_yearly" },
  pro: { month: "pro_monthly", year: "pro_yearly" },
  network: { month: "network_monthly", year: "network_yearly" },
};

export function paidPlanPrice(id: string): PaidPlanPrice | null {
  return PAID_PLAN_PRICES.find((plan) => plan.id === id) ?? null;
}

export type DaycareAddonId = "featured_city" | "claim_boost" | "job_post";

export type DaycareAddon = {
  id: DaycareAddonId;
  name: PlanLine;
  /** Catalog amount in CAD. Checkout refuses a Stripe price that does not match. */
  amountCad: number;
  cadence: "month" | "once";
  benefit: PlanLine;
};

/**
 * Daycare-only add-ons, in addition to Free / Pro / Network.
 * Amounts live here and in the Stripe catalog together. Kyle can change the
 * Stripe price later; checkout stays off until the catalog amount matches.
 */
export const DAYCARE_ADDONS: DaycareAddon[] = [
  {
    id: "featured_city",
    name: { en: "Featured city", fr: "Ville en vedette" },
    amountCad: 29,
    cadence: "month",
    benefit: {
      en: "Pins this centre in search while this add-on is active. Pro already includes that pin.",
      fr: "Met ce centre en avant dans la recherche tant que l’option est active. Pro inclut déjà cette mise en avant.",
    },
  },
  {
    id: "claim_boost",
    name: { en: "Claim boost", fr: "Boost de réclamation" },
    amountCad: 99,
    cadence: "once",
    benefit: {
      en: "Moves this centre ahead in search for 30 days after you claim it.",
      fr: "Place ce centre devant dans la recherche pendant 30 jours après la réclamation.",
    },
  },
  {
    id: "job_post",
    name: { en: "Job post", fr: "Offre d’emploi" },
    amountCad: 49,
    cadence: "once",
    benefit: {
      en: "Adds one credit to post a staff opening on this centre page.",
      fr: "Ajoute un crédit pour afficher une offre de personnel sur la page de ce centre.",
    },
  },
];

export function daycareAddon(id: string): DaycareAddon {
  return DAYCARE_ADDONS.find((addon) => addon.id === id) ?? DAYCARE_ADDONS[0]!;
}

export function daycareAddonVisible(id: string, flags: Partial<Record<string, boolean>> | null | undefined): boolean {
  return Boolean(flags?.[id]);
}

export const RECOMMENDED_LABEL: PlanLine = { en: "Recommended", fr: "Recommandé" };

const PARENT_FREE_PITCH: PlanLine = {
  en: "Free forever. Everything you need to find and connect",
  fr: "Gratuit pour toujours. Tout ce qu’il faut pour chercher et écrire",
};

const PARENT_PLUS_PITCH: PlanLine = {
  en: "Plus only gates a parent ↔ centre video tour. Search, messages, and alerts stay free without it.",
  fr: "Plus ne débloque que la visite vidéo parent ↔ centre. La recherche, les messages et les alertes restent gratuits.",
};

const DAYCARE_FREE_PITCH: PlanLine = {
  en: "Free forever. Listing, vacancy, claim, and messages stay open.",
  fr: "Gratuit pour toujours. La fiche, les places, la réclamation et les messages restent ouverts.",
};

const PRO_PITCH: PlanLine = {
  en: "Pro lifts the monthly cap, includes one featured city in search, and keeps 90 days of stats.",
  fr: "Pro enlève le plafond mensuel, inclut une ville en vedette dans la recherche et garde 90 jours de stats.",
};

const NETWORK_PITCH: PlanLine = {
  en: "Network is the multi-site plan: the same Pro tools, plus totals across 3 or more sites. Featured city stays an add-on.",
  fr: "Réseau est le forfait multi-sites : les mêmes outils Pro, plus les totaux pour 3 sites ou plus. La ville en vedette reste une option.",
};

const PARENT_ALERTS_PITCH: PlanLine = {
  en: "Adds SMS and push on top of Parent Plus. Email alerts stay free. SMS and push send only when those channels are on.",
  fr: "Ajoute les SMS et le push en plus de Plus parents. Les alertes courriel restent gratuites. SMS et push partent seulement quand ces canaux sont activés.",
};

export const PARENT_UPGRADE_PLANS: UpgradePlanCopy[] = [
  {
    id: "free",
    role: "parent",
    recommended: false,
    name: { en: "Free", fr: "Gratuit" },
    pitch: PARENT_FREE_PITCH,
    benefits: [
      { en: "Search centres in Canada", fr: "Chercher des centres au Canada" },
      { en: "Messages with a centre", fr: "Messages avec un centre" },
      { en: "Saved-search alerts", fr: "Alertes de recherche enregistrée" },
    ],
  },
  {
    id: "plus",
    role: "parent",
    recommended: true,
    name: { en: "Parent Plus", fr: "Plus parents" },
    pitch: PARENT_PLUS_PITCH,
    benefits: [
      {
        en: "Parent ↔ centre video tour, when video is on",
        fr: "Visite vidéo parent ↔ centre, quand la vidéo est activée",
      },
    ],
  },
  {
    id: "alerts",
    role: "parent",
    recommended: false,
    name: { en: "Parent Alerts", fr: "Alertes parents" },
    pitch: PARENT_ALERTS_PITCH,
    benefits: [
      {
        en: "Parent ↔ centre video tour, when video is on",
        fr: "Visite vidéo parent ↔ centre, quand la vidéo est activée",
      },
      {
        en: "SMS for saved-search alerts, when SMS is on",
        fr: "SMS pour les alertes de recherche, quand les SMS sont activés",
      },
      {
        en: "Push for saved-search alerts, when push is on",
        fr: "Notifications push pour les alertes de recherche, quand le push est activé",
      },
    ],
  },
];

export const DAYCARE_UPGRADE_PLANS: UpgradePlanCopy[] = [
  {
    id: "free",
    role: "daycare",
    recommended: false,
    name: { en: "Free", fr: "Gratuit" },
    pitch: DAYCARE_FREE_PITCH,
    benefits: [
      { en: "Centre listing", fr: "Fiche du centre" },
      { en: "Vacancy updates", fr: "Mise à jour des places" },
      { en: "10 messages and tours a month", fr: "10 messages et visites par mois" },
      { en: "7 days of views and requests", fr: "7 jours de vues et de demandes" },
    ],
  },
  {
    id: "pro",
    role: "daycare",
    recommended: true,
    name: { en: "Pro", fr: "Pro" },
    pitch: PRO_PITCH,
    benefits: [
      { en: "Unlimited messages and tours", fr: "Messages et visites illimités" },
      { en: "One featured city in search", fr: "Une ville en vedette dans la recherche" },
      { en: "90 days of views and requests", fr: "90 jours de vues et de demandes" },
    ],
  },
  {
    id: "network",
    role: "daycare",
    recommended: false,
    name: { en: "Network", fr: "Réseau" },
    pitch: NETWORK_PITCH,
    benefits: [
      { en: "Unlimited messages and tours", fr: "Messages et visites illimités" },
      { en: "90 days of views and requests", fr: "90 jours de vues et de demandes" },
      { en: "Totals across your sites", fr: "Totaux pour tous vos sites" },
    ],
  },
];

export function parentUpgradePlan(id: string): UpgradePlanCopy {
  return PARENT_UPGRADE_PLANS.find((plan) => plan.id === id) ?? PARENT_UPGRADE_PLANS[0]!;
}

export function daycareUpgradePlan(id: string): UpgradePlanCopy {
  return DAYCARE_UPGRADE_PLANS.find((plan) => plan.id === id) ?? DAYCARE_UPGRADE_PLANS[0]!;
}

/** Positive dollars saved by paying yearly instead of twelve months. */
export function yearlySavingsCad(monthly: number, yearly: number | null | undefined): number | null {
  if (yearly == null) return null;
  const save = Math.round((monthly * 12 - yearly) * 100) / 100;
  return save > 0 ? save : null;
}

function cents(amountCad: number): number {
  return Math.round(amountCad * 100);
}

/**
 * Floor of (monthly × 12 − yearly) / (monthly × 12), as a percent.
 * Rounded down so the saving is never overstated. Null when yearly is not cheaper.
 */
export function yearlySavingsPercentFromCents(monthlyCents: number, yearlyCents: number): number | null {
  if (!Number.isFinite(monthlyCents) || !Number.isFinite(yearlyCents)) return null;
  const full = monthlyCents * 12;
  if (full <= 0 || yearlyCents >= full) return null;
  return Math.floor(((full - yearlyCents) * 100) / full);
}

export function yearlySavingsPercent(monthlyCad: number, yearlyCad: number | null | undefined): number | null {
  if (yearlyCad == null) return null;
  return yearlySavingsPercentFromCents(cents(monthlyCad), cents(yearlyCad));
}

/** One pill for the yearly side of a toggle. A range uses each plan's floored percent. */
export function yearlySavingsToggleLabel(percents: Array<number | null | undefined>, locale: PlanLocale): string | null {
  const unique = [...new Set(percents.filter((n): n is number => typeof n === "number" && n > 0))].sort((a, b) => a - b);
  if (!unique.length) return null;
  if (locale === "fr") {
    const span = unique.length === 1 ? `${unique[0]} %` : `${unique[0]}–${unique[unique.length - 1]} %`;
    return `Économisez ${span}`;
  }
  const span = unique.length === 1 ? `${unique[0]}%` : `${unique[0]}–${unique[unique.length - 1]}%`;
  return `Save ${span}`;
}

export function paidPlanVisible(
  id: string,
  interval: "month" | "year",
  flags: Partial<Record<string, boolean>> | null | undefined,
): boolean {
  if (id === "free") return true;
  const price = paidPlanPrice(id);
  const keys = PAID_PLAN_PRICE_KEYS[id as PaidPlanId];
  if (!price || !keys) return false;
  const ready = flags ?? {};
  if (price.hideUntilBothPrices) return Boolean(ready[keys.month] && ready[keys.year]);
  return Boolean(ready[keys[interval]]);
}

export function visibleYearlySavings(
  ids: string[],
  flags: Partial<Record<string, boolean>> | null | undefined,
): number[] {
  const out: number[] = [];
  for (const id of ids) {
    if (!paidPlanVisible(id, "year", flags)) continue;
    const price = paidPlanPrice(id);
    if (!price) continue;
    const percent = yearlySavingsPercent(price.monthlyCad, price.yearlyCad);
    if (percent != null) out.push(percent);
  }
  return out;
}

export function checkoutCtaLabel(input: {
  planName: string;
  interval: "month" | "year";
  monthly: number;
  yearly: number | null | undefined;
  locale: PlanLocale;
}): string {
  if (input.interval !== "year") {
    return input.locale === "fr" ? `Choisir ${input.planName}` : `Choose ${input.planName}`;
  }
  const percent = yearlySavingsPercent(input.monthly, input.yearly);
  if (percent == null) {
    return input.locale === "fr" ? `Choisir ${input.planName} à l’année` : `Choose ${input.planName} yearly`;
  }
  return input.locale === "fr"
    ? `Choisir ${input.planName} à l’année · économisez ${percent} %`
    : `Choose ${input.planName} yearly · save ${percent}%`;
}

export function yearlySavingSuccess(name: string, percent: number, locale: PlanLocale): string {
  return locale === "fr"
    ? `Vous êtes sur ${name} à l’année et vous économisez ${percent} %`
    : `You're on ${name} yearly and saving ${percent}%`;
}

/** Up to three benefit lines from the shared plan or add-on definition. */
export function upgradeUnlockedBenefits(input: {
  kind: "plan" | "addon" | "plus";
  item?: string | null;
  locale: PlanLocale;
}): string[] {
  const locale = input.locale === "fr" ? "fr" : "en";
  const item = String(input.item || "").trim();
  if (input.kind === "addon") {
    if (item !== "featured_city" && item !== "claim_boost" && item !== "job_post") return [];
    return [daycareAddon(item).benefit[locale]];
  }
  const lines =
    input.kind === "plus"
      ? parentUpgradePlan(item === "alerts" ? "alerts" : "plus").benefits
      : daycareUpgradePlan(item === "network" ? "network" : "pro").benefits;
  return lines.slice(0, 3).map((line) => line[locale]);
}

export function formatPlanCad(amount: number, locale: PlanLocale): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function yearlySavingsLine(monthly: number, yearly: number | null | undefined, locale: PlanLocale): string | null {
  const save = yearlySavingsCad(monthly, yearly);
  if (save == null || yearly == null) return null;
  const year = formatPlanCad(yearly, locale);
  const saved = formatPlanCad(save, locale);
  return locale === "fr" ? `ou ${year} / an · économisez ${saved}` : `or ${year} / year · save ${saved}`;
}
