import type { PortfolioGap } from "./child-portfolio.ts";

export type PortfolioCopy = {
  reminderTitle: string;
  reminderBody: string;
  finish: string;
  incomplete: string;
  incompleteBody: string;
  approveBlocked: string;
  off: string;
  gaps: Record<PortfolioGap, string>;
};

const en: PortfolioCopy = {
  reminderTitle: "Child profile reminders",
  reminderBody: "Finish this child's file before a daycare can approve the request.",
  finish: "Finish this file",
  incomplete: "Portfolio incomplete",
  incompleteBody: "Approve stays off until the parent finishes the missing parts.",
  approveBlocked: "The child file is not complete yet, so this request cannot be approved.",
  off: "This check is off.",
  gaps: {
    name: "Child's name",
    birthdate: "Date of birth",
    health: "Allergies or medical notes",
    emergency: "Emergency contact",
    pickup: "Authorized pickup",
    immunization: "Immunization status or note",
    doctor: "Doctor name and phone",
    address: "Home address",
  },
};

const fr: PortfolioCopy = {
  reminderTitle: "Rappels pour le dossier de l’enfant",
  reminderBody: "Complétez le dossier de cet enfant avant qu’une garderie puisse approuver la demande.",
  finish: "Compléter ce dossier",
  incomplete: "Dossier incomplet",
  incompleteBody: "Approuver reste désactivé tant que le parent n’a pas fini les parties manquantes.",
  approveBlocked: "Le dossier de l’enfant n’est pas complet, donc cette demande ne peut pas être approuvée.",
  off: "Cette vérification est désactivée.",
  gaps: {
    name: "Nom de l’enfant",
    birthdate: "Date de naissance",
    health: "Allergies ou notes médicales",
    emergency: "Contact d’urgence",
    pickup: "Personne autorisée",
    immunization: "Vaccins ou note",
    doctor: "Nom et téléphone du médecin",
    address: "Adresse à la maison",
  },
};

export function portfolioCopy(locale: string): PortfolioCopy {
  return locale === "fr" ? fr : en;
}
