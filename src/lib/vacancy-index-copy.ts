/** Copy for /vacancy-index. No invented national statistics. No em dashes. */

export type VacancyIndexCopy = {
  kicker: string;
  title: string;
  what: string;
  why: string;
  next: string;
  search: string;
  home: string;
  centres: string;
  openSpots: string;
  averageFee: string;
  noFee: string;
  methodTitle: string;
  methods: string[];
  empty: string;
  error: string;
  ages: { infant: string; toddler: string; preschool: string };
};

const EN: VacancyIndexCopy = {
  kicker: "KidEase listings",
  title: "Canadian Childcare Vacancy Index",
  what: "This page counts licensed listings on KidEase, by province and age group.",
  why: "You can see where centres, open spots, and monthly fees are on file before you search.",
  next: "Search your city when you want a centre near you.",
  search: "Search daycares",
  home: "Go home",
  centres: "Centres",
  openSpots: "Open spots on file",
  averageFee: "Average monthly fee",
  noFee: "No monthly fee is on file",
  methodTitle: "How we count",
  methods: [
    "Only public KidEase listings are counted. Test rows and hidden listings stay out.",
    "A centre is counted in an age group when the ages on the listing overlap that group.",
    "Infant is under 18 months. Toddler is 18 to 35 months. Preschool is 36 months and older.",
    "Open spots are the numbers saved on the listing for that age. A blank or zero is not an open spot.",
    "The average fee uses only monthly fees above zero. If none are on file, that cell stays blank.",
    "This is not a government census and not a saved month-end file. The numbers are read when you open the page.",
    "KidEase does not charge a waitlist fee.",
  ],
  empty: "No public listings with ages are on file yet.",
  error: "We could not read live listings just now.",
  ages: { infant: "Infant", toddler: "Toddler", preschool: "Preschool" },
};

const FR: VacancyIndexCopy = {
  kicker: "Fiches KidEase",
  title: "Indice canadien des places en garde",
  what: "Cette page compte les fiches publiques de KidEase, par province et par groupe d'âge.",
  why: "Vous voyez les centres, les places ouvertes et les frais mensuels au dossier avant de chercher.",
  next: "Cherchez votre ville quand vous voulez un centre près de chez vous.",
  search: "Chercher une garderie",
  home: "Retour à l'accueil",
  centres: "Centres",
  openSpots: "Places ouvertes au dossier",
  averageFee: "Frais mensuels moyens",
  noFee: "Aucun frais mensuel au dossier",
  methodTitle: "Comment nous comptons",
  methods: [
    "Seules les fiches publiques KidEase sont comptées. Les fiches de test et cachées restent dehors.",
    "Un centre compte dans un groupe d'âge quand les âges de la fiche recoupent ce groupe.",
    "Nourrisson: moins de 18 mois. Tout-petit: 18 à 35 mois. Préscolaire: 36 mois et plus.",
    "Les places ouvertes sont les nombres enregistrés pour cet âge. Un blanc ou un zéro n'est pas une place ouverte.",
    "La moyenne n'utilise que les frais mensuels au-dessus de zéro. Sinon, la case reste vide.",
    "Ce n'est pas un recensement gouvernemental ni un fichier de fin de mois. Les nombres sont lus à l'ouverture de la page.",
    "KidEase ne facture pas de frais de liste d'attente.",
  ],
  empty: "Aucune fiche publique avec des âges n'est au dossier pour le moment.",
  error: "Nous n'avons pas pu lire les fiches en direct pour le moment.",
  ages: { infant: "Nourrisson", toddler: "Tout-petit", preschool: "Préscolaire" },
};

export function vacancyIndexCopy(locale: string): VacancyIndexCopy {
  return locale === "fr" ? FR : EN;
}

export function vacancyMonthLabel(monthKey: string, locale: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

export function vacancyFeeLabel(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount);
}
