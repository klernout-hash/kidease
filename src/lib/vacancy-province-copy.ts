/**
 * Copy for the per-province vacancy index. English and French.
 * The national page keeps its strings in copy.ts.
 */

export type VacancyProvinceCopy = {
  pageTitle: (name: string) => string;
  lead: string;
  fresh: string;
  aging: string;
  stale: string;
  unknown: string;
  official: (openings: string, centres: string, date: string) => string;
  officialMissing: string;
  historyTitle: string;
  historyEmpty: string;
  historyConfirm: string;
  historyEdit: string;
  historyImport: string;
  spots: (infant: string, toddler: string, preschool: string) => string;
  provinceLink: string;
  allProvinces: string;
  help: string;
  backSearch: string;
};

const en: VacancyProvinceCopy = {
  pageTitle: (name) => `Open spots in ${name}`,
  lead: "KidEase lists licensed daycares. This page shows confirmed open spots and how old each confirm is. It does not promise a space.",
  fresh: "Confirmed in the last 14 days",
  aging: "Confirmed 14 to 30 days ago",
  stale: "Last confirm is 30 days or older",
  unknown: "No confirm date stored",
  official: (openings, centres, date) =>
    `The province file listed ${openings} openings across ${centres} matched centres. File date: ${date}.`,
  officialMissing: "This province has not sent KidEase a live openings file. Search still uses each centre's own confirm.",
  historyTitle: "Recent confirms",
  historyEmpty: "No confirms are stored for this province yet.",
  historyConfirm: "Centre confirmed spots",
  historyEdit: "Centre updated spot counts",
  historyImport: "Province file updated",
  spots: (infant, toddler, preschool) => `Infant ${infant} · Toddler ${toddler} · Preschool ${preschool}`,
  provinceLink: "Open this province",
  allProvinces: "All provinces",
  help: "Help",
  backSearch: "Search this province",
};

const fr: VacancyProvinceCopy = {
  pageTitle: (name) => `Places ouvertes : ${name}`,
  lead: "KidEase répertorie les garderies permis. Cette page montre les places confirmées et l'âge de chaque confirmation. Elle ne promet pas une place.",
  fresh: "Confirmé dans les 14 derniers jours",
  aging: "Confirmé il y a 14 à 30 jours",
  stale: "Dernière confirmation il y a 30 jours ou plus",
  unknown: "Aucune date de confirmation",
  official: (openings, centres, date) =>
    `Le fichier de la province indique ${openings} places dans ${centres} centres jumelés. Date du fichier : ${date}.`,
  officialMissing: "Cette province n'a pas envoyé de fichier de places à KidEase. La recherche utilise la confirmation de chaque centre.",
  historyTitle: "Confirmations récentes",
  historyEmpty: "Aucune confirmation n'est enregistrée pour cette province.",
  historyConfirm: "Le centre a confirmé les places",
  historyEdit: "Le centre a mis à jour les places",
  historyImport: "Fichier de la province mis à jour",
  spots: (infant, toddler, preschool) => `Poupon ${infant} · Bambin ${toddler} · Préscolaire ${preschool}`,
  provinceLink: "Voir cette province",
  allProvinces: "Toutes les provinces",
  help: "Aide",
  backSearch: "Chercher dans cette province",
};

export function vacancyProvinceCopy(locale: "en" | "fr"): VacancyProvinceCopy {
  return locale === "fr" ? fr : en;
}
