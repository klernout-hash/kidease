export type OpenSpotsCopy = {
  kicker: string;
  title: string;
  what: string;
  why: string;
  views: (n: number) => string;
  lead: string;
  save: (label: string) => string;
  saved: string;
  splitNote: string;
  ageNote: (age: string) => string;
  invalid: string;
  searchAgain: string;
  desk: string;
  mailOff: string;
  smsSoon: string;
};

const en: OpenSpotsCopy = {
  kicker: "KidEase",
  title: "Any open spots?",
  what: "KidEase asks claimed daycares once a week.",
  why: "Your tap updates the open-spot count and the date you confirmed it. No login.",
  views: (n) =>
    n === 1
      ? "Parents viewed this listing 1 time in the last 7 days."
      : `Parents viewed this listing ${n} times in the last 7 days.`,
  lead: "Tap the number that matches. 3+ means three or more.",
  save: (label) => `Save ${label}`,
  saved: "Saved. Parents can see this confirm date.",
  splitNote:
    "This listing serves more than one age. We saved your total and the confirm date. Age-by-age counts stay as they were. Change those on your daycare desk.",
  ageNote: (age) => `Saved on the ${age} count.`,
  invalid: "This link is not valid or it has expired.",
  searchAgain: "Go to KidEase",
  desk: "Open your daycare desk",
  mailOff: "The weekly email is off until KidEase turns it on.",
  smsSoon: "Text check-in is coming soon. The toll-free number is not approved yet.",
};

const fr: OpenSpotsCopy = {
  kicker: "KidEase",
  title: "Des places libres?",
  what: "KidEase demande aux garderies réclamées une fois par semaine.",
  why: "Votre choix met à jour le nombre de places et la date de confirmation. Sans connexion.",
  views: (n) =>
    n === 1
      ? "Des parents ont vu cette fiche 1 fois dans les 7 derniers jours."
      : `Des parents ont vu cette fiche ${n} fois dans les 7 derniers jours.`,
  lead: "Touchez le nombre qui correspond. 3+ veut dire trois ou plus.",
  save: (label) => `Enregistrer ${label}`,
  saved: "Enregistré. Les parents peuvent voir cette date de confirmation.",
  splitNote:
    "Cette fiche couvre plus d'un âge. Nous avons enregistré votre total et la date. Les comptes par âge restent tels quels. Changez-les sur votre bureau.",
  ageNote: (age) => `Enregistré sur le compte ${age}.`,
  invalid: "Ce lien n'est pas valide ou il a expiré.",
  searchAgain: "Aller à KidEase",
  desk: "Ouvrir votre bureau",
  mailOff: "Le courriel hebdomadaire est éteint jusqu'à ce que KidEase l'active.",
  smsSoon: "Le texto arrive bientôt. Le numéro sans frais n'est pas encore approuvé.",
};

export function openSpotsCopy(locale: string | null | undefined): OpenSpotsCopy {
  return locale === "fr" ? fr : en;
}
