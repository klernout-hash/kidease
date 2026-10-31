export type StaffCopy = {
  offTitle: string;
  offBody: string;
  home: string;
  title: string;
  lead: string;
  centre: string;
  shiftTitle: string;
  name: string;
  role: string;
  room: string;
  start: string;
  end: string;
  saveShift: string;
  hours: string;
  noShifts: string;
  certTitle: string;
  certLead: string;
  expires: string;
  level: string;
  number: string;
  saveCert: string;
  noCerts: string;
  remind: string;
  reminded: string;
  ratioTitle: string;
  ratioLead: string;
  children: string;
  check: string;
  staffNow: string;
  rule: string;
  ok: string;
  near: string;
  out: string;
  roles: Record<"ece" | "assistant" | "other", string>;
  rooms: Record<"infant" | "toddler" | "preschool" | "school-age", string>;
  saved: string;
  bad: string;
};

const en: StaffCopy = {
  offTitle: "Staff shifts are off",
  offBody: "KidEase can keep shifts, ECE certificate dates, and room ratios here. This tool is off until we turn it on.",
  home: "Back to today",
  title: "Staff shifts",
  lead: "Add who is working and when. This is not payroll. KidEase does not text staff.",
  centre: "Centre",
  shiftTitle: "Add a shift",
  name: "Staff name",
  role: "Role",
  room: "Room",
  start: "Starts",
  end: "Ends",
  saveShift: "Save shift",
  hours: "hours",
  noShifts: "No shifts yet.",
  certTitle: "ECE certificates",
  certLead: "We email this centre when a certificate expires within 60 days. We do not text.",
  expires: "Expires",
  level: "Level",
  number: "Certificate number",
  saveCert: "Save certificate",
  noCerts: "No certificates yet.",
  remind: "Email expiry reminders",
  reminded: "Reminder email sent.",
  ratioTitle: "Room ratio",
  ratioLead: "Count the children in the room yourself. Staff come from shifts that cover this moment. This is a planning check, not a licence decision.",
  children: "Children in this room now",
  check: "Check ratio",
  staffNow: "Staff on shift",
  rule: "Rule",
  ok: "Within the guide.",
  near: "Close to the guide.",
  out: "Over the guide. Add staff or lower the count before you rely on it.",
  roles: { ece: "ECE", assistant: "Assistant", other: "Other" },
  rooms: { infant: "Infant", toddler: "Toddler", preschool: "Preschool", "school-age": "School-age" },
  saved: "Saved.",
  bad: "Check the name and the times.",
};

const fr: StaffCopy = {
  offTitle: "Les quarts sont éteints",
  offBody: "KidEase peut garder les quarts, les dates de certificat EPE et les ratios ici. Cet outil est éteint jusqu’à ce qu’on l’active.",
  home: "Retour à aujourd’hui",
  title: "Quarts du personnel",
  lead: "Ajoutez qui travaille et quand. Ce n’est pas la paie. KidEase n’envoie pas de texto au personnel.",
  centre: "Centre",
  shiftTitle: "Ajouter un quart",
  name: "Nom",
  role: "Rôle",
  room: "Salle",
  start: "Début",
  end: "Fin",
  saveShift: "Enregistrer le quart",
  hours: "heures",
  noShifts: "Aucun quart pour le moment.",
  certTitle: "Certificats EPE",
  certLead: "Nous écrivons à ce centre quand un certificat expire dans les 60 jours. Pas de texto.",
  expires: "Expire",
  level: "Niveau",
  number: "Numéro de certificat",
  saveCert: "Enregistrer le certificat",
  noCerts: "Aucun certificat pour le moment.",
  remind: "Envoyer les rappels",
  reminded: "Courriel de rappel envoyé.",
  ratioTitle: "Ratio de la salle",
  ratioLead: "Comptez vous-même les enfants dans la salle. Le personnel vient des quarts qui couvrent ce moment. C’est une vérification de planification, pas une décision de permis.",
  children: "Enfants dans cette salle maintenant",
  check: "Vérifier le ratio",
  staffNow: "Personnel en quart",
  rule: "Règle",
  ok: "Dans le guide.",
  near: "Près du guide.",
  out: "Au-dessus du guide. Ajoutez du personnel ou baissez le nombre avant de vous y fier.",
  roles: { ece: "EPE", assistant: "Assistant", other: "Autre" },
  rooms: { infant: "Nourrisson", toddler: "Trottineur", preschool: "Préscolaire", "school-age": "Âge scolaire" },
  saved: "Enregistré.",
  bad: "Vérifiez le nom et les heures.",
};

export function staffCopy(locale: string | null | undefined): StaffCopy {
  return locale === "fr" ? fr : en;
}
