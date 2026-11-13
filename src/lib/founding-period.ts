/**
 * Current free-tool copy and the public badge rule.
 * Paid prices stay in upgrade-plans.ts and are not shown while subscriptions are off.
 */

/** Leave this listing's row alone. Do not backfill or badge it. */
export const PROTECTED_LISTING_ID = "d_d85jtifbkh2t";

export type FoundingLocale = "en" | "fr";

export const FOUNDING_FREE_FEATURES: Array<{ en: string; fr: string }> = [
  { en: "Claimed listing", fr: "Fiche revendiquée" },
  { en: "Photos", fr: "Photos" },
  { en: "Fees you set", fr: "Les frais que vous indiquez" },
  { en: "Open-spot posting", fr: "Annonce de places ouvertes" },
  { en: "Basic waitlist, when your centre uses one", fr: "Liste d’attente de base, si votre centre en a une" },
  { en: "Messages, tours, and desk tools", fr: "Messages, visites et outils du bureau" },
];

export const FOUNDING_PAGE = {
  en: {
    kicker: "KidEase",
    title: "Tools for daycares",
    lead: "KidEase is a Canadian company that helps parents find licensed daycare. Parents can search, save up to five centres, and message daycares at no charge. Daycares can use every daycare tool without a subscription.",
    parentsTitle: "For parents",
    parentsBody: "Search licensed centres, save up to five favourites, and message daycares. No charge.",
    parentsCta: "Search daycares",
    daycareTitle: "For daycares",
    daycareName: "Free",
    daycarePill: "Free listing tools",
    daycareBody: "Claim your listing and use the daycare tools at no subscription charge. Centre bill payments are separate.",
    foundingTitle: "Your daycare tools",
    foundingBody:
      "KidEase subscriptions are unavailable. You can use all daycare tools without a subscription.",
    claim: "Claim your listing",
    priceUnit: "/month",
  },
  fr: {
    kicker: "KidEase",
    title: "Outils pour les garderies",
    lead: "KidEase est une entreprise canadienne qui aide les parents à trouver une garderie permise. Les parents cherchent, enregistrent jusqu’à cinq centres et écrivent aux garderies, sans frais. Les garderies peuvent utiliser tous les outils sans abonnement.",
    parentsTitle: "Pour les parents",
    parentsBody: "Recherche, favoris (5 centres) et messages aux garderies, sans frais.",
    parentsCta: "Chercher une garderie",
    daycareTitle: "Pour les garderies",
    daycareName: "Gratuit",
    daycarePill: "Outils de fiche gratuits",
    daycareBody: "Revendiquez votre fiche et utilisez les outils sans frais d’abonnement. Les paiements des factures du centre sont séparés.",
    foundingTitle: "Vos outils de garderie",
    foundingBody:
      "Les abonnements KidEase sont indisponibles. Vous pouvez utiliser tous les outils de garderie sans abonnement.",
    claim: "Revendiquer votre fiche",
    priceUnit: "/mois",
  },
} as const;

export function foundingLocale(locale: string | null | undefined): FoundingLocale {
  return locale === "fr" ? "fr" : "en";
}

/** Badge only. The database marker is separate and is not cleared here. */
export function foundingMemberVisible(input: {
  id?: string | null;
  foundingMember?: boolean | number | null;
  badgeEnabled: boolean;
}): boolean {
  if (!input.badgeEnabled) return false;
  if ((input.id || "") === PROTECTED_LISTING_ID) return false;
  return input.foundingMember === true || input.foundingMember === 1;
}
