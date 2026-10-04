export type ProvincialGuideCopy = {
  kicker: string;
  indexTitle: string;
  indexWhat: string;
  indexWhy: string;
  indexLead: string;
  title: (name: string) => string;
  what: string;
  why: string;
  lead: string;
  feesTitle: string;
  feesBody: string;
  subsidyTitle: string;
  subsidyBody: string;
  waitlistTitle: string;
  waitlistBody: string;
  startTitle: string;
  official: string;
  canadaWide: string;
  create: string;
  back: string;
  missing: string;
  home: string;
};

const en: ProvincialGuideCopy = {
  kicker: "KidEase",
  indexTitle: "Provincial child care guides",
  indexWhat: "KidEase lists licensed daycare in Canada.",
  indexWhy: "Each guide points to the official pages for fees, subsidy, waitlists, and licensing.",
  indexLead: "Pick your province.",
  title: (name) => `${name} child care guide`,
  what: "KidEase lists licensed daycare in Canada.",
  why: "This guide points to official government pages. KidEase does not set fees or award grants.",
  lead: "Create your KidEase listing after you have a licence, or claim the one already in the directory.",
  feesTitle: "Fees after the Canada-wide agreements",
  feesBody:
    "Reduced parent fees are set by each province for participating licensed programs. Confirm the current amount on the official pages. KidEase does not invent a fee.",
  subsidyTitle: "Subsidy steps",
  subsidyBody: "Apply on the official subsidy or funding page. KidEase does not process the application.",
  waitlistTitle: "Waitlist rules",
  waitlistBody:
    "Waitlist rules are set by the province. KidEase does not charge a waitlist fee. Read the licensing page before you ask a family to join a list.",
  startTitle: "How to start a licensed daycare",
  official: "Official page",
  canadaWide: "Canada-wide early learning and child care",
  create: "Create your KidEase listing",
  back: "All provincial guides",
  missing: "That guide is not on KidEase.",
  home: "Go to search",
};

const fr: ProvincialGuideCopy = {
  kicker: "KidEase",
  indexTitle: "Guides provinciaux de garde",
  indexWhat: "KidEase répertorie les garderies permises au Canada.",
  indexWhy: "Chaque guide pointe vers les pages officielles pour les frais, les subventions, les listes d'attente et les permis.",
  indexLead: "Choisissez votre province.",
  title: (name) => `Guide de garde : ${name}`,
  what: "KidEase répertorie les garderies permises au Canada.",
  why: "Ce guide pointe vers les pages officielles. KidEase ne fixe pas les frais et n'accorde pas de subventions.",
  lead: "Créez votre fiche KidEase après le permis, ou réclamez celle qui est déjà dans le répertoire.",
  feesTitle: "Frais après les ententes pancanadiennes",
  feesBody:
    "Les frais réduits sont fixés par chaque province pour les programmes permis participants. Confirmez le montant actuel sur les pages officielles. KidEase n'invente pas de frais.",
  subsidyTitle: "Étapes de subvention",
  subsidyBody: "Faites la demande sur la page officielle. KidEase ne traite pas la demande.",
  waitlistTitle: "Règles de liste d'attente",
  waitlistBody:
    "La province fixe les règles de liste d'attente. KidEase ne facture pas de frais de liste d'attente. Lisez la page de permis avant de demander à une famille de s'inscrire.",
  startTitle: "Comment ouvrir une garderie permise",
  official: "Page officielle",
  canadaWide: "Apprentissage et garde des jeunes enfants à l'échelle du Canada",
  create: "Créer votre fiche KidEase",
  back: "Tous les guides provinciaux",
  missing: "Ce guide n'est pas sur KidEase.",
  home: "Aller à la recherche",
};

export function provincialGuideCopy(locale: string | null | undefined): ProvincialGuideCopy {
  return locale === "fr" ? fr : en;
}
