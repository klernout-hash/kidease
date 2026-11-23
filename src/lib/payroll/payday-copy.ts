/** Pay day screen words, English and French. Grade 6, short. French runs longer; layouts wrap. */

const EN = {
  title: "Pay day",
  lead: "Pick a person. Check their hours and pay. Then approve. You send the money from your own bank.",
  period: "Pay period",
  from: "First day",
  to: "Last day",
  payDate: "Pay date",
  person: "Person",
  choose: "Choose a person",
  search: "Search by name",
  noMatch: "No one has that name. Clear the search to see everyone.",
  nobody: "No one is set up for pay at this centre yet. Add staff on the Team page first.",
  hours: "Hours",
  overtime: "Overtime",
  rate: "Rate per hour",
  salary: "Salary per year",
  agreed: "Agreed amount",
  payType: "Pay type",
  hourly: "Hourly",
  salaried: "Salary",
  contractor: "Contractor",
  gross: "Pay before deductions",
  vacation: "Vacation pay",
  deductions: "Taken off",
  net: "Take-home pay",
  contractorNote: "Contractors: no tax, CPP or EI taken off. KidEase makes an invoice draft only.",
  salesTax: "GST/HST on their invoice",
  edited: "You changed this. Save it with a reason.",
  reason: "Reason (needed)",
  reasonHint: "A few words, like “Forgot to check out”.",
  save: "Save change",
  cancel: "Cancel",
  change: "Change",
  reset: "Reset to check-in times",
  adjusted: "Adjusted",
  was: "was",
  in: "In",
  out: "Out",
  noCheckIn: "No check-in",
  missedOut: "Missed check-out",
  flagged: "Staff say this day is wrong",
  locked: "Paid already. A change here is added to the next pay.",
  checks: "Before you approve",
  allClear: "Nothing to fix for this person.",
  preview: "Preview every pay stub",
  approve: "Approve pay",
  approving: "Approving…",
  approved: "Pay approved. Stubs are saved. Send the money from your bank.",
  blocked: "Fix the red items first.",
  pack: "Accountant pack",
  packLead: "CSV files and a printable page for your accountant.",
  packEmpty: "No approved pay in these dates yet.",
  estimateTag: "Estimate",
  unverifiedTag: "Check this",
  source: "Official source",
  asOf: "checked",
  loading: "Getting pay details…",
  problem: "Could not load this. Check your connection and try again.",
  retry: "Try again",
  stale: "Someone changed this a moment ago. We loaded the newest version. Try again.",
  permission: "Only the owner or someone with pay permission can change pay.",
  saved: "Saved.",
  myHours: "My hours",
  myLead: "Your hours from check-in. If a day is wrong, tell the owner.",
  flag: "This day is wrong",
  flagNote: "What is wrong?",
  flagSend: "Tell the owner",
  flagSaved: "Saved. The owner will see it on Pay day.",
  notOnPay: "You are not on this centre's pay list yet. Ask the owner.",
  wageAsOf: "Minimum wage rates as of",
  wageNote: "Rates change, usually once a year. KidEase uses the rate in force on each day worked.",
  bonus: "Bonus (optional)",
  bonusTax: "Tax on the bonus",
  bonusHint: "Leave empty if there is no bonus.",
  student: "Student (minimum wage)",
  editors: "Who can do pay",
  editorsLead: "People you add here can do everything on Pay day, including approve. Every change records who made it.",
  editorAdd: "Give pay access",
  editorRemove: "Remove",
  editorNone: "Only you can do pay right now.",
  editorPick: "Choose a team member",
} as const;

export type PaydayCopy = { [K in keyof typeof EN]: string };

const FR: PaydayCopy = {
  title: "Jour de paie",
  lead: "Choisissez une personne. Vérifiez ses heures et sa paie. Puis approuvez. Vous envoyez l’argent de votre propre banque.",
  period: "Période de paie",
  from: "Premier jour",
  to: "Dernier jour",
  payDate: "Date de paie",
  person: "Personne",
  choose: "Choisir une personne",
  search: "Chercher par nom",
  noMatch: "Personne n’a ce nom. Effacez la recherche pour voir tout le monde.",
  nobody: "Personne n’est encore inscrit à la paie dans ce centre. Ajoutez le personnel dans la page Équipe d’abord.",
  hours: "Heures",
  overtime: "Heures supplémentaires",
  rate: "Taux horaire",
  salary: "Salaire annuel",
  agreed: "Montant convenu",
  payType: "Type de paie",
  hourly: "À l’heure",
  salaried: "Salaire",
  contractor: "Travailleur autonome",
  gross: "Paie avant retenues",
  vacation: "Paie de vacances",
  deductions: "Retenues",
  net: "Paie nette",
  contractorNote: "Travailleurs autonomes : aucun impôt, RPC ou AE retenu. KidEase prépare seulement un brouillon de facture.",
  salesTax: "TPS/TVH sur leur facture",
  edited: "Vous avez changé ceci. Enregistrez avec une raison.",
  reason: "Raison (obligatoire)",
  reasonHint: "Quelques mots, comme « Oubli de pointer le départ ».",
  save: "Enregistrer",
  cancel: "Annuler",
  change: "Modifier",
  reset: "Revenir aux heures pointées",
  adjusted: "Modifié",
  was: "avant",
  in: "Arrivée",
  out: "Départ",
  noCheckIn: "Aucun pointage",
  missedOut: "Départ non pointé",
  flagged: "Le membre du personnel dit que ce jour est faux",
  locked: "Déjà payé. Un changement ici sera ajouté à la prochaine paie.",
  checks: "Avant d’approuver",
  allClear: "Rien à corriger pour cette personne.",
  preview: "Aperçu de tous les talons de paie",
  approve: "Approuver la paie",
  approving: "Approbation…",
  approved: "Paie approuvée. Les talons sont enregistrés. Envoyez l’argent de votre banque.",
  blocked: "Corrigez d’abord les points en rouge.",
  pack: "Dossier pour le comptable",
  packLead: "Fichiers CSV et une page à imprimer pour votre comptable.",
  packEmpty: "Aucune paie approuvée pour ces dates.",
  estimateTag: "Estimation",
  unverifiedTag: "À vérifier",
  source: "Source officielle",
  asOf: "vérifié le",
  loading: "Chargement de la paie…",
  problem: "Impossible de charger. Vérifiez votre connexion et réessayez.",
  retry: "Réessayer",
  stale: "Quelqu’un vient de changer ceci. Nous avons chargé la version la plus récente. Réessayez.",
  permission: "Seul le propriétaire ou une personne autorisée peut changer la paie.",
  saved: "Enregistré.",
  myHours: "Mes heures",
  myLead: "Vos heures selon le pointage. Si un jour est faux, dites-le au propriétaire.",
  flag: "Ce jour est faux",
  flagNote: "Qu’est-ce qui est faux?",
  flagSend: "Avertir le propriétaire",
  flagSaved: "Enregistré. Le propriétaire le verra au jour de paie.",
  notOnPay: "Vous n’êtes pas encore sur la liste de paie de ce centre. Demandez au propriétaire.",
  wageAsOf: "Salaires minimums en date du",
  wageNote: "Les taux changent, en général une fois par année. KidEase utilise le taux en vigueur chaque jour travaillé.",
  bonus: "Prime (facultatif)",
  bonusTax: "Impôt sur la prime",
  bonusHint: "Laissez vide s’il n’y a pas de prime.",
  student: "Aux études (salaire minimum)",
  editors: "Qui peut faire la paie",
  editorsLead: "Les personnes ajoutées ici peuvent tout faire au jour de paie, y compris approuver. Chaque changement indique qui l’a fait.",
  editorAdd: "Donner l’accès à la paie",
  editorRemove: "Retirer",
  editorNone: "Vous seul pouvez faire la paie pour l’instant.",
  editorPick: "Choisir un membre de l’équipe",
};

export function paydayCopy(locale: "en" | "fr"): PaydayCopy {
  return locale === "fr" ? FR : EN;
}

export const PAYDAY_COPY_KEYS = Object.keys(EN) as (keyof typeof EN)[];

type CheckCode =
  | "missing_td1"
  | "over_60_hours"
  | "under_minimum_wage"
  | "minimum_wage_unverified"
  | "missed_checkout"
  | "zero_pay"
  | "mid_period_start"
  | "mid_period_end"
  | "overtime_unverified"
  | "vacation_below_law"
  | "flagged_day"
  | "no_table"
  | "student_rate";

const CHECK_EN: Record<CheckCode, string> = {
  missing_td1: "No approved TD1. CRA's basic amount is used until it is in.",
  over_60_hours: "More than 60 hours in one week. Check the days.",
  under_minimum_wage: "The rate is under the province's minimum wage.",
  minimum_wage_unverified: "KidEase has no minimum wage on file for this date. Check the official page.",
  missed_checkout: "A day has no check-out. Fix that day first.",
  zero_pay: "Pay is $0 for this period.",
  mid_period_start: "Started during this period. Check the first day.",
  mid_period_end: "Left during this period. Check the last day and the ROE.",
  overtime_unverified: "Over 40 hours in a week. We could not confirm the overtime rule for this province. Check the official page.",
  vacation_below_law: "Vacation pay is lower than the law asks for after these years.",
  flagged_day: "Staff flagged a day as wrong.",
  no_table: "KidEase cannot work out this pay. Nothing is shown as final.",
  student_rate: "You marked this person as a student. The student minimum wage is used.",
};

const CHECK_FR: Record<CheckCode, string> = {
  missing_td1: "Aucun TD1 approuvé. Le montant de base de l’ARC est utilisé en attendant.",
  over_60_hours: "Plus de 60 heures dans une semaine. Vérifiez les jours.",
  under_minimum_wage: "Le taux est sous le salaire minimum de la province.",
  minimum_wage_unverified: "KidEase n’a pas de salaire minimum pour cette date. Vérifiez la page officielle.",
  missed_checkout: "Un jour n’a pas de départ pointé. Corrigez ce jour d’abord.",
  zero_pay: "La paie est de 0 $ pour cette période.",
  mid_period_start: "A commencé pendant cette période. Vérifiez le premier jour.",
  mid_period_end: "A quitté pendant cette période. Vérifiez le dernier jour et le RE.",
  overtime_unverified: "Plus de 40 heures dans une semaine. Nous n’avons pas pu confirmer la règle des heures supplémentaires. Vérifiez la page officielle.",
  vacation_below_law: "La paie de vacances est plus basse que ce que la loi demande après ces années.",
  flagged_day: "Le personnel a signalé un jour faux.",
  no_table: "KidEase ne peut pas calculer cette paie. Rien n’est affiché comme final.",
  student_rate: "Vous avez indiqué que cette personne est aux études. Le salaire minimum étudiant est utilisé.",
};

export function checkWords(code: CheckCode, locale: "en" | "fr"): string {
  return (locale === "fr" ? CHECK_FR : CHECK_EN)[code];
}

function cad(cents: number, locale: "en" | "fr"): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

function longDate(date: string, locale: "en" | "fr"): string {
  if (locale === "fr" && date.endsWith("-01")) {
    const month = new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-CA", { month: "long", timeZone: "UTC" });
    return `1er ${month} ${date.slice(0, 4)}`;
  }
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** A check with its numbers filled in (minimum wage names the rate and the day). */
export function checkText(check: { code: CheckCode; amountCents?: number; date?: string; detail?: string }, locale: "en" | "fr"): string {
  if (check.code === "under_minimum_wage" && check.amountCents != null && check.date) {
    const rate = check.detail ? cad(Number(check.detail), locale) : "";
    return locale === "fr"
      ? `Le taux${rate ? ` de ${rate}` : ""} est sous le salaire minimum de ${cad(check.amountCents, locale)} l’heure en vigueur le ${longDate(check.date, locale)}. Corrigez le taux avant d’approuver.`
      : `The rate${rate ? ` of ${rate}` : ""} is under the ${cad(check.amountCents, locale)} an hour minimum wage in force on ${longDate(check.date, locale)}. Fix the rate before you approve.`;
  }
  if (check.code === "student_rate" && check.amountCents != null) {
    return locale === "fr"
      ? `Taux étudiant utilisé : ${cad(check.amountCents, locale)} l’heure. Vous avez indiqué que cette personne est aux études.`
      : `Student rate used: ${cad(check.amountCents, locale)} an hour. You marked this person as a student.`;
  }
  return checkWords(check.code, locale);
}

/** Error code from a server function ("payroll:stale") to plain words. */
export function payErrorWords(message: string, locale: "en" | "fr"): string {
  const copy = paydayCopy(locale);
  const code = message.startsWith("payroll:") ? message.slice(8) : "";
  if (code === "stale") return copy.stale;
  if (code === "permission" || code === "owner_only") return copy.permission;
  if (code === "reason") return copy.reasonHint;
  if (code === "preflight") return copy.blocked;
  return copy.problem;
}

/** A two-week period ending last Saturday, paid the Friday after. */
export function defaultPeriod(today: string): { start: string; end: string; payDate: string } {
  const d = new Date(`${today}T12:00:00Z`);
  const back = (d.getUTCDay() + 1) % 7 || 7;
  const end = new Date(d.getTime() - back * 86_400_000);
  const start = new Date(end.getTime() - 13 * 86_400_000);
  const pay = new Date(end.getTime() + 6 * 86_400_000);
  const f = (x: Date) => x.toISOString().slice(0, 10);
  return { start: f(start), end: f(end), payDate: f(pay) };
}
