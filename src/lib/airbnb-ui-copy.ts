/**
 * EN and FR-CA copy for the Airbnb-style shell.
 * Other locales fall back to English. This is not a new French product dictionary.
 */

export type AirbnbCopy = {
  findNear: string;
  nearby: string;
  emptyHome: string;
  chipOpen: string;
  chipHome: string;
  chipInfant: string;
  chipSubsidy: string;
  menu: string;
  viewProfile: string;
  account: string;
  personal: string;
  security: string;
  privacy: string;
  notifications: string;
  language: string;
  payments: string;
  paymentsNote: string;
  accessibility: string;
  legal: string;
  signOut: string;
  edit: string;
  save: string;
  cancel: string;
  name: string;
  email: string;
  phone: string;
  about: string;
  emailHelp: string;
  nameHelp: string;
  phoneHelp: string;
  aboutHelp: string;
  saved: string;
  signIn: string;
  appLanguage: string;
  editLanguage: string;
  knownLanguages: string;
  addLanguages: string;
  languageSearch: string;
  close: string;
  alertsTab: string;
  accountTab: string;
  alertsStatus: string;
  editChannels: string;
  smsNote: string;
  noAlerts: string;
  motionNote: string;
  receiptsOnly: string;
  message: string;
  tour: string;
  back: string;
  newPill: string;
  careAll: string;
  careCentres: string;
  careHomes: string;
  careGroup: string;
  careNursery: string;
  careSchool: string;
  careBefore: string;
  careOpen: string;
};

const en: AirbnbCopy = {
  findNear: "Find daycare near you",
  nearby: "{n} daycares nearby",
  emptyHome: "Daycares near you will show here.",
  chipOpen: "Open spots",
  chipHome: "Home daycare",
  chipInfant: "Infant",
  chipSubsidy: "Subsidy",
  menu: "Menu",
  viewProfile: "View profile",
  account: "Account settings",
  personal: "Personal info",
  security: "Login & security",
  privacy: "Privacy",
  notifications: "Notifications",
  language: "Languages & translation",
  payments: "Payments",
  paymentsNote: "Receipts only",
  accessibility: "Accessibility",
  legal: "Legal",
  signOut: "Log out",
  edit: "Edit",
  save: "Save",
  cancel: "Cancel",
  name: "Name",
  email: "Email",
  phone: "Phone",
  about: "About",
  emailHelp: "This is your sign-in email. It is not edited here.",
  nameHelp: "This is the name daycares see.",
  phoneHelp: "Used only if you already opted in to texts.",
  aboutHelp: "A short line about your family. Optional.",
  saved: "Saved",
  signIn: "Sign in",
  appLanguage: "App language",
  editLanguage: "Choose language",
  knownLanguages: "Other languages you know",
  addLanguages: "Add languages",
  languageSearch: "Search languages",
  close: "Close",
  alertsTab: "Alerts & updates",
  accountTab: "Account",
  alertsStatus: "On: in the app",
  editChannels: "Edit",
  smsNote: "Text messages stay off unless you already opted in.",
  noAlerts: "Choices are saved on this device’s account. Nothing new is sent from this screen.",
  motionNote: "KidEase follows your device’s reduced-motion setting.",
  receiptsOnly: "Receipts you already have. Nothing to buy here.",
  message: "Message",
  tour: "Request a tour",
  back: "Back",
  newPill: "New",
  careAll: "All",
  careCentres: "Centres",
  careHomes: "Home daycares",
  careGroup: "Group homes",
  careNursery: "Nursery",
  careSchool: "School-age",
  careBefore: "Before & after",
  careOpen: "Open spots",
};

const fr: AirbnbCopy = {
  findNear: "Trouver une garderie près de chez vous",
  nearby: "{n} garderies à proximité",
  emptyHome: "Les garderies près de chez vous s’afficheront ici.",
  chipOpen: "Places ouvertes",
  chipHome: "Milieu familial",
  chipInfant: "Nourrisson",
  chipSubsidy: "Subvention",
  menu: "Menu",
  viewProfile: "Voir le profil",
  account: "Réglages du compte",
  personal: "Infos personnelles",
  security: "Connexion et sécurité",
  privacy: "Confidentialité",
  notifications: "Notifications",
  language: "Langues et traduction",
  payments: "Paiements",
  paymentsNote: "Reçus seulement",
  accessibility: "Accessibilité",
  legal: "Mentions légales",
  signOut: "Déconnexion",
  edit: "Modifier",
  save: "Enregistrer",
  cancel: "Annuler",
  name: "Nom",
  email: "Courriel",
  phone: "Téléphone",
  about: "À propos",
  emailHelp: "C’est le courriel de connexion. Il ne se modifie pas ici.",
  nameHelp: "C’est le nom que les garderies voient.",
  phoneHelp: "Utilisé seulement si vous avez déjà accepté les textos.",
  aboutHelp: "Une courte ligne sur votre famille. Facultatif.",
  saved: "Enregistré",
  signIn: "Connexion",
  appLanguage: "Langue de l’app",
  editLanguage: "Choisir la langue",
  knownLanguages: "Autres langues que vous connaissez",
  addLanguages: "Ajouter des langues",
  languageSearch: "Chercher une langue",
  close: "Fermer",
  alertsTab: "Alertes et nouveautés",
  accountTab: "Compte",
  alertsStatus: "Activé : dans l’app",
  editChannels: "Modifier",
  smsNote: "Les textos restent fermés, sauf si vous avez déjà accepté.",
  noAlerts: "Les choix restent sur le compte. Cet écran n’envoie rien de nouveau.",
  motionNote: "KidEase suit le réglage de mouvement réduit de votre appareil.",
  receiptsOnly: "Les reçus que vous avez déjà. Aucune mise à niveau.",
  message: "Message",
  tour: "Demander une visite",
  back: "Retour",
  newPill: "Nouveau",
  careAll: "Tout",
  careCentres: "Centres",
  careHomes: "Milieu familial",
  careGroup: "Groupe",
  careNursery: "Prématernelle",
  careSchool: "Scolaire",
  careBefore: "Avant et après",
  careOpen: "Places libres",
};

export function airbnbCopy(locale: string): AirbnbCopy {
  return locale === "fr" ? fr : en;
}

export function airbnbChipLabel(id: string, copy: AirbnbCopy): string {
  if (id === "open") return copy.chipOpen;
  if (id === "home") return copy.chipHome;
  if (id === "infant") return copy.chipInfant;
  if (id === "subsidy") return copy.chipSubsidy;
  return id;
}
