/**
 * Free founding period copy and the public badge rule.
 * No end date and no discount percent. Kyle sets those later.
 * Paid prices stay in upgrade-plans.ts and are not shown while subscriptions are off.
 */

/** Leave this listing's row alone. Do not backfill or badge it. */
export const PROTECTED_LISTING_ID = "d_d85jtifbkh2t";

export type FoundingLocale = "en" | "fr";

export const FOUNDING_FREE_FEATURES: Array<{ en: string; fr: string }> = [
  { en: "Claimed listing", fr: "Fiche réclamée" },
  { en: "Photos", fr: "Photos" },
  { en: "Fees you set", fr: "Les frais que vous indiquez" },
  { en: "Open-spot posting", fr: "Annonce de places ouvertes" },
  { en: "Basic waitlist, when your centre uses one", fr: "Liste d’attente de base, si votre centre en a une" },
  { en: "Messages, tours, and desk tools", fr: "Messages, visites et outils du bureau" },
];

export const FOUNDING_PAGE = {
  en: {
    kicker: "KidEase",
    title: "Plans for daycares",
    lead: "KidEase is a Canadian company that helps parents find licensed daycare. Parents always use KidEase for free. Daycares get every tool free during launch.",
    parentsTitle: "For parents",
    parentsBody: "Search, save centres, and message daycares. This stays free.",
    parentsCta: "Search daycares",
    daycareTitle: "For daycares",
    daycareName: "Free",
    daycarePill: "Free during launch",
    daycareBody: "Claim your listing and use every daycare tool during the free founding period. No card is charged.",
    foundingTitle: "Founding member",
    foundingBody:
      "Daycares that claim during launch get a Founding member badge. Founding members keep a locked-in discount when paid extras arrive.",
    claim: "Claim your listing",
    priceUnit: "/ month",
  },
  fr: {
    kicker: "KidEase",
    title: "Forfaits pour les garderies",
    lead: "KidEase est une entreprise canadienne qui aide les parents à trouver une garderie permise. Les parents utilisent toujours KidEase gratuitement. Les garderies ont tous les outils gratuits pendant le lancement.",
    parentsTitle: "Pour les parents",
    parentsBody: "Cherchez, enregistrez des centres et écrivez aux garderies. Cela reste gratuit.",
    parentsCta: "Chercher une garderie",
    daycareTitle: "Pour les garderies",
    daycareName: "Gratuit",
    daycarePill: "Gratuit pendant le lancement",
    daycareBody: "Réclamez votre fiche et utilisez tous les outils de garderie pendant la période fondatrice gratuite. Aucune carte n’est débitée.",
    foundingTitle: "Membre fondateur",
    foundingBody:
      "Les garderies qui réclament leur fiche pendant le lancement reçoivent un badge Membre fondateur. Les membres fondateurs gardent un rabais bloqué quand les extras payants arrivent.",
    claim: "Réclamer votre fiche",
    priceUnit: "/ mois",
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
