/**
 * B04: server errors were thrown in English and shown as-is on /fr pages.
 * Map the user-facing ones to French on the client. An unknown English
 * message on a French page falls back to a plain French line, never English.
 */
import { RUNTIME_SWITCH_KEYS, runtimeSwitchCopy } from "./runtime-switches.ts";

const FR: Record<string, string> = {
  "This listing is not open for a waitlist.": "Cette fiche n’accepte pas encore de liste d’attente.",
  "Choose an age group.": "Choisissez un groupe d’âge.",
  "You are not on this waitlist.": "Vous n’êtes pas sur cette liste d’attente.",
  "That family is not waiting.": "Cette famille n’est pas en attente.",
  "This offer has ended.": "Cette offre est terminée.",
  "Waitlist already pulsed for this spot event. Try again after the cooldown.":
    "La liste d’attente a déjà été avisée pour cette place. Réessayez plus tard.",
  "Pick at least one preferred time": "Choisissez au moins une heure.",
  "Pick a valid date and time": "Choisissez une date et une heure valides.",
  "Pick a different posted tour time": "Choisissez une autre heure de visite affichée.",
  "Pick a date, start time, and end time": "Choisissez une date, une heure de début et une heure de fin.",
  "That tour time is full. Pick another.": "Cette heure de visite est complète. Choisissez-en une autre.",
  "That tour time is no longer available.": "Cette heure de visite n’est plus offerte.",
  "You already asked for this tour time.": "Vous avez déjà demandé cette heure de visite.",
  "Tour time not found": "Heure de visite introuvable.",
  "Tour request not found": "Demande de visite introuvable.",
  "This tour request expired": "Cette demande de visite a expiré.",
  "This tour request was already answered": "On a déjà répondu à cette demande de visite.",
  "This tour request was already answered or expired": "On a déjà répondu à cette demande de visite, ou elle a expiré.",
  "This tour request changed or expired. Refresh and try again.":
    "Cette demande de visite a changé ou a expiré. Actualisez la page et réessayez.",
  "This tour cannot be cancelled": "Cette visite ne peut pas être annulée.",
  "This tour cannot be rescheduled": "Cette visite ne peut pas être déplacée.",
  "This tour cannot move to that status": "Cette visite ne peut pas passer à ce statut.",
  "Add a reason so the parent knows why this tour was declined":
    "Ajoutez une raison pour que le parent sache pourquoi la visite est refusée.",
  "This request was already answered": "On a déjà répondu à cette demande.",
  "Please enter your name, phone, and email.": "Entrez votre nom, votre téléphone et votre courriel.",
  "Please enter your name and email.": "Entrez votre nom et votre courriel.",
  "Please enter your first name, last name, phone, and email.":
    "Entrez votre prénom, votre nom, votre téléphone et votre courriel.",
  "Please enter your first name, last name, and email.": "Entrez votre prénom, votre nom et votre courriel.",
  "Could not save request": "La demande n’a pas pu être enregistrée.",
  "Invalid request type": "Type de demande non valide.",
  "Listing not found": "Fiche introuvable.",
  "Centre not found": "Centre introuvable.",
  "Missing listing": "Fiche manquante.",
  "This listing is not on your desk.": "Cette fiche n’est pas sur votre bureau.",
  "This link is not valid.": "Ce lien n’est pas valide.",
  "Not authorized": "Vous n’avez pas accès à cette action.",
  "Enter a valid email address.": "Entrez une adresse courriel valide.",
  "Conversation not found": "Conversation introuvable.",
  "The request took too long. Try again.": "La demande a pris trop de temps. Réessayez.",
  "That child is not enrolled on this account.": "Cet enfant n’est pas inscrit sur ce compte.",
  "There is no absence report to cancel.": "Il n’y a aucune absence à annuler.",
};

export const API_ERROR_FALLBACK_FR = "Ça n’a pas fonctionné. Réessayez dans un instant.";

function normal(message: string): string {
  return message.trim().replace(/\s+/g, " ");
}

function switchFr(message: string): string | null {
  for (const key of RUNTIME_SWITCH_KEYS) {
    if (normal(runtimeSwitchCopy(key, "en").body) === message) return runtimeSwitchCopy(key, "fr").body;
  }
  return null;
}

/** Looks French already (accents or common French words), so leave it. */
function looksFrench(message: string): boolean {
  return /[àâçéèêëîïôûùüÿœ’]/i.test(message) || /\b(le|la|les|une|des|vous|votre|est)\b/i.test(message);
}

export function localizeApiError(message: string | null | undefined, locale: string | null | undefined): string {
  const raw = normal(String(message || ""));
  if (locale !== "fr") return raw;
  if (!raw) return API_ERROR_FALLBACK_FR;
  const hit = FR[raw] ?? FR[raw.replace(/\.$/, "")] ?? FR[`${raw}.`] ?? switchFr(raw);
  if (hit) return hit;
  return looksFrench(raw) ? raw : API_ERROR_FALLBACK_FR;
}

/** Message from an unknown thrown value, in the page language. */
export function apiErrorMessage(err: unknown, locale: string | null | undefined, fallback?: string): string {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!message && fallback) return fallback;
  return localizeApiError(message, locale);
}
