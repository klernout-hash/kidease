/**
 * Staff screening expiries. Pure: no database and no secrets.
 * Practice mode warns and still allows the shift. Live mode blocks an expired record.
 */

import type { EnvMap } from "../flags.ts";
import { modeFor, smsPlan, type PackMode } from "./mode.ts";

export const SCREENING_FLAG = "FEATURE_STAFF_SCREENING";
export const SCREENING_LIVE_FLAG = "FEATURE_STAFF_SCREENING_LIVE";

export const CREDENTIAL_KINDS = [
  "criminal_record",
  "vulnerable_sector",
  "child_abuse_registry",
  "ece_cert",
  "first_aid",
] as const;

export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export type CredentialRule = {
  province: string;
  kind: CredentialKind;
  validYears: number | null;
  verified: boolean;
  source: string;
};

/**
 * Alberta's three-year criminal record check, including a vulnerable sector
 * search, is published. Other intervals are placeholders. The centre still
 * types the expiry date on the document.
 */
export const CREDENTIAL_RULES: readonly CredentialRule[] = [
  {
    province: "AB",
    kind: "criminal_record",
    validYears: 3,
    verified: true,
    source:
      "Alta. Reg. 143/2008 (Early Learning and Child Care Regulation), facility-based staff: a criminal record check, including a vulnerable sector search, dated not earlier than 6 months before the person starts, and every 3 years after that. https://www.canlii.org/en/ab/laws/regu/alta-reg-143-2008/latest/alta-reg-143-2008.html",
  },
  {
    province: "AB",
    kind: "vulnerable_sector",
    validYears: 3,
    verified: true,
    source:
      "Same Alta. Reg. 143/2008 staff rule: the criminal record check includes a vulnerable sector search and is renewed every 3 years. https://www.canlii.org/en/ab/laws/regu/alta-reg-143-2008/latest/alta-reg-143-2008.html",
  },
  {
    province: "ON",
    kind: "first_aid",
    validYears: null,
    verified: true,
    source:
      "Ontario Child Care Centre Licensing Manual, Part 3, first aid: a person counted in ratio needs first aid, including infant and child CPR. Newly hired staff have up to three months to get it. The certificate shows the expiry date. https://www.ontario.ca/document/child-care-centre-licensing-manual/part-3-ratios-and-group-size",
  },
  {
    province: "NS",
    kind: "vulnerable_sector",
    validYears: 5,
    verified: true,
    source:
      "Early Learning and Child Care Regulations (N.S.), record checks: a new vulnerable sector check is due no later than 5 years after the most recent check. A check used at hire must be less than 2 years old. Read 1 November 2026. https://novascotia.ca/just/regulations/regs/elcc.htm",
  },
  {
    province: "NS",
    kind: "child_abuse_registry",
    validYears: 3,
    verified: true,
    source:
      "Early Learning and Child Care Regulations (N.S.): a new child abuse register check is due no later than 3 years after the most recent check. Read 1 November 2026. https://novascotia.ca/just/regulations/regs/elcc.htm",
  },
  {
    province: "NS",
    kind: "first_aid",
    validYears: null,
    verified: true,
    source:
      "Early Learning and Child Care Regulations (N.S.), s. 28(1): each person who works directly with children needs a valid first aid certificate that includes infant CPR. The certificate shows its own expiry. Read 1 November 2026. https://novascotia.ca/just/regulations/regs/elcc.htm",
  },
  {
    province: "PE",
    kind: "criminal_record",
    validYears: 3,
    verified: true,
    source:
      "Early Learning and Child Care Act Regulations (P.E.I.), s. 20(1)(b): a criminal record check and a vulnerable sector search, dated not earlier than 6 months before it is given, within eight weeks of starting, and at least every 3 years after that. Read 1 November 2026. https://www.princeedwardisland.ca/sites/default/files/legislation/e.01g-early_learning_and_child_care_act_regulations.pdf",
  },
  {
    province: "PE",
    kind: "vulnerable_sector",
    validYears: 3,
    verified: true,
    source:
      "Same P.E.I. regulation, s. 20(1)(b): the criminal record check includes a vulnerable sector search and is renewed at least every 3 years. Read 1 November 2026. https://www.princeedwardisland.ca/sites/default/files/legislation/e.01g-early_learning_and_child_care_act_regulations.pdf",
  },
  {
    province: "PE",
    kind: "first_aid",
    validYears: null,
    verified: true,
    source:
      "Early Learning and Child Care Act Regulations (P.E.I.), s. 20(1)(c) and s. 20(3): emergency first aid and infant and child CPR, or enrolment within two weeks and the certificate within eight weeks. At least one certified person is present. The certificate shows its own expiry. Read 1 November 2026. https://www.princeedwardisland.ca/sites/default/files/legislation/e.01g-early_learning_and_child_care_act_regulations.pdf",
  },
];

export function screeningMode(env: EnvMap): PackMode {
  return modeFor(SCREENING_FLAG, env);
}

export function isCredentialKind(value: string): value is CredentialKind {
  return (CREDENTIAL_KINDS as readonly string[]).includes(value);
}

export type CredentialStatus = "missing" | "current" | "expiring" | "expired";

export function credentialStatus(expiresOn: string | null, today: string): CredentialStatus {
  if (!expiresOn) return "missing";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return "missing";
  if (expiresOn < today) return "expired";
  const exp = Date.parse(`${expiresOn}T12:00:00Z`);
  const now = Date.parse(`${today}T12:00:00Z`);
  const days = (exp - now) / 86_400_000;
  if (days <= 60) return "expiring";
  return "current";
}

/**
 * Off: do not change scheduling.
 * Practice: warn, do not block.
 * Live: block expired or missing required credentials.
 */
export function scheduleDecision(input: {
  mode: PackMode;
  status: CredentialStatus;
}): { allow: boolean; warn: boolean; block: boolean; log: boolean } {
  if (input.mode === "off") return { allow: true, warn: false, block: false, log: false };
  if (input.status === "current") return { allow: true, warn: false, block: false, log: false };
  if (input.mode === "dry_run") return { allow: true, warn: true, block: false, log: true };
  return { allow: false, warn: true, block: true, log: true };
}

export function reminderPlan(input: {
  mode: PackMode;
  status: CredentialStatus;
  caslSms: boolean;
  hasEmail: boolean;
}): { email: "skip" | "log" | "send"; sms: "skip" | "log" | "send" } {
  if (input.mode === "off" || input.status === "current") {
    return { email: "skip", sms: "skip" };
  }
  const sms = smsPlan(input.mode, input.caslSms);
  const email =
    input.mode === "dry_run" ? (input.hasEmail ? "log" : "skip") : input.mode === "live" && input.hasEmail ? "send" : "skip";
  return { email: email as "skip" | "log" | "send", sms: sms.delivery };
}

export function ruleFor(province: string, kind: CredentialKind): CredentialRule | null {
  const code = province.trim().toUpperCase();
  return CREDENTIAL_RULES.find((row) => row.province === code && row.kind === kind) ?? null;
}

export function screeningCopy(locale: "en" | "fr") {
  if (locale === "fr") {
    return {
      what: "KidEase pour les garderies",
      why: "Suivez les vérifications du personnel et les dates d’échéance.",
      next: "Enregistrer une date",
      help: "Aide",
      home: "Accueil",
      off: "Cet outil est éteint. Personne n’est bloqué.",
      practice: "Mode pratique : un dossier expiré donne un avertissement. Le quart n’est pas bloqué.",
      empty: "Aucun dossier pour l’instant.",
      govWhat: "KidEase pour votre province",
      govWhy: "Voyez combien de dossiers sont expirés. Pas de nom d’enfant.",
    };
  }
  return {
    what: "KidEase for daycares",
    why: "Track staff checks and the date each one expires.",
    next: "Save a date",
    help: "Help",
    home: "Home",
    off: "This tool is off. Nobody is blocked from a shift.",
    practice: "Practice mode: an expired record shows a warning. The shift is not blocked.",
    empty: "No records yet.",
    govWhat: "KidEase for your province",
    govWhy: "See how many records are expired. No child names.",
  };
}
