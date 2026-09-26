/**
 * One copy source for Free / Plus and Free / Pro / Network.
 * Every benefit here is a gate or window that the code actually applies.
 * Do not add a line that is only a hope (enrolments, peace of mind, priority support).
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
