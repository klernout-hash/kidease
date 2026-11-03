/**
 * Parent ↔ centre enrolment agreement.
 * The fee lives only in this document. It is not a public listing price.
 * KidEase delivers the envelope. KidEase is not a party to the terms.
 */
import { provinceInfo, PROVINCES, type ProvinceCode } from "./gov/places.ts";

export const PARENT_AGREEMENT_PACK = "parent_enrolment_agreement" as const;

export const PARENT_AGREEMENT_STATUSES = ["draft", "sent", "parent_signed", "completed", "void"] as const;

export type ParentAgreementStatus = (typeof PARENT_AGREEMENT_STATUSES)[number];

export type FeePeriod = "day" | "week" | "month";

export type AgreementClause = { en: string; fr: string };

export type AgreementTerms = {
  hoursEn: string;
  hoursFr: string;
  daysEn: string;
  daysFr: string;
  startDate: string;
  feePeriod: FeePeriod;
  feeEn: string;
  feeFr: string;
  depositEn: string;
  depositFr: string;
  noticeEn: string;
  noticeFr: string;
  lateEn: string;
  lateFr: string;
  sickEn: string;
  sickFr: string;
  holidaysEn: string;
  holidaysFr: string;
  clauses: AgreementClause[];
  baseFeeEn?: string;
  baseFeeFr?: string;
  reducedFeeEn?: string;
  reducedFeeFr?: string;
  billingCycleEn?: string;
  billingCycleFr?: string;
  feeIncreaseEn?: string;
  feeIncreaseFr?: string;
};

export type AgreementParties = {
  centreName: string;
  address: string;
  city: string;
  provinceCode: string;
  licence: string;
  photoUrl: string | null;
  parentName: string;
  childName: string;
  childBirthdate: string;
  directorName: string;
  startDate: string;
  daysEn?: string;
  daysFr?: string;
};

export type AgreementErrorCode =
  | "signing_off"
  | "not_your_centre"
  | "not_accepted"
  | "child_required"
  | "birthdate_required"
  | "parent_required"
  | "email_required"
  | "same_email"
  | "province_required"
  | "fee_required"
  | "hours_required"
  | "days_required"
  | "start_required"
  | "docusign_off"
  | "already_sent"
  | "not_found"
  | "void_blocked";

const MAX_TEXT = 800;
const MAX_CLAUSES = 8;
const MAX_CLAUSE = 400;

const STOCK_PHOTO = /\/photos\/(?:community|playroom)\.jpg|storefront-placeholder/i;

export function defaultAgreementTerms(): AgreementTerms {
  return {
    hoursEn: "Monday to Friday, 7:30 a.m. to 5:30 p.m.",
    hoursFr: "Du lundi au vendredi, de 7 h 30 à 17 h 30.",
    daysEn: "Monday, Tuesday, Wednesday, Thursday, and Friday.",
    daysFr: "Lundi, mardi, mercredi, jeudi et vendredi.",
    startDate: "",
    feePeriod: "month",
    feeEn: "",
    feeFr: "",
    depositEn: "No deposit.",
    depositFr: "Aucun dépôt.",
    noticeEn: "The family gives 30 days of written notice to withdraw.",
    noticeFr: "La famille donne un préavis écrit de 30 jours pour se retirer.",
    lateEn: "A pickup after the agreed end time follows the late pickup rule written here.",
    lateFr: "Un départ après l’heure convenue suit la règle de retard écrite ici.",
    sickEn: "A child who is too sick for the group stays home. The centre follows its illness rule and provincial health guidance.",
    sickFr: "Un enfant trop malade pour le groupe reste à la maison. Le centre suit sa règle de maladie et les consignes de santé de la province.",
    holidaysEn: "The centre is closed on statutory holidays in its province, and on any extra closure days listed here.",
    holidaysFr: "Le centre est fermé les jours fériés de sa province et les autres jours de fermeture indiqués ici.",
    clauses: [],
  };
}

function clip(value: unknown, max = MAX_TEXT) {
  let clean = "";
  for (const char of String(value ?? "")) {
    const code = char.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) clean += char;
  }
  return clean.trim().slice(0, max);
}

export function normalizeFeePeriod(value: unknown): FeePeriod {
  return value === "day" || value === "week" || value === "month" ? value : "month";
}

export function normalizeAgreementTerms(input: Partial<AgreementTerms> | null | undefined): AgreementTerms {
  const base = defaultAgreementTerms();
  const source = input || {};
  const clauses = Array.isArray(source.clauses) ? source.clauses : [];
  return {
    hoursEn: clip(source.hoursEn || base.hoursEn),
    hoursFr: clip(source.hoursFr || base.hoursFr),
    daysEn: clip(source.daysEn || base.daysEn),
    daysFr: clip(source.daysFr || base.daysFr),
    startDate: isIsoDate(clip(source.startDate, 10)) ? clip(source.startDate, 10) : "",
    feePeriod: normalizeFeePeriod(source.feePeriod),
    feeEn: clip(source.feeEn),
    feeFr: clip(source.feeFr),
    depositEn: clip(source.depositEn || base.depositEn),
    depositFr: clip(source.depositFr || base.depositFr),
    noticeEn: clip(source.noticeEn || base.noticeEn),
    noticeFr: clip(source.noticeFr || base.noticeFr),
    lateEn: clip(source.lateEn || base.lateEn),
    lateFr: clip(source.lateFr || base.lateFr),
    sickEn: clip(source.sickEn || base.sickEn),
    sickFr: clip(source.sickFr || base.sickFr),
    holidaysEn: clip(source.holidaysEn || base.holidaysEn),
    holidaysFr: clip(source.holidaysFr || base.holidaysFr),
    baseFeeEn: clip(source.baseFeeEn),
    baseFeeFr: clip(source.baseFeeFr),
    reducedFeeEn: clip(source.reducedFeeEn),
    reducedFeeFr: clip(source.reducedFeeFr),
    billingCycleEn: clip(source.billingCycleEn),
    billingCycleFr: clip(source.billingCycleFr),
    feeIncreaseEn: clip(source.feeIncreaseEn),
    feeIncreaseFr: clip(source.feeIncreaseFr),
    clauses: clauses
      .map((row) => ({ en: clip(row?.en, MAX_CLAUSE), fr: clip(row?.fr, MAX_CLAUSE) }))
      .filter((row) => row.en || row.fr)
      .slice(0, MAX_CLAUSES),
  };
}

export function isParentAgreementStatus(value: unknown): value is ParentAgreementStatus {
  return (PARENT_AGREEMENT_STATUSES as readonly string[]).includes(String(value || ""));
}

export function agreementStatusLabel(status: string, locale: "en" | "fr" = "en") {
  const labels: Record<ParentAgreementStatus, { en: string; fr: string }> = {
    draft: { en: "Draft", fr: "Brouillon" },
    sent: { en: "Sent", fr: "Envoyée" },
    parent_signed: { en: "Parent signed", fr: "Parent a signé" },
    completed: { en: "Completed", fr: "Terminée" },
    void: { en: "Void", fr: "Annulée" },
  };
  const key = isParentAgreementStatus(status) ? status : "draft";
  return labels[key][locale];
}

export function agreementError(code: string, locale: "en" | "fr" = "en") {
  const copy: Record<AgreementErrorCode, { en: string; fr: string }> = {
    signing_off: {
      en: "Agreements are not open yet.",
      fr: "Les ententes ne sont pas ouvertes pour le moment.",
    },
    not_your_centre: {
      en: "This centre is not on your desk.",
      fr: "Ce centre n’est pas sur votre bureau.",
    },
    not_accepted: {
      en: "Send an agreement after you accept the spot.",
      fr: "Envoyez l’entente après avoir accepté la place.",
    },
    child_required: {
      en: "This request needs a child profile first.",
      fr: "Cette demande a besoin du profil de l’enfant d’abord.",
    },
    birthdate_required: {
      en: "The child profile needs a birthdate.",
      fr: "Le profil de l’enfant a besoin d’une date de naissance.",
    },
    parent_required: {
      en: "The request needs the parent’s name.",
      fr: "La demande a besoin du nom du parent.",
    },
    email_required: {
      en: "The parent and the director each need an email.",
      fr: "Le parent et la direction ont chacun besoin d’un courriel.",
    },
    same_email: {
      en: "The parent and the director need different emails.",
      fr: "Le parent et la direction ont besoin de courriels différents.",
    },
    province_required: {
      en: "The centre needs a Canadian province on its listing.",
      fr: "Le centre a besoin d’une province canadienne sur sa fiche.",
    },
    fee_required: {
      en: "Write the fee that belongs in this agreement.",
      fr: "Écrivez les frais qui vont dans cette entente.",
    },
    hours_required: {
      en: "Write the hours of care.",
      fr: "Écrivez les heures de garde.",
    },
    days_required: {
      en: "Write the days of care.",
      fr: "Écrivez les jours de garde.",
    },
    start_required: {
      en: "The spot needs a start date.",
      fr: "La place a besoin d’une date de début.",
    },
    docusign_off: {
      en: "DocuSign is not connected yet. Nothing was sent.",
      fr: "DocuSign n’est pas branché. Rien n’a été envoyé.",
    },
    already_sent: {
      en: "An agreement is already out for this spot.",
      fr: "Une entente est déjà en cours pour cette place.",
    },
    not_found: {
      en: "That agreement is not on this desk.",
      fr: "Cette entente n’est pas sur ce bureau.",
    },
    void_blocked: {
      en: "A finished agreement stays on the child’s file.",
      fr: "Une entente terminée reste au dossier de l’enfant.",
    },
  };
  const row = copy[code as AgreementErrorCode];
  return row ? row[locale] : "";
}

export function agreementErrorCode(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err || "");
  return raw.startsWith("agreement:") ? raw.slice("agreement:".length) : "";
}

export function provinceCodeFromStored(value: string | null | undefined): ProvinceCode | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const direct = provinceInfo(raw);
  if (direct) return direct.code;
  const lower = raw.toLowerCase();
  const named = PROVINCES.find(
    (row) => row.nameEn.toLowerCase() === lower || row.nameFr.toLowerCase() === lower,
  );
  return named?.code ?? null;
}

export function lawClause(provinceCode: string | null | undefined): { en: string; fr: string } | null {
  const code = provinceCodeFromStored(provinceCode);
  const row = code ? provinceInfo(code) : null;
  if (!row) return null;
  return {
    en: `This agreement is governed by the laws of ${row.nameEn}, Canada.`,
    fr: `Les lois de ${row.nameFr} (Canada) s’appliquent à cette entente.`,
  };
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isStartDate(value: string) {
  return isIsoDate(value) || /^\d{4}-\d{2}$/.test(value);
}

export function feePeriodLabel(period: FeePeriod, locale: "en" | "fr") {
  const labels: Record<FeePeriod, { en: string; fr: string }> = {
    day: { en: "day", fr: "jour" },
    week: { en: "week", fr: "semaine" },
    month: { en: "month", fr: "mois" },
  };
  return labels[period][locale];
}

/** The agreement fee is never a public listing price. */
export function agreementFeeIsPublic() {
  return false;
}

export function termsReady(terms: AgreementTerms): AgreementErrorCode | null {
  if (!terms.hoursEn || !terms.hoursFr) return "hours_required";
  if (!terms.daysEn || !terms.daysFr) return "days_required";
  if (!terms.feeEn || !terms.feeFr) return "fee_required";
  return null;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function agreementPhotoUrl(origin: string, photos: string | null | undefined): string | null {
  const root = String(origin || "").trim().replace(/\/$/, "");
  const parts = String(photos || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const logo = parts.find((part) => part.includes("-logo"));
  const rest = parts.find((part) => !part.includes("-logo") && !STOCK_PHOTO.test(part));
  const picked = logo || rest || "";
  if (!picked || /^(?:javascript|data):/i.test(picked) || picked.includes('"') || picked.includes("'")) return null;
  if (/^https:\/\//i.test(picked)) return picked;
  if (picked.startsWith("/") && root) return `${root}${picked}`;
  return null;
}

function feeLine(terms: AgreementTerms, locale: "en" | "fr") {
  const amount = locale === "fr" ? terms.feeFr : terms.feeEn;
  return `${amount} / ${feePeriodLabel(terms.feePeriod, locale)}`;
}

export function parentAgreementDocument(terms: AgreementTerms, parties: AgreementParties) {
  const law = lawClause(parties.provinceCode);
  if (!law) throw new Error("agreement:province_required");
  const ready = termsReady(terms);
  if (ready) throw new Error(`agreement:${ready}`);
  const daysEn = parties.daysEn?.trim() || terms.daysEn;
  const daysFr = parties.daysFr?.trim() || terms.daysFr;
  const start = parties.startDate.trim() || terms.startDate;
  if (!isStartDate(start)) throw new Error("agreement:start_required");
  const where = [parties.address, parties.city, provinceInfo(provinceCodeFromStored(parties.provinceCode) || "")?.nameEn]
    .filter(Boolean)
    .join(", ");
  const photo = parties.photoUrl
    ? `<img src="${escapeHtml(parties.photoUrl)}" alt="${escapeHtml(parties.centreName)}" width="96" height="96" style="object-fit:cover;border-radius:12px" />`
    : "";
  const clauses = terms.clauses
    .map((clause, index) => {
      const title = clause.en || clause.fr;
      const other = clause.fr && clause.en ? clause.fr : "";
      return `<h3>${index + 10}. ${escapeHtml(title)}</h3>${other ? `<p>${escapeHtml(other)}</p>` : ""}`;
    })
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Enrolment agreement</title></head>
<body style="font-family:Georgia,serif;color:#1c1917;line-height:1.45">
<header>
  ${photo}
  <h1>${escapeHtml(parties.centreName)}</h1>
  <p>${escapeHtml(where)}</p>
  <p>Licence / Permis: ${escapeHtml(parties.licence || "—")}</p>
</header>
<h2>Enrolment agreement / Entente d’inscription</h2>
<p>This agreement is between the parent named below and the licensed child care centre named above. KidEase only delivers it for signature.</p>
<p>La présente entente est conclue entre le parent nommé ci-dessous et le service de garde permis nommé ci-dessus. KidEase ne fait que l’envoyer pour signature.</p>
<p>Parent / Parent: ${escapeHtml(parties.parentName)}</p>
<p>Child / Enfant: ${escapeHtml(parties.childName)}</p>
<p>Birthdate / Date de naissance: ${escapeHtml(parties.childBirthdate)}</p>
<p>Centre signer / Signataire du centre: ${escapeHtml(parties.directorName)}</p>
<h3>1. Hours / Heures</h3>
<p>${escapeHtml(terms.hoursEn)}</p>
<p>${escapeHtml(terms.hoursFr)}</p>
<h3>2. Days of care / Jours de garde</h3>
<p>${escapeHtml(daysEn)}</p>
<p>${escapeHtml(daysFr)}</p>
<h3>3. Start date / Date de début</h3>
<p>${escapeHtml(start)}</p>
<h3>4. Fee / Frais</h3>
<p>${escapeHtml(feeLine(terms, "en"))}</p>
<p>${escapeHtml(feeLine(terms, "fr"))}</p>
<p>This fee is only for this agreement. It is not a public listing price.</p>
<p>Ces frais figurent seulement dans cette entente. Ce n’est pas un tarif public.</p>
<h3>5. Deposit / Dépôt</h3>
<p>${escapeHtml(terms.depositEn)}</p>
<p>${escapeHtml(terms.depositFr)}</p>
<h3>6. Notice to withdraw / Préavis de retrait</h3>
<p>${escapeHtml(terms.noticeEn)}</p>
<p>${escapeHtml(terms.noticeFr)}</p>
<h3>7. Late pickup / Départ en retard</h3>
<p>${escapeHtml(terms.lateEn)}</p>
<p>${escapeHtml(terms.lateFr)}</p>
<h3>8. Sick child / Enfant malade</h3>
<p>${escapeHtml(terms.sickEn)}</p>
<p>${escapeHtml(terms.sickFr)}</p>
<h3>9. Holidays and closures / Jours fériés et fermetures</h3>
<p>${escapeHtml(terms.holidaysEn)}</p>
<p>${escapeHtml(terms.holidaysFr)}</p>
${clauses}
<h3>Law / Droit</h3>
<p>${escapeHtml(law.en)}</p>
<p>${escapeHtml(law.fr)}</p>
<p>Parent signature / Signature du parent</p>
<p>Centre signature / Signature du centre</p>
<footer>
  <p>Sent via KidEase</p>
  <p>Envoyé via KidEase</p>
</footer>
</body>
</html>`;
}

export function parentAgreementSubject(centreName: string, childName: string) {
  const clean = `Please sign: Enrolment agreement: ${centreName} — ${childName}`.replace(/\s+/g, " ").trim();
  return clean.length > 100 ? `${clean.slice(0, 97)}...` : clean;
}

export function parentAgreementBlurb() {
  return "Please sign the enrolment agreement between your family and the centre. / Veuillez signer l’entente d’inscription entre votre famille et le centre.";
}

export type ConnectSignerStatus = {
  recipientId?: string;
  routingOrder?: string;
  status?: string;
};

function envelopeWord(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^envelope-/i, "")
    .replace(/^recipient-/i, "");
}

function signerDone(signer: ConnectSignerStatus, slot: "1" | "2") {
  const id = String(signer.recipientId || "");
  const order = String(signer.routingOrder || "");
  const status = envelopeWord(signer.status || "");
  const match = id === slot || order === slot;
  return match && (status === "completed" || status === "signed");
}

export function parentAgreementStatusFromConnect(input: {
  envelopeStatus: string;
  signers?: ConnectSignerStatus[];
}): ParentAgreementStatus {
  const envelope = envelopeWord(input.envelopeStatus);
  if (envelope === "voided" || envelope === "declined") return "void";
  const signers = input.signers || [];
  const parentDone = signers.some((signer) => signerDone(signer, "1"));
  const directorDone = signers.some((signer) => signerDone(signer, "2"));
  if (parentDone && directorDone) return "completed";
  if ((envelope === "completed" || envelope === "signed") && !(signers.length && parentDone && !directorDone)) {
    return "completed";
  }
  if (parentDone) return "parent_signed";
  return "sent";
}

export function canViewParentAgreement(input: {
  viewerId: string;
  parentUserId: string;
  centreUserIds: readonly string[];
  coparentUserIds: readonly string[];
  coparentFlag: boolean;
}) {
  const viewer = input.viewerId.trim();
  if (!viewer) return false;
  if (viewer === input.parentUserId) return true;
  if (input.centreUserIds.includes(viewer)) return true;
  if (input.coparentFlag && input.coparentUserIds.includes(viewer)) return true;
  return false;
}

export function sendAgreementAction(
  status: ParentAgreementStatus | null,
  bookingAccepted: boolean,
): "send" | "wait" | "download" | "hidden" {
  if (!bookingAccepted) return "hidden";
  if (!status || status === "void" || status === "draft") return "send";
  if (status === "completed") return "download";
  return "wait";
}

export function acceptedEnrolmentStatus(status: string) {
  return status === "accepted" || status === "active";
}

export function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
