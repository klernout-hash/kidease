/**
 * Answers a parent only from facts already on the listing, and books only a
 * real open tour slot. Anything else is handed to a person. No model call.
 */
import { scrubText } from "./pii.ts";

export type TourAssistantSlot = {
  id: string;
  label: string;
  remaining: number;
  date: string;
  time: string;
};

export type TourAssistantFacts = {
  centre: string;
  hours: string | null;
  ages: string | null;
  fees: string | null;
  openings: string | null;
  slots: readonly TourAssistantSlot[];
};

export type TourAssistantReply =
  | { kind: "answer"; text: string }
  | { kind: "book"; slotId: string; text: string }
  | { kind: "handoff"; text: string };

export function tourAssistantFactsFromListing(input: {
  centre: string;
  locale?: "en" | "fr";
  hours?: string | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  slots: readonly TourAssistantSlot[];
}): TourAssistantFacts {
  const fr = input.locale === "fr";
  const fees = [
    input.infantMonthly != null ? `${fr ? "poupon" : "infant"} ${input.infantMonthly}` : "",
    input.toddlerMonthly != null ? `${fr ? "tout-petit" : "toddler"} ${input.toddlerMonthly}` : "",
    input.preschoolMonthly != null ? `${fr ? "préscolaire" : "preschool"} ${input.preschoolMonthly}` : "",
  ].filter(Boolean);
  const ages =
    input.ageMinMonths != null && input.ageMaxMonths != null && (input.ageMinMonths > 0 || input.ageMaxMonths > 0)
      ? `${input.ageMinMonths}-${input.ageMaxMonths} ${fr ? "mois" : "months"}`
      : null;
  return {
    centre: input.centre,
    hours: (input.hours || "").trim() || null,
    ages,
    fees: fees.length ? fees.join(", ") : null,
    openings: null,
    slots: input.slots,
  };
}

const HOURS = /\b(hours?|heures?|ouvert|open)\b/i;
const AGES = /\b(ages?|âge|ages|infant|toddler|preschool|bébé|poupon|enfant)\b/i;
const FEES = /\b(fees?|frais|prix|price|cost|coût|monthly|mensuel)\b/i;
const OPENINGS = /\b(openings?|spots?|places?|disponib|vacanc)/i;
const BOOK = /\b(book|tour|visite|réserver|reserver|visit)\b/i;

function handoff(locale: "en" | "fr"): TourAssistantReply {
  return {
    kind: "handoff",
    text:
      locale === "fr"
        ? "Je n’ai pas cette information sur la fiche. Une personne du centre va répondre."
        : "I don’t have that on this listing. A person at the centre will reply.",
  };
}

function answer(locale: "en" | "fr", label: string, value: string): TourAssistantReply {
  return {
    kind: "answer",
    text: locale === "fr" ? `${label} : ${value}` : `${label}: ${value}`,
  };
}

export function answerTourAssistant(input: {
  facts: TourAssistantFacts;
  question: string;
  locale?: "en" | "fr";
}): TourAssistantReply {
  const locale = input.locale === "fr" ? "fr" : "en";
  const question = scrubText(input.question).replace(/\s+/g, " ").trim();
  if (!question) return handoff(locale);
  const centre = input.facts.centre.trim() || (locale === "fr" ? "Ce centre" : "This centre");

  if (BOOK.test(question)) {
    const open = input.facts.slots.filter((slot) => slot.remaining > 0 && slot.id && slot.date && slot.time);
    const named = open.find((slot) => question.toLowerCase().includes(slot.label.toLowerCase()) || question.includes(slot.date));
    const namesATime = /\d/.test(question) || /\b(mon|tue|wed|thu|fri|sat|sun|lundi|mardi|mercredi|jeudi|vendredi)\b/i.test(question);
    const slot = named || (!namesATime && open.length === 1 ? open[0] : null);
    if (!slot) return handoff(locale);
    return {
      kind: "book",
      slotId: slot.id,
      text:
        locale === "fr"
          ? `Je peux réserver ${slot.label} à ${centre}. Confirmez pour l’envoyer au centre.`
          : `I can book ${slot.label} at ${centre}. Confirm to send it to the centre.`,
    };
  }
  if (FEES.test(question)) {
    if (!input.facts.fees) return handoff(locale);
    return answer(locale, locale === "fr" ? "Frais affichés" : "Posted fees", input.facts.fees);
  }
  if (HOURS.test(question)) {
    if (!input.facts.hours) return handoff(locale);
    return answer(locale, locale === "fr" ? "Heures affichées" : "Posted hours", input.facts.hours);
  }
  if (AGES.test(question)) {
    if (!input.facts.ages) return handoff(locale);
    return answer(locale, locale === "fr" ? "Âges affichés" : "Posted ages", input.facts.ages);
  }
  if (OPENINGS.test(question)) {
    if (!input.facts.openings) return handoff(locale);
    return answer(locale, locale === "fr" ? "Places affichées" : "Posted openings", input.facts.openings);
  }
  return handoff(locale);
}
