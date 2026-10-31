/**
 * ECE roles on a centre profile. No fee and no subscription.
 */

export const ECE_ROLE_MAX = 80;
export const ECE_NOTE_MAX = 280;

export function cleanEceRole(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, ECE_ROLE_MAX);
}

export function cleanEceNote(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, ECE_NOTE_MAX);
}

export function ecePostReady(role: string): boolean {
  return cleanEceRole(role).length >= 2;
}

export const ECE_JOB_COPY = {
  en: {
    title: "Jobs at this centre",
    post: "Post a role",
    role: "Role",
    note: "Short note",
    send: "Post role",
    posted: "Role posted on your listing.",
    apply: "Apply",
    applied: "Application sent to the centre.",
    applicants: "Applicants",
    empty: "No applications yet.",
    off: "The job board is not open yet.",
    help: "Help",
    signIn: "Sign in to apply",
  },
  fr: {
    title: "Emplois à ce centre",
    post: "Publier un poste",
    role: "Poste",
    note: "Courte note",
    send: "Publier",
    posted: "Poste publié sur votre fiche.",
    apply: "Postuler",
    applied: "Candidature envoyée au centre.",
    applicants: "Candidatures",
    empty: "Aucune candidature pour l'instant.",
    off: "Le tableau d'emplois n'est pas ouvert.",
    help: "Aide",
    signIn: "Connectez-vous pour postuler",
  },
} as const;

export function eceJobCopy(locale: "en" | "fr") {
  return locale === "fr" ? ECE_JOB_COPY.fr : ECE_JOB_COPY.en;
}
