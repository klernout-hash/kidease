/**
 * Customer-facing notification copy (email + SMS), EN and FR, in one place.
 * Pure: no DB, no env. Every message says who it is about, what happened and
 * what to do next, and is signed by the KidEase team. Texts are one GSM-7
 * segment (160 characters) with a short link and "Reply STOP" (CASL).
 */
import type { BrandedEmailInput, EmailBlock, EmailLocale } from "./email-layout.ts";

export type NoticeLocale = "en" | "fr";
export type NotificationEmail = { subject: string; branded: BrandedEmailInput };

export const NOTICE_ORIGIN = "https://www.kidease.ca";
/** Short host for texts. https is required: plain http on the bare domain is not served. */
export const SMS_ORIGIN = "https://kidease.ca";
export const SMS_MAX = 160;

const UNSUBSCRIBE = `${NOTICE_ORIGIN}/unsubscribe`;

export function noticeLocale(locale: string | null | undefined): NoticeLocale {
  return String(locale || "").toLowerCase().startsWith("fr") ? "fr" : "en";
}

function emailLocale(l: NoticeLocale): EmailLocale {
  return l === "fr" ? "fr" : "en";
}

function prefix(l: NoticeLocale, path: string): string {
  return `${NOTICE_ORIGIN}${l === "fr" ? "/fr" : ""}${path}`;
}

function clean(value: string | null | undefined, max = 80): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function firstName(value: string | null | undefined): string {
  return clean(value, 60).split(" ")[0] || "";
}

// ---------- dates, money, age groups ----------

const PROVINCE_ZONES: Record<string, string> = {
  BC: "America/Vancouver",
  AB: "America/Edmonton",
  SK: "America/Regina",
  MB: "America/Winnipeg",
  ON: "America/Toronto",
  QC: "America/Toronto",
  NB: "America/Halifax",
  NS: "America/Halifax",
  PE: "America/Halifax",
  NL: "America/St_Johns",
  YT: "America/Whitehorse",
  NT: "America/Yellowknife",
  NU: "America/Iqaluit",
};

export function provinceTimeZone(province: string | null | undefined): string {
  return PROVINCE_ZONES[String(province || "").trim().toUpperCase()] || "America/Winnipeg";
}

/** "2026-12-18" -> "Friday, December 18, 2026" / "vendredi 18 décembre 2026". */
export function formatLongDate(day: string | Date | null | undefined, l: NoticeLocale): string {
  const iso = day instanceof Date ? day.toISOString().slice(0, 10) : String(day || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(l === "fr" ? "fr-CA" : "en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** "2026-12-18" -> "Fri, Dec 18" / "ven. 18 déc." (texts). */
export function formatShortDate(day: string | Date | null | undefined, l: NoticeLocale): string {
  const iso = day instanceof Date ? day.toISOString().slice(0, 10) : String(day || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return new Intl.DateTimeFormat(l === "fr" ? "fr-CA" : "en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

/** Deadline in the centre's time zone: "Friday, November 27 at 9:00 p.m. CST". */
export function formatDeadline(at: string | Date, l: NoticeLocale, timeZone = "America/Winnipeg"): string {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const loc = l === "fr" ? "fr-CA" : "en-CA";
  const day = new Intl.DateTimeFormat(loc, { weekday: "long", month: "long", day: "numeric", timeZone }).format(date);
  const time = new Intl.DateTimeFormat(loc, { hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(date);
  return l === "fr" ? `${day} à ${time}` : `${day} at ${time}`;
}

export function formatMoney(cents: number | null | undefined, l: NoticeLocale): string {
  if (cents == null || !Number.isFinite(Number(cents))) return "";
  return new Intl.NumberFormat(l === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency: "CAD" }).format(Number(cents) / 100);
}

const AGE_LABELS: Record<string, { en: string; fr: string }> = {
  infant: { en: "Infant", fr: "Poupons" },
  toddler: { en: "Toddler", fr: "Trottineurs" },
  preschool: { en: "Preschool", fr: "Préscolaire" },
  "school-age": { en: "School age", fr: "Âge scolaire" },
  school: { en: "School age", fr: "Âge scolaire" },
  any: { en: "Any age group", fr: "Tous les groupes d’âge" },
};

export function ageGroupLabel(group: string | null | undefined, l: NoticeLocale): string {
  const row = AGE_LABELS[String(group || "").trim().toLowerCase()];
  return row ? row[l] : clean(group, 40);
}

// ---------- SMS helpers ----------

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";

/** GSM-7 length (extension characters count twice), or null when the text needs Unicode. */
export function gsmLength(text: string): number | null {
  let n = 0;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) n += 1;
    else if (GSM_EXT.includes(ch)) n += 2;
    else return null;
  }
  return n;
}

/** True when the text is one plain SMS segment. */
export function fitsOneSegment(text: string): boolean {
  const n = gsmLength(text);
  return n != null && n <= SMS_MAX;
}

/** Swap characters phones would force into Unicode (curly quotes, dashes, accents outside GSM-7). */
export function gsmSafe(text: string): string {
  const map: Record<string, string> = {
    "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "\u00a0": " ", "\u202f": " ",
    "ê": "e", "ë": "e", "â": "a", "á": "a", "î": "i", "ï": "i", "í": "i", "ô": "o", "ó": "o", "û": "u", "ú": "u",
    "ç": "c", "È": "E", "Ê": "E", "À": "A", "Â": "A", "Î": "I", "Ô": "O", "Û": "U", "œ": "oe", "Œ": "OE",
  };
  return [...String(text || "")].map((ch) => (GSM_BASIC.includes(ch) || GSM_EXT.includes(ch) ? ch : map[ch] ?? "")).join("");
}

export const SMS_STOP = { en: "Reply STOP to opt out.", fr: "Répondez STOP pour vous désabonner." } as const;

/** Every KidEase text names the sender and carries the opt-out line. */
export function withSmsOptOut(body: string, l: NoticeLocale = "en"): string {
  const text = String(body || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const branded = /^kidease\b/i.test(text) ? text : `KidEase: ${text}`;
  return /\bSTOP\b/.test(branded) ? branded : `${branded} ${SMS_STOP[l]}`;
}

/**
 * Build a one-segment text. `variants` go from richest to plainest; the first
 * that fits in 160 GSM-7 characters wins. Names are shortened before falling back.
 */
function fitSms(variants: ((name: string) => string)[], names: string[], l: NoticeLocale): string {
  // Keep the full name if any wording fits; shorten the name only as a last resort.
  for (const name of names) {
    for (const make of variants) {
      const body = gsmSafe(withSmsOptOut(make(name), l));
      if (fitsOneSegment(body)) return body;
    }
  }
  const last = gsmSafe(withSmsOptOut(variants[variants.length - 1](names[names.length - 1]), l));
  return last;
}

function nameSteps(name: string, fallback: string): string[] {
  const full = clean(name, 60);
  const steps = [full];
  for (const max of [40, 30, 22, 16]) {
    if (full.length > max) steps.push(`${full.slice(0, max - 3).trimEnd()}...`);
  }
  steps.push(fallback);
  return [...new Set(steps.filter(Boolean))];
}

// ---------- 1. Weekly open-spots check-in ----------

export type CheckinLinks = Record<0 | 1 | 2 | 3, string>;

export function openSpotsCheckinEmail(input: {
  locale: NoticeLocale;
  centreName: string;
  views: number;
  links: CheckinLinks;
  plansOn?: boolean;
}): NotificationEmail {
  const l = input.locale;
  const name = clean(input.centreName) || (l === "fr" ? "votre centre" : "your centre");
  const views = Math.max(0, Math.round(Number(input.views) || 0));
  const fr = l === "fr";
  const viewLine = fr
    ? views === 0
      ? "Garder vos places à jour aide les bonnes familles à vous trouver."
      : `Des familles ont consulté votre fiche KidEase ${views} fois au cours des 7 derniers jours. Leur dire si vous avez de la place les aide à vous écrire au bon moment.`
    : views === 0
      ? "Keeping your openings current helps the right families find you."
      : `Families looked at your KidEase listing ${views === 1 ? "once" : `${views} times`} in the last 7 days. Letting them know whether you have room helps them reach out at the right time.`;
  const blocks: EmailBlock[] = [
    { kind: "p", text: viewLine },
    {
      kind: "choices",
      label: fr ? "Combien de places avez-vous en ce moment?" : "How many spots do you have open right now?",
      items: [
        { label: "0", href: input.links[0] },
        { label: "1", href: input.links[1] },
        { label: "2", href: input.links[2] },
        { label: "3+", href: input.links[3] },
      ],
      hint: fr
        ? "Un seul clic met votre fiche à jour, sans connexion. Vous pourrez préciser par groupe d’âge à l’étape suivante."
        : "One tap updates your listing, no sign-in needed. You can add details by age group on the next page.",
    },
  ];
  if (input.plansOn)
    blocks.push({ kind: "note", text: fr ? "Ce rappel hebdomadaire est inclus dans tous les forfaits." : "This weekly check-in is included with every plan." });
  const subject = fr ? `Des places libres à ${name} cette semaine?` : `Any open spots at ${name} this week?`;
  return {
    subject,
    branded: {
      locale: emailLocale(l),
      preheader: fr ? "Un clic pour mettre vos places à jour." : "One tap keeps your listing up to date.",
      heading: subject,
      greeting: fr ? "Bonjour," : "Hi there,",
      blocks,
      reason: fr
        ? `Vous recevez ce rappel hebdomadaire parce que vous gérez ${name} sur KidEase.`
        : `You’re getting this weekly check-in because you manage ${name} on KidEase.`,
      unsubscribeUrl: UNSUBSCRIBE,
      origin: NOTICE_ORIGIN,
    },
  };
}

export function openSpotsCheckinSms(input: { locale: NoticeLocale; centreName: string; url: string }): string {
  const l = input.locale;
  const url = input.url;
  const fallback = l === "fr" ? "votre centre" : "your centre";
  const variants =
    l === "fr"
      ? [(n: string) => `KidEase : Des places libres à ${n} cette semaine? Mettez à jour en un clic : ${url}`, (n: string) => `KidEase : Des places libres à ${n}? ${url}`]
      : [
          (n: string) => `KidEase: Any open spots at ${n} this week? Update in one tap: ${url}`,
          (n: string) => `KidEase: Any open spots at ${n}? Update: ${url}`,
          (n: string) => `KidEase: Open spots at ${n}? ${url}`,
        ];
  return fitSms(variants, nameSteps(input.centreName, fallback), l);
}

// ---------- 2. Spot offer (to the parent) ----------

export function spotOfferEmail(input: {
  locale: NoticeLocale;
  parentName?: string | null;
  childName?: string | null;
  centreName: string;
  ageGroup?: string | null;
  startDate?: string | null;
  expiresAt: string;
  province?: string | null;
  href: string;
}): NotificationEmail {
  const l = input.locale;
  const fr = l === "fr";
  const centre = clean(input.centreName) || (fr ? "Un centre" : "A centre");
  const child = clean(input.childName, 60);
  const who = child || (fr ? "votre enfant" : "your child");
  const deadline = formatDeadline(input.expiresAt, l, provinceTimeZone(input.province));
  const start = formatLongDate(input.startDate, l);
  const first = firstName(input.parentName);
  const subject = fr ? `${centre} a une place pour ${who}` : `${centre} has a spot for ${who}`;
  return {
    subject,
    branded: {
      locale: emailLocale(l),
      preheader: fr ? `Répondez avant ${deadline}.` : `Please answer by ${deadline}.`,
      heading: fr ? `Une place s’est libérée pour ${who}` : `A spot opened up for ${who}`,
      greeting: fr ? (first ? `Bonjour ${first},` : "Bonjour,") : first ? `Hi ${first},` : "Hi there,",
      blocks: [
        {
          kind: "p",
          text: fr
            ? `Bonne nouvelle : ${centre} offre une place à ${who}, à partir de sa liste d’attente sur KidEase.`
            : `Good news: ${centre} is offering ${who} a spot from its KidEase waitlist.`,
        },
        {
          kind: "details",
          rows: [
            { label: fr ? "Enfant" : "Child", value: child },
            { label: fr ? "Centre" : "Centre", value: centre },
            { label: fr ? "Programme" : "Program", value: ageGroupLabel(input.ageGroup, l) },
            { label: fr ? "Date de début souhaitée" : "Requested start date", value: start },
            { label: fr ? "Répondez avant" : "Answer by", value: deadline },
          ],
        },
        {
          kind: "p",
          text: fr
            ? "Acceptez ou refusez en un clic. Si vous acceptez, le centre vous contactera pour confirmer les détails de l’inscription."
            : "Accept or decline in one tap. If you accept, the centre will contact you to confirm enrolment details.",
        },
        {
          kind: "note",
          text: fr
            ? `Sans réponse d’ici ${deadline}, l’offre prend fin et la place est offerte à la famille suivante sur la liste d’attente.`
            : `If we don’t hear from you by ${deadline}, the offer ends and the spot goes to the next family on the waitlist.`,
        },
      ],
      cta: { label: fr ? "Voir l’offre et répondre" : "View offer and reply", href: input.href },
      reason: fr
        ? `Vous recevez ce courriel parce que ${who} est sur la liste d’attente de ${centre} sur KidEase.`
        : `You’re getting this because ${who} is on the ${centre} waitlist on KidEase.`,
      unsubscribeUrl: UNSUBSCRIBE,
      origin: NOTICE_ORIGIN,
    },
  };
}

// ---------- 3. Withdrawal notice (to the centre) ----------

export type WithdrawalFacts = {
  locale: NoticeLocale;
  parentName?: string | null;
  childName?: string | null;
  centreName: string;
  lastDay: string;
  reason?: string | null;
  href?: string;
};

function withdrawalWho(f: WithdrawalFacts) {
  const fr = f.locale === "fr";
  const parent = clean(f.parentName, 60) || (fr ? "Une famille" : "A family");
  const child = clean(f.childName, 60);
  return { parent, child, childOr: child || (fr ? "leur enfant" : "their child") };
}

export function withdrawalNoticeEmail(f: WithdrawalFacts): NotificationEmail {
  const l = f.locale;
  const fr = l === "fr";
  const { parent, child, childOr } = withdrawalWho(f);
  const centre = clean(f.centreName) || (fr ? "votre centre" : "your centre");
  const last = formatLongDate(f.lastDay, l);
  const reason = clean(f.reason, 300);
  const subject = fr
    ? `Préavis de départ : ${child || parent} quitte ${centre}`
    : `Withdrawal notice: ${child || parent} is leaving ${centre}`;
  return {
    subject,
    branded: {
      locale: emailLocale(l),
      preheader: fr ? `Dernier jour : ${last}.` : `Last day: ${last}.`,
      heading: fr ? `${parent} a donné un préavis de départ` : `${parent} gave notice to withdraw`,
      greeting: fr ? "Bonjour," : "Hi there,",
      blocks: [
        {
          kind: "p",
          text: fr
            ? `${parent} a indiqué sur KidEase que ${childOr} quittera ${centre}.`
            : `${parent} let you know on KidEase that ${childOr} will be leaving ${centre}.`,
        },
        {
          kind: "details",
          rows: [
            { label: fr ? "Enfant" : "Child", value: child },
            { label: fr ? "Parent" : "Parent", value: clean(f.parentName, 60) },
            { label: fr ? "Dernier jour demandé" : "Requested last day", value: last },
            { label: fr ? "Raison" : "Reason", value: reason },
          ],
        },
        { kind: "p", text: fr ? "Prochaines étapes :" : "What to do next:" },
        {
          kind: "list",
          items: fr
            ? [
                "Confirmez le dernier jour avec la famille.",
                "Vérifiez la facture finale avant de l’envoyer.",
                "Mettez vos places libres à jour pour que d’autres familles puissent vous trouver.",
              ]
            : [
                "Confirm the last day with the family.",
                "Review the final bill before you send it.",
                "Update your open spots so other families can find you.",
              ],
        },
      ],
      cta: { label: fr ? "Voir le préavis" : "View notice", href: f.href || `${NOTICE_ORIGIN}/provider/withdrawal` },
      reason: fr
        ? `Vous recevez ce courriel parce que vous gérez ${centre} sur KidEase.`
        : `You’re getting this because you manage ${centre} on KidEase.`,
      origin: NOTICE_ORIGIN,
    },
  };
}

export function withdrawalNoticeSms(f: WithdrawalFacts): string {
  const l = f.locale;
  const fr = l === "fr";
  const { parent, child } = withdrawalWho(f);
  const day = formatShortDate(f.lastDay, l);
  // "ven. 18 déc." already ends with a period.
  const last = day.endsWith(".") ? day.slice(0, -1) : day;
  const url = `${SMS_ORIGIN}/provider/withdrawal`;
  const who = child || parent;
  const variants = fr
    ? [
        (n: string) => `KidEase : ${parent} a donné un préavis pour ${n}. Dernier jour : ${last}. ${url}`,
        (n: string) => `KidEase : Préavis de départ pour ${n}. Dernier jour : ${last}. ${url}`,
      ]
    : [
        (n: string) => `KidEase: ${parent} gave notice for ${n}. Last day: ${last}. ${url}`,
        (n: string) => `KidEase: Withdrawal notice for ${n}. Last day: ${last}. ${url}`,
      ];
  return fitSms(variants, nameSteps(who, fr ? "un enfant" : "a child"), l);
}

export function withdrawalCancelledEmail(f: WithdrawalFacts): NotificationEmail {
  const l = f.locale;
  const fr = l === "fr";
  const { parent, child, childOr } = withdrawalWho(f);
  const centre = clean(f.centreName) || (fr ? "votre centre" : "your centre");
  const last = formatLongDate(f.lastDay, l);
  const subject = fr
    ? `Préavis annulé : ${child || parent} reste à ${centre}`
    : `Notice cancelled: ${child || parent} is staying at ${centre}`;
  return {
    subject,
    branded: {
      locale: emailLocale(l),
      preheader: fr ? "La famille a annulé son préavis." : "The family cancelled their notice.",
      heading: fr ? `${parent} a annulé son préavis` : `${parent} cancelled their notice`,
      greeting: fr ? "Bonjour," : "Hi there,",
      blocks: [
        {
          kind: "p",
          text: fr
            ? `Bonne nouvelle : ${childOr} reste à ${centre}. Le préavis qui prévoyait un dernier jour le ${last} est annulé.`
            : `Good news: ${childOr} is staying at ${centre}. The notice with a last day of ${last} has been cancelled.`,
        },
        { kind: "p", text: fr ? "Prochaines étapes :" : "What to do next:" },
        {
          kind: "list",
          items: fr
            ? ["Retirez la facture finale si vous en aviez préparé une.", "Vérifiez vos places libres : la place n’est plus disponible."]
            : ["Remove the final bill if you drafted one.", "Check your open spots: this space is no longer free."],
        },
      ],
      cta: { label: fr ? "Voir les préavis" : "View notices", href: f.href || `${NOTICE_ORIGIN}/provider/withdrawal` },
      reason: fr
        ? `Vous recevez ce courriel parce que vous gérez ${centre} sur KidEase.`
        : `You’re getting this because you manage ${centre} on KidEase.`,
      origin: NOTICE_ORIGIN,
    },
  };
}

// ---------- 4. Bill reminder (centre -> parent) ----------

export function billReminderEmail(input: {
  locale: NoticeLocale;
  parentName?: string | null;
  childName?: string | null;
  centreName: string;
  centreEmail?: string | null;
  centrePhone?: string | null;
  number: string;
  amountCents: number | null;
  dueDate?: string | null;
  /** Online payment is live (pay buttons on). When false the copy never promises online payment. */
  payOnline: boolean;
  billHref?: string;
}): NotificationEmail {
  const l = input.locale;
  const fr = l === "fr";
  const centre = clean(input.centreName) || (fr ? "votre centre" : "your centre");
  const child = clean(input.childName, 60);
  const amount = formatMoney(input.amountCents, l);
  const due = formatLongDate(input.dueDate, l);
  const first = firstName(input.parentName);
  const contact = [clean(input.centrePhone, 30), clean(input.centreEmail, 120)].filter(Boolean).join(" · ");
  const subject = fr
    ? `Rappel : facture ${input.number} de ${centre}${amount ? ` (${amount})` : ""}`
    : `Reminder: ${centre} bill ${input.number}${amount ? ` (${amount})` : ""}`;
  const how = input.payOnline
    ? fr
      ? "Vous pouvez la consulter et la payer en ligne dans votre compte KidEase."
      : "You can view and pay it online in your KidEase account."
    : fr
      ? `Pour payer, communiquez directement avec ${centre}${contact ? ` (${contact})` : ""}. Le paiement en ligne n’est pas encore offert sur KidEase.`
      : `To pay, please contact ${centre} directly${contact ? ` (${contact})` : ""}. Online payment isn’t available on KidEase yet.`;
  return {
    subject,
    branded: {
      locale: emailLocale(l),
      preheader: fr ? `${centre} vous envoie un rappel de paiement.` : `${centre} sent you a payment reminder.`,
      heading: fr ? "Petit rappel de facture" : "A friendly bill reminder",
      greeting: fr ? (first ? `Bonjour ${first},` : "Bonjour,") : first ? `Hi ${first},` : "Hi there,",
      blocks: [
        {
          kind: "p",
          text: fr
            ? `${centre} vous rappelle que la facture ${input.number}${child ? ` pour ${child}` : ""} n’est pas encore payée.`
            : `${centre} is reminding you that bill ${input.number}${child ? ` for ${child}` : ""} hasn’t been paid yet.`,
        },
        {
          kind: "details",
          rows: [
            { label: fr ? "Montant dû" : "Amount due", value: amount },
            { label: fr ? "Date d’échéance" : "Due date", value: due },
            { label: fr ? "Enfant" : "Child", value: child },
            { label: fr ? "Centre" : "Centre", value: centre },
            { label: fr ? "Facture" : "Bill", value: input.number },
          ],
        },
        { kind: "p", text: how },
        {
          kind: "note",
          text: fr
            ? "Déjà payé? Merci! Vous pouvez ignorer ce message; le centre mettra la facture à jour."
            : "Already paid? Thank you! You can ignore this message; the centre will update the bill.",
        },
      ],
      cta: {
        label: input.payOnline ? (fr ? "Voir et payer la facture" : "View and pay bill") : fr ? "Voir la facture" : "View bill",
        href: input.billHref || prefix(l, "/parent?tab=payments"),
      },
      reason: fr
        ? `Vous recevez ce courriel parce que vous avez une facture ouverte auprès de ${centre} sur KidEase.`
        : `You’re getting this because you have an open bill with ${centre} on KidEase.`,
      unsubscribeUrl: UNSUBSCRIBE,
      origin: NOTICE_ORIGIN,
    },
  };
}

// ---------- 5. Contact form auto-reply ----------

export const SUPPORT_EMAIL = "support@kidease.ca";

export function contactAutoReplyEmail(input: { locale: NoticeLocale; name?: string | null }): NotificationEmail & { text: string } {
  const l = input.locale;
  const fr = l === "fr";
  const first = firstName(input.name);
  const subject = fr ? "Nous avons bien reçu votre message" : "We got your message";
  const lines = fr
    ? [
        "Merci d’avoir écrit à KidEase. Une personne de notre équipe vous répondra d’ici un jour ouvrable.",
        `Pour ajouter des détails, répondez simplement à ce courriel ou écrivez-nous à ${SUPPORT_EMAIL}.`,
      ]
    : [
        "Thanks for reaching out to KidEase. A member of our team will reply within one business day.",
        `If you’d like to add anything, just reply to this email or write to ${SUPPORT_EMAIL}.`,
      ];
  const greeting = fr ? (first ? `Bonjour ${first},` : "Bonjour,") : first ? `Hi ${first},` : "Hi there,";
  const branded: BrandedEmailInput = {
    locale: emailLocale(l),
    preheader: fr ? "Nous vous répondrons d’ici un jour ouvrable." : "We’ll reply within one business day.",
    heading: subject,
    greeting,
    blocks: lines.map((text) => ({ kind: "p", text })),
    cta: { label: fr ? "Visiter le centre d’aide" : "Visit the Help Centre", href: prefix(l, "/help") },
    reason: fr
      ? "Vous recevez ce courriel parce que vous avez envoyé un message à KidEase."
      : "You’re getting this because you sent KidEase a message.",
    origin: NOTICE_ORIGIN,
  };
  return { subject, branded, text: [greeting, "", ...lines].join("\n") };
}
