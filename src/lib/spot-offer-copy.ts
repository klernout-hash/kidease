/**
 * Parent and daycare copy for the free waitlist. No em dashes.
 * English and French. French lines are allowed to run longer.
 */

export type SpotOfferCopy = {
  pageKicker: string;
  pageTitle: string;
  pageLead: string;
  joinTitle: string;
  joinLead: string;
  included: string;
  ageLabel: string;
  infant: string;
  toddler: string;
  preschool: string;
  any: string;
  childLabel: string;
  noteLabel: string;
  join: string;
  joined: string;
  seeMine: string;
  withdraw: string;
  mineTitle: string;
  mineLead: string;
  accept: string;
  decline: string;
  answerBy: string;
  place: string;
  deskTitle: string;
  deskLead: string;
  offerSpot: string;
  openOffer: string;
  emptyDesk: string;
  emptyMine: string;
  findCare: string;
  mailOff: string;
  feeBlocked: string;
  ended: string;
  accepted: string;
  declinedNote: string;
  invalidLink: string;
  searchAgain: string;
  what: string;
  why: string;
  nextStep: string;
};

const en: SpotOfferCopy = {
  pageKicker: "KidEase",
  pageTitle: "Your daycare waitlist",
  pageLead: "Daycares on KidEase can offer you a spot. You have 48 hours to answer. There is no waitlist fee.",
  joinTitle: "Join the waitlist",
  joinLead: "Tell this daycare you want a spot. Joining is free. KidEase does not charge a waitlist fee.",
  included: "Included on every plan.",
  ageLabel: "Child's age group",
  infant: "Infant (under 18 months)",
  toddler: "Toddler (18 to 36 months)",
  preschool: "Preschool (3 to 5 years)",
  any: "Not sure yet",
  childLabel: "Child's first name (optional)",
  noteLabel: "Note for the daycare (optional)",
  join: "Join the waitlist",
  joined: "You are on the waitlist.",
  seeMine: "See your waitlist",
  withdraw: "Leave the waitlist",
  mineTitle: "Your waitlist",
  mineLead: "When a daycare offers you a spot, you have 48 hours to answer.",
  accept: "Accept the spot",
  decline: "No thanks",
  answerBy: "Answer by",
  place: "Your place",
  deskTitle: "Waitlist",
  deskLead:
    "Families join from your listing. Offer one spot at a time. They have 48 hours. If they say no, or the time runs out, the next family gets the offer. No waitlist fee. Included on every plan.",
  offerSpot: "Offer this spot",
  openOffer: "Waiting for an answer",
  emptyDesk: "No families yet. Parents join from your listing.",
  emptyMine: "You are not on a waitlist yet.",
  findCare: "Find a daycare",
  mailOff: "Offer emails are off. The family sees the offer when they sign in.",
  feeBlocked: "KidEase does not charge a waitlist fee.",
  ended: "This offer has ended.",
  accepted: "You accepted the spot.",
  declinedNote: "You declined the spot. The next family may be offered it.",
  invalidLink: "This link is not valid.",
  searchAgain: "Search again",
  what: "KidEase is a daycare directory for Canada.",
  why: "A daycare can offer you an open spot and you can answer in one tap.",
  nextStep: "Accept the spot if you still need it.",
};

const fr: SpotOfferCopy = {
  pageKicker: "KidEase",
  pageTitle: "Votre liste d'attente",
  pageLead:
    "Les garderies sur KidEase peuvent vous offrir une place. Vous avez 48 heures pour répondre. Aucuns frais de liste d'attente.",
  joinTitle: "Joindre la liste d'attente",
  joinLead:
    "Dites à cette garderie que vous voulez une place. C'est gratuit. KidEase ne facture aucuns frais de liste d'attente.",
  included: "Inclus dans chaque forfait.",
  ageLabel: "Groupe d'âge de l'enfant",
  infant: "Poupon (moins de 18 mois)",
  toddler: "Tout-petit (18 à 36 mois)",
  preschool: "Préscolaire (3 à 5 ans)",
  any: "Pas encore certain",
  childLabel: "Prénom de l'enfant (facultatif)",
  noteLabel: "Note pour la garderie (facultatif)",
  join: "Joindre la liste d'attente",
  joined: "Vous êtes sur la liste d'attente.",
  seeMine: "Voir votre liste",
  withdraw: "Quitter la liste",
  mineTitle: "Votre liste d'attente",
  mineLead: "Quand une garderie vous offre une place, vous avez 48 heures pour répondre.",
  accept: "Accepter la place",
  decline: "Non merci",
  answerBy: "Répondre avant",
  place: "Votre place",
  deskTitle: "Liste d'attente",
  deskLead:
    "Les familles joignent la liste depuis votre fiche. Offrez une place à la fois. Elles ont 48 heures. Si elles refusent, ou si le délai passe, la famille suivante reçoit l'offre. Aucuns frais. Inclus dans chaque forfait.",
  offerSpot: "Offrir cette place",
  openOffer: "En attente d'une réponse",
  emptyDesk: "Aucune famille pour le moment. Les parents joignent la liste depuis votre fiche.",
  emptyMine: "Vous n'êtes pas encore sur une liste d'attente.",
  findCare: "Trouver une garderie",
  mailOff: "Les courriels d'offre sont désactivés. La famille voit l'offre en se connectant.",
  feeBlocked: "KidEase ne facture aucuns frais de liste d'attente.",
  ended: "Cette offre est terminée.",
  accepted: "Vous avez accepté la place.",
  declinedNote: "Vous avez refusé la place. La famille suivante peut la recevoir.",
  invalidLink: "Ce lien n'est pas valide.",
  searchAgain: "Chercher encore",
  what: "KidEase est un répertoire de garderies au Canada.",
  why: "Une garderie peut vous offrir une place libre et vous répondez en un toucher.",
  nextStep: "Acceptez la place si vous en avez encore besoin.",
};

export function spotOfferCopy(locale: string | null | undefined): SpotOfferCopy {
  return locale === "fr" ? fr : en;
}
