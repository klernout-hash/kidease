import type { Locale, Schedule } from "./types";
import { localeTag } from "./languages";
import { monthsBetween } from "./utils";

export function formatAgeLabel(birthdate: string, locale: Locale) {
  const months = Math.max(0, monthsBetween(birthdate));
  if (months < 24) return locale === "fr" ? `${months} mois` : `${months} months`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (locale === "fr") return rem ? `${years} ans ${rem} mois` : `${years} ans`;
  return rem ? `${years} yr ${rem} mo` : `${years} years`;
}

export function scheduleLabel(schedule: Schedule, days: string | null | undefined, locale: Locale) {
  if (schedule === "custom") {
    return days?.trim() || (locale === "fr" ? "Jours précis" : "Specific days");
  }
  if (schedule === "part") return locale === "fr" ? "Temps partiel" : "Part-time";
  return locale === "fr" ? "Temps plein" : "Full-time";
}

export function formatStart(iso: string, locale: Locale) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(localeTag(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type RequestCopy = {
  parentName: string;
  childName: string;
  age: string;
  dob?: string | null;
  daycareName: string;
  start: string;
  schedule: string;
  note?: string | null;
};

export function pushNewRequest(p: RequestCopy, locale: Locale) {
  if (locale === "fr") {
    return {
      title: "Nouvelle demande de place",
      body: `${p.parentName} a demandé une place pour ${p.childName} (${p.age}). Touchez pour voir et répondre.`,
    };
  }
  return {
    title: "New Spot Request",
    body: `${p.parentName} requested a spot for ${p.childName} (${p.age}). Tap to view and respond.`,
  };
}

export function emailSubjectNewRequest(p: RequestCopy, locale: Locale) {
  if (locale === "fr") {
    return `Nouvelle demande de place – ${p.childName} (${p.age}) de ${p.parentName}`;
  }
  return `New Spot Request – ${p.childName} (${p.age}) from ${p.parentName}`;
}

export function emailBodyNewRequest(p: RequestCopy, locale: Locale) {
  const ageDob = p.dob ? `${p.age} (${p.dob})` : p.age;
  if (locale === "fr") {
    return [
      `Bonjour ${p.daycareName},`,
      "",
      "Vous avez reçu une nouvelle demande de place :",
      "",
      `Parent : ${p.parentName}`,
      `Enfant : ${p.childName}`,
      `Âge / date de naissance : ${ageDob}`,
      `Date de début souhaitée : ${p.start}`,
      `Horaire : ${p.schedule}`,
      "",
      "Message du parent :",
      p.note ? `« ${p.note} »` : "—",
      "",
      "Vous pouvez répondre dans l’appli, appeler, envoyer un texto ou lancer un appel vidéo.",
      "",
      "Voir la demande et répondre →",
    ].join("\n");
  }
  return [
    `Hi ${p.daycareName},`,
    "",
    "You have received a new spot request:",
    "",
    `Parent: ${p.parentName}`,
    `Child: ${p.childName}`,
    `Age / DOB: ${ageDob}`,
    `Desired Start Date: ${p.start}`,
    `Schedule: ${p.schedule}`,
    "",
    "Message from parent:",
    p.note ? `“${p.note}”` : "—",
    "",
    "You can reply directly in the app, call, text, or start a video call with the parent.",
    "",
    "View Request & Respond →",
  ].join("\n");
}

export function systemRequestMessage(p: RequestCopy, locale: Locale) {
  if (locale === "fr") {
    return [
      `${p.parentName} a demandé une place pour ${p.childName} (${p.age}).`,
      `Date de début : ${p.start} | Horaire : ${p.schedule}`,
    ].join("\n");
  }
  return [
    `${p.parentName} requested a spot for ${p.childName} (${p.age}).`,
    `Start date: ${p.start} | Schedule: ${p.schedule}`,
  ].join("\n");
}

export function centreAckMessage(p: RequestCopy, locale: Locale) {
  if (locale === "fr") {
    return `Bonjour ${p.parentName} — ici ${p.daycareName}. Nous avons bien reçu la demande pour ${p.childName} et la passerons en revue. Vous pouvez écrire, appeler ou lancer une visio ici.`;
  }
  return `Hi ${p.parentName} — this is ${p.daycareName}. We received your request for ${p.childName} and will review it shortly. You can message, call, or start a video visit right here.`;
}

export function statusUpdateMessage(
  status: "under_review" | "accepted" | "waitlist" | "declined",
  p: RequestCopy,
  locale: Locale,
) {
  if (locale === "fr") {
    if (status === "under_review") {
      return [
        "Mise à jour – En revue",
        `Bonjour ${p.parentName},`,
        `${p.daycareName} a commencé à examiner votre demande pour ${p.childName}.`,
        "Ils vous répondront bientôt.",
      ].join("\n");
    }
    if (status === "accepted") {
      return [
        "Bonne nouvelle ! Place offerte",
        `Bonjour ${p.parentName},`,
        `${p.daycareName} a offert une place pour ${p.childName} à partir du ${p.start}.`,
        "Payez maintenant dans l’application pour confirmer la place. Un reçu sera envoyé aux deux parties.",
      ].join("\n");
    }
    if (status === "waitlist") {
      return [
        "Mise à jour – Liste d’attente",
        `Bonjour ${p.parentName},`,
        `${p.daycareName} a placé ${p.childName} sur la liste d’attente.`,
        "Ils vous contacteront si une place se libère.",
      ].join("\n");
    }
    return [
      "Mise à jour – Place non disponible",
      `Bonjour ${p.parentName},`,
      `Malheureusement, ${p.daycareName} n’est pas en mesure d’offrir une place pour ${p.childName} pour le moment.`,
      "Vous pouvez continuer à chercher d’autres garderies dans l’application.",
    ].join("\n");
  }
  if (status === "under_review") {
    return [
      "Status Update – Under Review",
      `Hi ${p.parentName},`,
      `${p.daycareName} has started reviewing your request for ${p.childName}.`,
      "They will get back to you soon.",
    ].join("\n");
  }
  if (status === "accepted") {
    return [
      "Good news! Spot offered",
      `Hi ${p.parentName},`,
      `${p.daycareName} offered a spot for ${p.childName} starting ${p.start}.`,
      "Pay now in the app to confirm the spot. You’ll both receive a receipt.",
    ].join("\n");
  }
  if (status === "waitlist") {
    return [
      "Status Update – Waitlisted",
      `Hi ${p.parentName},`,
      `${p.daycareName} placed ${p.childName} on the waitlist.`,
      "They will contact you if a spot opens up.",
    ].join("\n");
  }
  return [
    "Status Update – Spot not available",
    `Hi ${p.parentName},`,
    `Unfortunately, ${p.daycareName} isn’t able to offer a spot for ${p.childName} at this time.`,
    "You can keep looking for other daycares in the app.",
  ].join("\n");
}

export function spotConfirmedMessage(p: RequestCopy, locale: Locale) {
  if (locale === "fr") {
    return [
      "Place confirmée !",
      `Bonjour ${p.parentName},`,
      `La place de ${p.childName} chez ${p.daycareName} est maintenant confirmée à partir du ${p.start}.`,
      "Paiement reçu. Conservez ce message comme reçu.",
    ].join("\n");
  }
  return [
    "Spot confirmed!",
    `Hi ${p.parentName},`,
    `${p.childName}'s spot at ${p.daycareName} is now confirmed starting ${p.start}.`,
    "Payment received. Keep this message as your receipt.",
  ].join("\n");
}
