/**
 * Daycare drafts for the AI suite. Flags default off.
 * Nothing here sends mail, text, or a phone call, and nothing spends money.
 */

export const AI_SUITE_FLAGS = [
  "FEATURE_AI_TOUR_FOLLOWUP",
  "FEATURE_AI_PHONE_RECEPTION",
  "FEATURE_AI_LEAD_SCORE",
  "FEATURE_AI_WAITLIST_FILL",
  "FEATURE_AI_POST_WRITER",
  "FEATURE_AI_DAILY_UPDATE",
  "FEATURE_AI_REVIEW_REQUEST",
  "FEATURE_AI_SMART_STAFFING",
] as const;

export type AiSuiteFlag = (typeof AI_SUITE_FLAGS)[number];

export type SuiteLocale = "en" | "fr";

export type DraftResult = {
  enabled: boolean;
  sent: false;
  body: string;
};

function off(): DraftResult {
  return { enabled: false, sent: false, body: "" };
}

function draft(locale: SuiteLocale, en: string, fr: string): DraftResult {
  return { enabled: true, sent: false, body: locale === "fr" ? fr : en };
}

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function tourFollowUpDraft(input: {
  enabled: boolean;
  locale?: SuiteLocale;
  centre: string;
  parentName: string;
  visited: boolean;
}): DraftResult {
  if (!input.enabled || !input.visited) return off();
  const centre = cleanName(input.centre);
  const parent = cleanName(input.parentName);
  if (!centre || !parent) return off();
  return draft(
    input.locale === "fr" ? "fr" : "en",
    `Hi ${parent}. Thank you for visiting ${centre}. Reply here if you still have a question about a space.`,
    `Bonjour ${parent}. Merci d’avoir visité ${centre}. Répondez ici si vous avez encore une question sur une place.`,
  );
}

export type PhoneReception = {
  enabled: boolean;
  callPlaced: false;
  paidService: false;
  script: string;
};

/** A script the centre can read. No call is placed and no paid phone line is used. */
export function phoneReceptionScript(input: {
  enabled: boolean;
  locale?: SuiteLocale;
  centre: string;
  hours: string | null;
}): PhoneReception {
  const base = { callPlaced: false as const, paidService: false as const };
  if (!input.enabled) return { ...base, enabled: false, script: "" };
  const centre = cleanName(input.centre);
  const hours = cleanName(input.hours || "");
  if (!centre) return { ...base, enabled: false, script: "" };
  const fr = input.locale === "fr";
  const hoursLine = hours
    ? fr
      ? ` Les heures affichées sont : ${hours}.`
      : ` The posted hours are: ${hours}.`
    : fr
      ? " Les heures ne sont pas sur cette fiche."
      : " Hours are not on this listing.";
  return {
    ...base,
    enabled: true,
    script: fr
      ? `Bonjour, vous avez joint ${centre}.${hoursLine} Une personne du centre vous rappellera. Cet appel n’est pas passé par KidEase.`
      : `Hello, you have reached ${centre}.${hoursLine} A person at the centre will call you back. KidEase did not place this call.`,
  };
}

export type LeadBand = "new" | "talking" | "visited" | "enrolled";

export function leadScore(input: {
  enabled: boolean;
  messages: number;
  tours: number;
  enrolled: boolean;
}): { enabled: boolean; band: LeadBand | null } {
  if (!input.enabled) return { enabled: false, band: null };
  if (input.enrolled) return { enabled: true, band: "enrolled" };
  if (input.tours > 0) return { enabled: true, band: "visited" };
  if (input.messages > 0) return { enabled: true, band: "talking" };
  return { enabled: true, band: "new" };
}

export function waitlistFillDraft(input: {
  enabled: boolean;
  locale?: SuiteLocale;
  centre: string;
  openSpots: number;
  nextFamily: string;
}): DraftResult {
  if (!input.enabled || input.openSpots < 1) return off();
  const centre = cleanName(input.centre);
  const family = cleanName(input.nextFamily);
  if (!centre || !family) return off();
  return draft(
    input.locale === "fr" ? "fr" : "en",
    `${centre} has a posted open spot. The next family on the list you typed is ${family}. This draft is not an offer and nothing was sent.`,
    `${centre} a une place affichée. La prochaine famille sur la liste que vous avez écrite est ${family}. Ce brouillon n’est pas une offre et rien n’a été envoyé.`,
  );
}

export function postDraft(input: {
  enabled: boolean;
  locale?: SuiteLocale;
  centre: string;
  fact: string;
}): DraftResult {
  if (!input.enabled) return off();
  const centre = cleanName(input.centre);
  const fact = cleanName(input.fact);
  if (!centre || !fact) return off();
  return draft(
    input.locale === "fr" ? "fr" : "en",
    `Draft for ${centre}: ${fact} Edit this before you post it. KidEase does not post it for you.`,
    `Brouillon pour ${centre} : ${fact} Modifiez-le avant de le publier. KidEase ne le publie pas pour vous.`,
  );
}

export function dailyUpdateDraft(input: {
  enabled: boolean;
  locale?: SuiteLocale;
  childName: string;
  note: string;
}): DraftResult {
  if (!input.enabled) return off();
  const child = cleanName(input.childName);
  const note = cleanName(input.note);
  if (!child || !note) return off();
  return draft(
    input.locale === "fr" ? "fr" : "en",
    `Draft for ${child}'s family: ${note} Nothing was sent.`,
    `Brouillon pour la famille de ${child} : ${note} Rien n’a été envoyé.`,
  );
}

export function reviewRequestDraft(input: {
  enabled: boolean;
  locale?: SuiteLocale;
  centre: string;
  parentName: string;
  visited: boolean;
}): DraftResult {
  if (!input.enabled || !input.visited) return off();
  const centre = cleanName(input.centre);
  const parent = cleanName(input.parentName);
  if (!centre || !parent) return off();
  return draft(
    input.locale === "fr" ? "fr" : "en",
    `Hi ${parent}. If you want to, you can write your own note about your visit to ${centre}. KidEase does not write a rating for you, and this note was not sent.`,
    `Bonjour ${parent}. Si vous voulez, vous pouvez écrire votre propre note sur votre visite à ${centre}. KidEase n’écrit pas une note à votre place, et ce message n’a pas été envoyé.`,
  );
}

export function smartStaffingNote(input: {
  enabled: boolean;
  locale?: SuiteLocale;
  room: string;
  children: number;
  educators: number;
}): DraftResult {
  if (!input.enabled) return off();
  const room = cleanName(input.room);
  if (!room || input.children < 0 || input.educators < 0) return off();
  const children = Math.floor(input.children);
  const educators = Math.floor(input.educators);
  return draft(
    input.locale === "fr" ? "fr" : "en",
    `${room}: ${children} children and ${educators} educators, from the numbers you typed. This is a KidEase count, not a licensing decision. Nothing was sent.`,
    `${room} : ${children} enfants et ${educators} éducateurs, d’après les chiffres que vous avez écrits. C’est un compte KidEase, pas une décision de permis. Rien n’a été envoyé.`,
  );
}
