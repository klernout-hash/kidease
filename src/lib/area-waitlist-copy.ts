/**
 * Area waitlist and guest waitlist page copy. English and French.
 * French lines may run longer. No em dashes.
 */

export type AreaWaitlistCopy = {
  guestTitle: string;
  guestWhat: string;
  guestWhy: string;
  guestHow: string;
  signIn: string;
  createAccount: string;
  areaTitle: string;
  areaLead: string;
  placeLabel: string;
  placeHint: string;
  radiusLabel: string;
  ageLabel: string;
  infant: string;
  toddler: string;
  preschool: string;
  any: string;
  startLabel: string;
  startHint: string;
  join: string;
  joined: string;
  needPlace: string;
  placeMiss: string;
  remove: string;
  removed: string;
  yoursTitle: string;
  emptyAreas: string;
  centreTitle: string;
  joinedOn: string;
  offerOpen: string;
  offerAnswer: string;
  noOffer: string;
  withdraw: string;
  withdrawn: string;
  requestsTitle: string;
  daycareBlocked: string;
  radiusKm: string;
  cap: string;
  badDate: string;
};

const en: AreaWaitlistCopy = {
  guestTitle: "Waitlist",
  guestWhat: "KidEase helps parents find licensed daycare in Canada.",
  guestWhy: "A waitlist lets a daycare offer you a spot, or tells you when a spot opens near you.",
  guestHow: "Open any daycare and tap Join the waitlist. Or join an area waitlist.",
  signIn: "Sign in",
  createAccount: "Create an account",
  areaTitle: "Join an area waitlist",
  areaLead: "Tell us your postal code or city. We alert you when a daycare in range posts a spot for your child's age.",
  placeLabel: "Postal code or city",
  placeHint: "Example: R3C 1A1 or Winnipeg",
  radiusLabel: "How far",
  ageLabel: "Child's age group",
  infant: "Infant (under 18 months)",
  toddler: "Toddler (18 to 36 months)",
  preschool: "Preschool (3 to 5 years)",
  any: "Any age",
  startLabel: "Desired start date",
  startHint: "Optional. We look for a spot that can start within about 3 months.",
  join: "Join an area waitlist",
  joined: "You are on the area waitlist.",
  needPlace: "Enter a postal code or city.",
  placeMiss: "We could not find that place in Canada. Try a city name like Winnipeg.",
  remove: "Remove",
  removed: "Area waitlist removed.",
  yoursTitle: "Your area waitlists",
  emptyAreas: "You have no area waitlist yet.",
  centreTitle: "Daycare waitlists",
  joinedOn: "Joined {date}",
  offerOpen: "Offer open until {date}",
  offerAnswer: "Answer the offer",
  noOffer: "No offer yet",
  withdraw: "Leave the waitlist",
  withdrawn: "You left this waitlist.",
  requestsTitle: "Spot requests",
  daycareBlocked: "Daycare accounts manage the centre desk. This waitlist is for parents.",
  radiusKm: "{n} km",
  cap: "You can keep up to 5 area waitlists. Remove one to add another.",
  badDate: "Pick a start date within the next 18 months.",
};

const fr: AreaWaitlistCopy = {
  guestTitle: "Liste d'attente",
  guestWhat: "KidEase aide les parents à trouver une garderie permise au Canada.",
  guestWhy: "Une liste d'attente permet à une garderie de vous offrir une place, ou vous avertit quand une place s'ouvre près de chez vous.",
  guestHow: "Ouvrez une garderie et touchez Joindre la liste d'attente. Ou joignez une liste de secteur.",
  signIn: "Se connecter",
  createAccount: "Créer un compte",
  areaTitle: "Joindre une liste de secteur",
  areaLead: "Indiquez votre code postal ou votre ville. Nous vous avisons quand une garderie dans le rayon affiche une place pour l'âge de votre enfant.",
  placeLabel: "Code postal ou ville",
  placeHint: "Exemple : R3C 1A1 ou Winnipeg",
  radiusLabel: "Distance",
  ageLabel: "Groupe d'âge de l'enfant",
  infant: "Poupon (moins de 18 mois)",
  toddler: "Tout-petit (18 à 36 mois)",
  preschool: "Préscolaire (3 à 5 ans)",
  any: "Tout âge",
  startLabel: "Date de début souhaitée",
  startHint: "Facultatif. Nous cherchons une place qui peut commencer dans environ 3 mois.",
  join: "Joindre une liste de secteur",
  joined: "Vous êtes sur la liste de secteur.",
  needPlace: "Entrez un code postal ou une ville.",
  placeMiss: "Nous n'avons pas trouvé cet endroit au Canada. Essayez un nom de ville comme Winnipeg.",
  remove: "Retirer",
  removed: "Liste de secteur retirée.",
  yoursTitle: "Vos listes de secteur",
  emptyAreas: "Vous n'avez pas encore de liste de secteur.",
  centreTitle: "Listes des garderies",
  joinedOn: "Inscription le {date}",
  offerOpen: "Offre ouverte jusqu'au {date}",
  offerAnswer: "Répondre à l'offre",
  noOffer: "Aucune offre pour le moment",
  withdraw: "Quitter la liste",
  withdrawn: "Vous avez quitté cette liste.",
  requestsTitle: "Demandes de place",
  daycareBlocked: "Les comptes garderie utilisent le bureau du centre. Cette liste est pour les parents.",
  radiusKm: "{n} km",
  cap: "Vous pouvez garder jusqu'à 5 listes de secteur. Retirez-en une pour en ajouter une autre.",
  badDate: "Choisissez une date de début dans les 18 prochains mois.",
};

export function areaWaitlistCopy(locale: string | null | undefined): AreaWaitlistCopy {
  return locale === "fr" ? fr : en;
}

const CENTRE_STATUS_EN: Record<string, string> = {
  waiting: "Waiting",
  offered: "Offered",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  withdrawn: "Withdrawn",
};

const CENTRE_STATUS_FR: Record<string, string> = {
  waiting: "En attente",
  offered: "Offerte",
  accepted: "Acceptée",
  declined: "Refusée",
  expired: "Expirée",
  withdrawn: "Retirée",
};

export function centreWaitlistStatus(status: string, locale: string | null | undefined): string {
  const table = locale === "fr" ? CENTRE_STATUS_FR : CENTRE_STATUS_EN;
  return table[status] || status;
}
