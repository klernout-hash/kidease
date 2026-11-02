export type TimesheetCopy = {
  title: string;
  lead: string;
  week: string;
  countsOn: string;
  noPay: string;
  offTitle: string;
  offBody: string;
  home: string;
  centre: string;
  name: string;
  clockIn: string;
  clockOut: string;
  stillIn: string;
  thisWeek: string;
  hours: string;
  noRows: string;
  edit: string;
  note: string;
  saveEdit: string;
  exportCsv: string;
  audit: string;
  openShift: string;
  saved: string;
  bad: string;
  errors: Record<string, string>;
};

const en: TimesheetCopy = {
  title: "Staff hours",
  lead: "Clock in and clock out. Hours are saved for this centre.",
  week: "Week of",
  countsOn: "Hours count on the day you clock in. The week starts Monday.",
  noPay: "KidEase records hours. It does not pay wages.",
  offTitle: "Staff hours are off",
  offBody: "Clock in and clock out stay hidden until this is turned on.",
  home: "Back to today",
  centre: "Centre",
  name: "Staff name",
  clockIn: "Clock in",
  clockOut: "Clock out",
  stillIn: "Still clocked in",
  thisWeek: "This week",
  hours: "Hours",
  noRows: "No hours this week yet.",
  edit: "Edit times",
  note: "Why this change",
  saveEdit: "Save the change",
  exportCsv: "Download CSV",
  audit: "Changes",
  openShift: "Still clocked in",
  saved: "Saved",
  bad: "Check the name, the times, and the note.",
  errors: {
    off: "Staff hours are off.",
    centre: "This centre is not yours.",
    name: "Enter the staff name.",
    open: "This person is already clocked in.",
    closed: "This shift is already closed.",
    order: "Clock out has to be after clock in.",
    long: "A shift can be at most 16 hours. Edit the times.",
    note: "Write a short note about the change.",
    same: "Change a name or a time first.",
    missing: "That shift was not found.",
    time: "Check the times.",
  },
};

const fr: TimesheetCopy = {
  title: "Heures du personnel",
  lead: "Pointez l’arrivée et le départ. Les heures sont gardées pour ce centre.",
  week: "Semaine du",
  countsOn: "Les heures comptent le jour de l’arrivée. La semaine commence le lundi.",
  noPay: "KidEase note les heures. KidEase ne verse pas de salaire.",
  offTitle: "Les heures du personnel sont désactivées",
  offBody: "L’arrivée et le départ restent cachés tant que ceci est éteint.",
  home: "Retour à aujourd’hui",
  centre: "Centre",
  name: "Nom du personnel",
  clockIn: "Pointer l’arrivée",
  clockOut: "Pointer le départ",
  stillIn: "Encore au travail",
  thisWeek: "Cette semaine",
  hours: "Heures",
  noRows: "Aucune heure cette semaine.",
  edit: "Modifier les heures",
  note: "Pourquoi ce changement",
  saveEdit: "Enregistrer le changement",
  exportCsv: "Télécharger le CSV",
  audit: "Changements",
  openShift: "Encore au travail",
  saved: "Enregistré",
  bad: "Vérifiez le nom, les heures et la note.",
  errors: {
    off: "Les heures du personnel sont désactivées.",
    centre: "Ce centre n’est pas le vôtre.",
    name: "Entrez le nom.",
    open: "Cette personne est déjà arrivée.",
    closed: "Ce quart est déjà fermé.",
    order: "Le départ doit être après l’arrivée.",
    long: "Un quart dure au plus 16 heures. Modifiez les heures.",
    note: "Écrivez une courte note sur le changement.",
    same: "Changez un nom ou une heure d’abord.",
    missing: "Ce quart est introuvable.",
    time: "Vérifiez les heures.",
  },
};

export function timesheetCopy(locale: string): TimesheetCopy {
  return locale === "fr" ? fr : en;
}
