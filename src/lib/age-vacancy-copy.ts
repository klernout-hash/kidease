import type { AgeVacancyGroup } from "./age-vacancy";

export type AgeVacancyCopy = {
  kicker: string;
  title: (city: string, age: AgeVacancyGroup) => string;
  what: string;
  why: (age: AgeVacancyGroup) => string;
  lead: string;
  centres: (n: number) => string;
  spots: (n: number) => string;
  fee: (n: number) => string;
  noFee: string;
  ages: (min: number, max: number) => string;
  search: (city: string) => string;
  empty: string;
};

const ageEn: Record<AgeVacancyGroup, string> = {
  infant: "infants",
  toddler: "toddlers",
  preschool: "preschoolers",
};

const ageTitleEn: Record<AgeVacancyGroup, string> = {
  infant: "Infant",
  toddler: "Toddler",
  preschool: "Preschool",
};

const ageFr: Record<AgeVacancyGroup, string> = {
  infant: "nourrissons",
  toddler: "tout-petits",
  preschool: "préscolaires",
};

const en: AgeVacancyCopy = {
  kicker: "KidEase",
  title: (city, age) => `${ageTitleEn[age]} daycare in ${city}`,
  what: "KidEase lists licensed daycare in Canada.",
  why: (age) => `This page counts centres here that care for ${ageEn[age]}, plus the open spots and fees on file.`,
  lead: "Search this city to compare them.",
  centres: (n) => `${n} centres`,
  spots: (n) => `${n} open spots on file`,
  fee: (n) => `Average listed fee $${n} a month`,
  noFee: "No monthly fee is on file for this age yet.",
  ages: (min, max) => `${min} to ${max} months`,
  search: (city) => `Search daycare in ${city}`,
  empty: "This page is not published. Search for a city instead.",
};

const fr: AgeVacancyCopy = {
  kicker: "KidEase",
  title: (city, age) => `Garderies pour ${ageFr[age]} à ${city}`,
  what: "KidEase répertorie les garderies permises au Canada.",
  why: (age) => `Cette page compte les centres ici qui accueillent des ${ageFr[age]}, plus les places et les frais au dossier.`,
  lead: "Cherchez dans cette ville pour les comparer.",
  centres: (n) => `${n} centres`,
  spots: (n) => `${n} places libres au dossier`,
  fee: (n) => `Frais moyens affichés ${n} $ par mois`,
  noFee: "Aucun frais mensuel n'est au dossier pour cet âge.",
  ages: (min, max) => `${min} à ${max} mois`,
  search: (city) => `Chercher une garderie à ${city}`,
  empty: "Cette page n'est pas publiée. Cherchez une ville à la place.",
};

export function ageVacancyCopy(locale: string | null | undefined): AgeVacancyCopy {
  return locale === "fr" ? fr : en;
}

export function ageVacancyMeta(locale: "en" | "fr", page: { city: string; province: string; age: AgeVacancyGroup; centres: number }) {
  if (locale === "fr") {
    return {
      title: `Garderies pour ${ageFr[page.age]} à ${page.city}, ${page.province} · KidEase`,
      description: `${page.centres} centres permis à ${page.city} qui accueillent des ${ageFr[page.age]}. Places et frais seulement quand ils sont au dossier.`,
    };
  }
  return {
    title: `${ageTitleEn[page.age]} daycare in ${page.city}, ${page.province} · KidEase`,
    description: `${page.centres} licensed centres in ${page.city} that care for ${ageEn[page.age]}. Open spots and fees only when they are on file.`,
  };
}
