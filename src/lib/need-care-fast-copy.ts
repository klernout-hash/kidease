export type NeedCareFastCopy = {
  kicker: string;
  title: string;
  what: string;
  why: string;
  lead: string;
  placeLabel: string;
  submit: string;
  emptyPlace: string;
  unknownPlace: string;
  emptyResults: string;
  searchAgain: string;
  spots: string;
  confirmed: string;
  away: string;
};

const en: NeedCareFastCopy = {
  kicker: "KidEase",
  title: "Need care fast",
  what: "KidEase lists licensed daycare in Canada.",
  why: "This page shows only centres that confirmed an open spot in the last 7 days.",
  lead: "Enter your city. We sort the closest centres first.",
  placeLabel: "City",
  submit: "Show open spots",
  emptyPlace: "Add a city so we can sort by distance.",
  unknownPlace: "We could not find that place. Try a city name like Toronto.",
  emptyResults: "No centre near here confirmed an open spot in the last 7 days.",
  searchAgain: "Search all daycares",
  spots: "open spots",
  confirmed: "Confirmed",
  away: "away",
};

const fr: NeedCareFastCopy = {
  kicker: "KidEase",
  title: "Besoin de garde vite",
  what: "KidEase répertorie les garderies permises au Canada.",
  why: "Cette page montre seulement les centres qui ont confirmé une place libre dans les 7 derniers jours.",
  lead: "Entrez votre ville. Nous trions les centres les plus proches d'abord.",
  placeLabel: "Ville",
  submit: "Voir les places libres",
  emptyPlace: "Ajoutez une ville pour trier par distance.",
  unknownPlace: "Nous n'avons pas trouvé cet endroit. Essayez un nom de ville, comme Toronto.",
  emptyResults: "Aucun centre près d'ici n'a confirmé une place libre dans les 7 derniers jours.",
  searchAgain: "Chercher toutes les garderies",
  spots: "places libres",
  confirmed: "Confirmé",
  away: "de distance",
};

export function needCareFastCopy(locale: string | null | undefined): NeedCareFastCopy {
  return locale === "fr" ? fr : en;
}
