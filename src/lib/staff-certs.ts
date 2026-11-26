/**
 * ECE certificate tracking per staff member. Pure helpers and EN/FR copy.
 * The link between a certificate, a staff account and an uploaded file is kept
 * in the existing wiring_notices table (feature "ece_cert_link"), so no migration.
 */

import { alertIsProspective, customerAlertCutoffMs } from "./customer-alert-policy.ts";

export const ECE_CERT_LINK_FEATURE = "ece_cert_link";
export const CERT_DUE_DAYS = 60;

export type CertStatus = "expired" | "due" | "ok" | "unknown";

function dayMs(day: string): number {
  return Date.parse(`${day}T12:00:00.000Z`);
}

export function certStatus(expiresOn: string | null | undefined, now = new Date()): CertStatus {
  const day = String(expiresOn || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "unknown";
  const exp = dayMs(day);
  const today = dayMs(now.toISOString().slice(0, 10));
  if (!Number.isFinite(exp)) return "unknown";
  if (exp < today) return "expired";
  if (exp <= today + CERT_DUE_DAYS * 86_400_000) return "due";
  return "ok";
}

/** Only dates after the alert cutoff raise a bell item, and an old expiry is not replayed. */
export function certAlert(
  expiresOn: string | null | undefined,
  now = new Date(),
): { status: "expired" | "due"; at: string } | null {
  const status = certStatus(expiresOn, now);
  if (status !== "expired" && status !== "due") return null;
  const day = String(expiresOn).slice(0, 10);
  if (status === "expired") {
    const at = new Date(dayMs(day)).toISOString();
    // An expiry from before the alert cutoff is not replayed.
    return alertIsProspective(at) ? { status, at } : null;
  }
  // A certificate already inside the 60-day window when alerts began counts from the cutoff.
  const entered = dayMs(day) - CERT_DUE_DAYS * 86_400_000;
  const cutoff = customerAlertCutoffMs();
  if (!Number.isFinite(cutoff)) return null;
  return { status, at: new Date(Math.max(entered, cutoff)).toISOString() };
}

export type CertLink = {
  certId: string;
  daycareId: string;
  staffUserId: string | null;
  fileRef: string | null;
  fileMime: string | null;
  fileName: string | null;
};

export function parseCertLink(body: string | null | undefined): CertLink | null {
  try {
    const raw = JSON.parse(String(body || "")) as Partial<CertLink>;
    if (!raw || typeof raw.certId !== "string" || typeof raw.daycareId !== "string") return null;
    return {
      certId: raw.certId,
      daycareId: raw.daycareId,
      staffUserId: typeof raw.staffUserId === "string" && raw.staffUserId ? raw.staffUserId : null,
      fileRef: typeof raw.fileRef === "string" && raw.fileRef ? raw.fileRef : null,
      fileMime: typeof raw.fileMime === "string" && raw.fileMime ? raw.fileMime : null,
      fileName:
        typeof raw.fileName === "string" && raw.fileName ? raw.fileName.slice(0, 160) : null,
    };
  } catch {
    return null;
  }
}

export function cleanCertInput(input: {
  level?: unknown;
  certificateNumber?: unknown;
  expiresOn?: unknown;
}):
  | { ok: true; level: string; certificateNumber: string; expiresOn: string }
  | { ok: false; error: "date" } {
  const expiresOn = String(input.expiresOn ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || !Number.isFinite(dayMs(expiresOn)))
    return { ok: false, error: "date" };
  return {
    ok: true,
    level: String(input.level ?? "")
      .trim()
      .slice(0, 40),
    certificateNumber: String(input.certificateNumber ?? "")
      .trim()
      .slice(0, 40),
    expiresOn,
  };
}

const en = {
  ownerTitle: "ECE certificates",
  ownerLead:
    "Track each staff member's ECE level, certificate number and expiry. Staff see their own certificates.",
  mineTitle: "My ECE certificates",
  mineLead:
    "Add your ECE certificate so your centre can see it. You get a reminder before it expires.",
  centre: "Centre",
  staff: "Staff member",
  staffPick: "Pick a staff member",
  staffNameOther: "Or type a name",
  level: "ECE level",
  number: "Certificate number",
  expires: "Expiry date",
  file: "Certificate file (PDF or photo, under 4 MB)",
  save: "Save certificate",
  saved: "Certificate saved.",
  upload: "Upload file",
  uploaded: "File uploaded.",
  download: "Download",
  noFile: "No file yet",
  none: "No certificates yet.",
  noCentre: "Join a centre's team to add your certificate.",
  statusExpired: "Expired",
  statusDue: "Expires soon",
  statusOk: "Current",
  statusUnknown: "No date",
  expiresOn: "Expires {day}",
  badDate: "Check the expiry date.",
  badName: "Pick a staff member or type a name.",
  error: "Something went wrong. Try again.",
};
const fr: typeof en = {
  ownerTitle: "Certificats en petite enfance",
  ownerLead:
    "Suivez le niveau, le numéro de certificat et la date d'expiration de chaque membre du personnel. Le personnel voit ses propres certificats.",
  mineTitle: "Mes certificats en petite enfance",
  mineLead:
    "Ajoutez votre certificat pour que votre centre puisse le voir. Vous recevez un rappel avant l'expiration.",
  centre: "Centre",
  staff: "Membre du personnel",
  staffPick: "Choisir un membre du personnel",
  staffNameOther: "Ou inscrire un nom",
  level: "Niveau",
  number: "Numéro de certificat",
  expires: "Date d'expiration",
  file: "Fichier du certificat (PDF ou photo, moins de 4 Mo)",
  save: "Enregistrer le certificat",
  saved: "Certificat enregistré.",
  upload: "Téléverser le fichier",
  uploaded: "Fichier téléversé.",
  download: "Télécharger",
  noFile: "Aucun fichier",
  none: "Aucun certificat pour le moment.",
  noCentre: "Joignez-vous à l'équipe d'un centre pour ajouter votre certificat.",
  statusExpired: "Expiré",
  statusDue: "Expire bientôt",
  statusOk: "Valide",
  statusUnknown: "Aucune date",
  expiresOn: "Expire le {day}",
  badDate: "Vérifiez la date d'expiration.",
  badName: "Choisissez un membre du personnel ou inscrivez un nom.",
  error: "Un problème est survenu. Réessayez.",
};

export function staffCertCopy(locale: string): typeof en {
  return locale === "fr" ? fr : en;
}
