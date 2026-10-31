export type OrgCopy = {
  offTitle: string;
  offBody: string;
  home: string;
  title: string;
  lead: string;
  empty: string;
  centre: string;
  capacity: string;
  enrolled: string;
  openSpots: string;
  occupancy: string;
  missingCapacity: string;
  missingEnrolment: string;
  notConfirmed: string;
  total: string;
  readyOf: string;
};

const en: OrgCopy = {
  offTitle: "Centre totals are off",
  offBody: "When this is on, you can see capacity, enrolled children, and open spots for every centre you run. KidEase does not guess a number.",
  home: "Back to today",
  title: "Your centres",
  lead: "Occupancy uses the licensed capacity on the listing and children with an accepted booking. A blank stays blank.",
  empty: "You do not have a centre on this account yet.",
  centre: "Centre",
  capacity: "Capacity",
  enrolled: "Enrolled",
  openSpots: "Open spots",
  occupancy: "Occupancy",
  missingCapacity: "Capacity is not on file.",
  missingEnrolment: "Enrolment is not on file.",
  notConfirmed: "Not confirmed",
  total: "Centres with both numbers",
  readyOf: "of",
};

const fr: OrgCopy = {
  offTitle: "Les totaux des centres sont éteints",
  offBody: "Quand c'est actif, vous voyez la capacité, les enfants inscrits et les places libres de chaque centre que vous dirigez. KidEase n'invente pas un chiffre.",
  home: "Retour à aujourd'hui",
  title: "Vos centres",
  lead: "L'occupation utilise la capacité permise sur la fiche et les enfants avec une inscription acceptée. Une case vide reste vide.",
  empty: "Vous n'avez pas encore de centre sur ce compte.",
  centre: "Centre",
  capacity: "Capacité",
  enrolled: "Inscrits",
  openSpots: "Places libres",
  occupancy: "Occupation",
  missingCapacity: "La capacité n'est pas au dossier.",
  missingEnrolment: "L'inscription n'est pas au dossier.",
  notConfirmed: "Pas confirmé",
  total: "Centres avec les deux chiffres",
  readyOf: "sur",
};

export function orgCopy(locale: string | null | undefined): OrgCopy {
  return locale === "fr" ? fr : en;
}
