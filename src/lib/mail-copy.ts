/**
 * Transactional email subjects and the hidden inbox preheader.
 * English subjects stay the default. FEATURE_FR_CA adds fr-CA subjects
 * when the saved locale is French. The preheader is the first preview text,
 * so inboxes do not open on "KidEase KidEase".
 */

import { fillFrCa, frCaScreen } from "./fr-ca.ts";
import { frCaEnabled } from "./features.ts";

export type MailLocale = "en" | "fr";

export function mailLocale(value: string | null | undefined): MailLocale {
  return value === "fr" ? "fr" : "en";
}

export function escapeMailHtml(value: string): string {
  return value
    .replace(/&/g, "&#38;")
    .replace(/</g, "&#60;")
    .replace(/>/g, "&#62;")
    .replace(/"/g, "&#34;")
    .replace(/'/g, "&#39;");
}

/** Hidden preview. Must be the first thing in the HTML body. */
export function mailPreheaderHtml(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#fffcf8;">${escapeMailHtml(clean)}</div>`;
}

function whoName(name: string | null | undefined): string {
  const clean = (name || "").replace(/\s+/g, " ").trim();
  return clean || "A parent";
}

function centreName(name: string | null | undefined): string {
  const clean = (name || "").replace(/\s+/g, " ").trim();
  return clean || "your centre";
}

function mailLine(groupKey: string, locale: string | null | undefined, vars: Record<string, string>, english: string): string {
  if (locale !== "fr" || !frCaEnabled()) return english;
  const template = frCaScreen("email", groupKey, "fr", true);
  return template ? fillFrCa(template, vars) : english;
}

/** Daycare inbox + admin alert for a parent "request info" note. */
export function infoQuestionMail(
  parentName: string | null | undefined,
  centre: string | null | undefined,
  locale?: string | null,
) {
  const who = whoName(parentName);
  const place = centreName(centre);
  const vars = { who, place };
  return {
    daycareSubject: mailLine("infoDaycare", locale, vars, `New question from ${who} about ${place}`),
    adminSubject: mailLine("infoAdmin", locale, vars, `Parent question: ${place}`),
    preview: mailLine("infoPreview", locale, vars, `${who} asked a question about ${place}.`),
    previewFr: `${who} a posé une question au sujet de ${place}.`,
  };
}

export function tourRequestMail(
  parentName: string | null | undefined,
  centre: string | null | undefined,
  locale?: string | null,
) {
  const who = whoName(parentName);
  const place = centreName(centre);
  const vars = { who, place };
  return {
    daycareSubject: mailLine("tourDaycare", locale, vars, `New tour request from ${who} for ${place}`),
    adminSubject: mailLine("tourAdmin", locale, vars, `Tour request: ${place}`),
    preview: mailLine("tourPreview", locale, vars, `${who} asked to visit ${place}.`),
    previewFr: `${who} a demandé une visite à ${place}.`,
  };
}

export function spotRequestMail(
  parentName: string | null | undefined,
  centre: string | null | undefined,
  childName?: string | null,
  locale?: string | null,
) {
  const who = whoName(parentName);
  const place = centreName(centre);
  const child = (childName || "").replace(/\s+/g, " ").trim();
  const about = child ? `${child} at ${place}` : place;
  const vars = { who, place };
  const previewEn = child
    ? `${who} asked about a spot for ${child} at ${place}.`
    : `${who} asked about a spot at ${place}.`;
  return {
    daycareSubject: mailLine("spotDaycare", locale, { who, place: about }, `New spot request from ${who} for ${about}`),
    adminSubject: mailLine("spotAdmin", locale, vars, `Spot request: ${place}`),
    preview:
      locale === "fr" && frCaEnabled() && child
        ? `${who} a demandé une place pour ${child} à ${place}.`
        : mailLine("spotPreview", locale, vars, previewEn),
    previewFr: child
      ? `${who} a demandé une place pour ${child} à ${place}.`
      : `${who} a demandé une place à ${place}.`,
  };
}

export function waitlistRequestMail(
  parentName: string | null | undefined,
  centre: string | null | undefined,
  locale?: string | null,
) {
  const who = whoName(parentName);
  const place = centreName(centre);
  const vars = { who, place };
  return {
    daycareSubject: mailLine("waitlistDaycare", locale, vars, `New waitlist request from ${who} for ${place}`),
    adminSubject: mailLine("waitlistAdmin", locale, vars, `Waitlist request: ${place}`),
    preview: mailLine("waitlistPreview", locale, vars, `${who} asked to join the waitlist at ${place}.`),
    previewFr: `${who} a demandé à joindre la liste d’attente de ${place}.`,
  };
}

export function leadReplyMail(status: string, centre: string | null | undefined, locale?: string | null) {
  const place = centreName(centre);
  const vars = { place };
  if (status === "confirmed") {
    const subject = mailLine("confirmed", locale, vars, `${place} confirmed your request`);
    return {
      subject,
      adminSubject: `Request confirmed at ${place}`,
      preview: subject.endsWith(".") ? subject : `${subject}.`,
      previewFr: `${place} a confirmé votre demande.`,
    };
  }
  if (status === "declined") {
    const subject = mailLine("declined", locale, vars, `${place} could not take this request`);
    return {
      subject,
      adminSubject: `Request declined at ${place}`,
      preview: subject.endsWith(".") ? subject : `${subject}.`,
      previewFr: `${place} n’a pas pu accepter cette demande.`,
    };
  }
  const subject = mailLine("replied", locale, vars, `${place} replied to your request`);
  return {
    subject,
    adminSubject: `Request answered at ${place}`,
    preview: subject.endsWith(".") ? subject : `${subject}.`,
    previewFr: `${place} a répondu à votre demande.`,
  };
}

export function employeeInviteMail(centre: string | null | undefined, roleLabel: string, locale?: string | null) {
  const place = centreName(centre);
  const role = roleLabel.replace(/\s+/g, " ").trim() || "staff";
  return {
    subject: mailLine("invite", locale, { place }, `Join ${place} on KidEase`),
    preheader: `You are invited to help at ${place} as ${role}.`,
    preheaderFr: `Vous êtes invité(e) à aider ${place} en tant que ${role}.`,
  };
}

export function waitlistStatusSubject(centre: string | null | undefined, locale?: string | null): string {
  const place = centreName(centre);
  return mailLine("waitlistStatus", locale, { place }, `${place} updated your spot request`);
}
