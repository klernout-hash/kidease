export type CareReminderCopy = {
  title: string;
  lead: string;
  yours: string;
  master: string;
  same: string;
  leadLabel: string;
  dropoff: string;
  pickup: string;
  zone: string;
  zoneHint: string;
  save: string;
  saved: string;
  off: string;
  push: string;
  noSms: string;
  closed: string;
  minutes: Record<15 | 30 | 60, string>;
  days: string[];
};

const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const daysFr = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

const en: CareReminderCopy = {
  title: "Drop-off and pick-up",
  lead: "Set the times for this child. KidEase reminds you before each one.",
  yours: "These times are only for your login. The other parent sets their own.",
  master: "Reminders on",
  same: "Same time every day",
  leadLabel: "Remind me ahead",
  dropoff: "Drop-off",
  pickup: "Pick-up",
  zone: "Your time zone",
  zoneHint: "Pick a time zone so the reminder matches your clock, including when the clocks change.",
  save: "Save reminders",
  saved: "Saved",
  off: "Reminders are off.",
  push: "You get a notice in KidEase. A phone alert is sent only when phone alerts are already on. No text message.",
  noSms: "No text message.",
  closed: "KidEase skips a day the daycare has marked closed.",
  minutes: { 15: "15 minutes", 30: "30 minutes", 60: "60 minutes" },
  days: daysEn,
};

const fr: CareReminderCopy = {
  title: "Arrivée et départ",
  lead: "Choisissez les heures pour cet enfant. KidEase vous le rappelle avant.",
  yours: "Ces heures sont seulement pour votre compte. L’autre parent choisit les siennes.",
  master: "Rappels activés",
  same: "La même heure chaque jour",
  leadLabel: "Rappeler à l’avance",
  dropoff: "Arrivée",
  pickup: "Départ",
  zone: "Votre fuseau horaire",
  zoneHint: "Choisissez un fuseau pour que le rappel suive votre heure, y compris au changement d’heure.",
  save: "Enregistrer les rappels",
  saved: "Enregistré",
  off: "Les rappels sont désactivés.",
  push: "Vous recevez un avis dans KidEase. Une alerte sur le téléphone part seulement si les alertes téléphone sont déjà activées. Pas de texto.",
  noSms: "Pas de texto.",
  closed: "KidEase saute un jour que la garderie a marqué fermé.",
  minutes: { 15: "15 minutes", 30: "30 minutes", 60: "60 minutes" },
  days: daysFr,
};

export function careReminderCopy(locale: string): CareReminderCopy {
  return locale === "fr" ? fr : en;
}
