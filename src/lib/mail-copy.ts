/**
 * Transactional email subjects and the hidden inbox preheader.
 * Subjects stay in one language. Bodies can add a French line.
 * The preheader is the first preview text, so inboxes do not open on "KidEase KidEase".
 */

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

/** Daycare inbox + admin alert for a parent "request info" note. */
export function infoQuestionMail(parentName: string | null | undefined, centre: string | null | undefined) {
  const who = whoName(parentName);
  const place = centreName(centre);
  return {
    daycareSubject: `New question from ${who} about ${place}`,
    adminSubject: `Parent question: ${place}`,
    preview: `${who} asked a question about ${place}.`,
    previewFr: `${who} a posé une question au sujet de ${place}.`,
  };
}

export function tourRequestMail(parentName: string | null | undefined, centre: string | null | undefined) {
  const who = whoName(parentName);
  const place = centreName(centre);
  return {
    daycareSubject: `New tour request from ${who} for ${place}`,
    adminSubject: `Tour request: ${place}`,
    preview: `${who} asked to visit ${place}.`,
    previewFr: `${who} a demandé une visite à ${place}.`,
  };
}

export function spotRequestMail(parentName: string | null | undefined, centre: string | null | undefined, childName?: string | null) {
  const who = whoName(parentName);
  const place = centreName(centre);
  const child = (childName || "").replace(/\s+/g, " ").trim();
  const about = child ? `${child} at ${place}` : place;
  return {
    daycareSubject: `New spot request from ${who} for ${about}`,
    adminSubject: `Spot request: ${place}`,
    preview: child
      ? `${who} asked about a spot for ${child} at ${place}.`
      : `${who} asked about a spot at ${place}.`,
    previewFr: child
      ? `${who} a demandé une place pour ${child} à ${place}.`
      : `${who} a demandé une place à ${place}.`,
  };
}

export function waitlistRequestMail(parentName: string | null | undefined, centre: string | null | undefined) {
  const who = whoName(parentName);
  const place = centreName(centre);
  return {
    daycareSubject: `New waitlist request from ${who} for ${place}`,
    adminSubject: `Waitlist request: ${place}`,
    preview: `${who} asked to join the waitlist at ${place}.`,
    previewFr: `${who} a demandé à joindre la liste d’attente de ${place}.`,
  };
}

export function leadReplyMail(status: string, centre: string | null | undefined) {
  const place = centreName(centre);
  if (status === "confirmed") {
    return {
      subject: `${place} confirmed your request`,
      adminSubject: `Request confirmed at ${place}`,
      preview: `${place} confirmed your request.`,
      previewFr: `${place} a confirmé votre demande.`,
    };
  }
  if (status === "declined") {
    return {
      subject: `${place} could not take this request`,
      adminSubject: `Request declined at ${place}`,
      preview: `${place} could not take this request.`,
      previewFr: `${place} n’a pas pu accepter cette demande.`,
    };
  }
  return {
    subject: `${place} replied to your request`,
    adminSubject: `Request answered at ${place}`,
    preview: `${place} replied to your request.`,
    previewFr: `${place} a répondu à votre demande.`,
  };
}

export function employeeInviteMail(centre: string | null | undefined, roleLabel: string) {
  const place = centreName(centre);
  const role = roleLabel.replace(/\s+/g, " ").trim() || "staff";
  return {
    subject: `Join ${place} on KidEase`,
    preheader: `You are invited to help at ${place} as ${role}.`,
    preheaderFr: `Vous êtes invité(e) à aider ${place} en tant que ${role}.`,
  };
}

export function waitlistStatusSubject(centre: string | null | undefined): string {
  return `${centreName(centre)} updated your spot request`;
}
