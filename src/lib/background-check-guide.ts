/**
 * Background-check guidance. KidEase does not perform, broker, or verify checks.
 * Facts come from the 22 November 2026 research note. Do not invent fees or intervals.
 * Do not show a "background checked" or "verified" badge.
 */

import { BG_JURISDICTIONS } from "./background-check-jurisdictions.ts";

export const BG_RESEARCH_AS_OF = "2026-11-22";

export const BG_PROVINCE_CODES = [
  "BC",
  "AB",
  "SK",
  "MB",
  "ON",
  "QC",
  "NB",
  "NS",
  "PE",
  "NL",
  "YT",
  "NT",
  "NU",
] as const;

export type BgProvinceCode = (typeof BG_PROVINCE_CODES)[number];

/** Roles the public guide explains. Order is the page order. */
export const BG_ROLES = [
  "centre_staff",
  "volunteer_student",
  "home_provider",
  "home_resident",
  "operator",
] as const;

export type BgRole = (typeof BG_ROLES)[number];

export const BG_CHECK_KINDS = [
  "crrp",
  "crc_vsc",
  "vsc",
  "crc",
  "child_abuse_registry",
  "prior_contact",
  "social_development",
  "vae",
  "offence_declaration",
  "suitability_consent",
  "criminal_disclosure",
  "under18_disclosure",
] as const;

export type BgCheckKind = (typeof BG_CHECK_KINDS)[number];

export type GuideSource = {
  label: string;
  href?: string;
  /** ISO date the source was read or the page says it was updated. */
  asOf: string;
};

export type RenewalSpec =
  | { mode: "years"; years: number }
  | { mode: "centre_policy" }
  | { mode: "unconfirmed" }
  | { mode: "declaration"; withinDays: 15 }
  | { mode: "none_published" };

export type GuideCheck = {
  id: string;
  kind: BgCheckKind;
  roles: readonly BgRole[];
  titleEn: string;
  titleFr: string;
  whatEn: string;
  whatFr: string;
  whenEn: string;
  whenFr: string;
  whereEn: string;
  whereFr: string;
  links: readonly { labelEn: string; labelFr: string; href: string }[];
  documentsEn: string;
  documentsFr: string;
  costEn: string;
  costFr: string;
  /** True only when the research quotes a published amount. */
  costPublished: boolean;
  renewal: RenewalSpec;
  renewalEn: string;
  renewalFr: string;
  keeperEn: string;
  keeperFr: string;
  unconfirmed: boolean;
  unconfirmedEn?: string;
  unconfirmedFr?: string;
  sources: readonly GuideSource[];
};

export type BgJurisdiction = {
  code: BgProvinceCode;
  summaryEn: string;
  summaryFr: string;
  checks: readonly GuideCheck[];
  /** Shown when a role has no check card, so the page does not invent a duty. */
  roleNotes: Partial<Record<BgRole, { en: string; fr: string }>>;
};

export const BG_GUIDE_FLAG = "FEATURE_BG_CHECK_GUIDE";
export const BG_RECORDS_FLAG = "FEATURE_BG_CHECK_RECORDS";
export const BG_ATTESTATION_FLAG = "FEATURE_BG_CHECK_ATTESTATION";

/** Product reminder window. Not a legal deadline. */
export const REMINDER_SOON_DAYS = 60;

export type ReminderStatus =
  | "current"
  | "due_soon"
  | "expired"
  | "needs_policy"
  | "unconfirmed"
  | "no_interval"
  | "no_date";

export type ReminderBasis =
  | "typed_date"
  | "statute"
  | "centre_policy"
  | "declaration"
  | "unconfirmed"
  | "none_published"
  | "missing";

const RCMP_WHERE = "https://www.rcmp.ca/en/criminal-records/criminal-record-checks/where-go";

export function rcmpWhereHref(): string {
  return RCMP_WHERE;
}

export function isBgProvince(value: string | null | undefined): value is BgProvinceCode {
  return (BG_PROVINCE_CODES as readonly string[]).includes((value || "").trim().toUpperCase());
}

export function isBgRole(value: string | null | undefined): value is BgRole {
  return (BG_ROLES as readonly string[]).includes((value || "").trim());
}

export function isBgCheckKind(value: string | null | undefined): value is BgCheckKind {
  return (BG_CHECK_KINDS as readonly string[]).includes((value || "").trim());
}

export function jurisdictionByCode(code: string | null | undefined): BgJurisdiction | null {
  const key = (code || "").trim().toUpperCase();
  return BG_JURISDICTIONS.find((row) => row.code === key) ?? null;
}

export function listJurisdictions(): readonly BgJurisdiction[] {
  return BG_JURISDICTIONS;
}

export function checksForRole(jurisdiction: BgJurisdiction, role: BgRole): GuideCheck[] {
  return jurisdiction.checks.filter((check) => check.roles.includes(role));
}

export function renewalFor(province: string, kind: BgCheckKind): RenewalSpec | null {
  const row = jurisdictionByCode(province);
  const check = row?.checks.find((item) => item.kind === kind);
  return check?.renewal ?? null;
}

function parseIso(iso: string | null | undefined): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function formatIso(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addUtcMonths(iso: string, months: number): string | null {
  if (!parseIso(iso) || !Number.isInteger(months)) return null;
  const [y, m, day] = iso.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  cursor.setUTCDate(Math.min(day, last));
  return formatIso(cursor);
}

export function addUtcDays(iso: string, days: number): string | null {
  if (!parseIso(iso) || !Number.isInteger(days)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatIso(dt);
}

export function statusFromDue(
  due: string,
  today: string,
  soonDays = REMINDER_SOON_DAYS,
): "current" | "due_soon" | "expired" | "no_date" {
  if (!parseIso(due) || !parseIso(today)) return "no_date";
  if (due < today) return "expired";
  const dueMs = Date.parse(`${due}T12:00:00Z`);
  const nowMs = Date.parse(`${today}T12:00:00Z`);
  const days = (dueMs - nowMs) / 86_400_000;
  if (days <= soonDays) return "due_soon";
  return "current";
}

export function backgroundCheckReminder(input: {
  province: string;
  kind: BgCheckKind;
  issuedOn: string | null;
  expiresOn: string | null;
  policyMonths: number | null;
  today: string;
}): { status: ReminderStatus; dueOn: string | null; basis: ReminderBasis } {
  const typed = input.expiresOn && parseIso(input.expiresOn) ? input.expiresOn : null;
  if (typed) {
    return { status: statusFromDue(typed, input.today), dueOn: typed, basis: "typed_date" };
  }
  const renewal = renewalFor(input.province, input.kind);
  const issued = input.issuedOn && parseIso(input.issuedOn) ? input.issuedOn : null;
  if (!renewal || !issued) return { status: "no_date", dueOn: null, basis: "missing" };
  if (renewal.mode === "years") {
    const dueOn = addUtcMonths(issued, renewal.years * 12);
    if (!dueOn) return { status: "no_date", dueOn: null, basis: "missing" };
    return { status: statusFromDue(dueOn, input.today), dueOn, basis: "statute" };
  }
  if (renewal.mode === "declaration") {
    const anniversary = addUtcMonths(issued, 12);
    const dueOn = anniversary ? addUtcDays(anniversary, renewal.withinDays) : null;
    if (!dueOn) return { status: "no_date", dueOn: null, basis: "missing" };
    return { status: statusFromDue(dueOn, input.today), dueOn, basis: "declaration" };
  }
  if (renewal.mode === "centre_policy" || renewal.mode === "unconfirmed") {
    const months = input.policyMonths;
    if (months && months >= 1 && months <= 60) {
      const dueOn = addUtcMonths(issued, months);
      if (!dueOn) return { status: "no_date", dueOn: null, basis: "missing" };
      return { status: statusFromDue(dueOn, input.today), dueOn, basis: "centre_policy" };
    }
    if (renewal.mode === "unconfirmed") {
      return { status: "unconfirmed", dueOn: null, basis: "unconfirmed" };
    }
    return { status: "needs_policy", dueOn: null, basis: "centre_policy" };
  }
  return { status: "no_interval", dueOn: null, basis: "none_published" };
}

export function aggregateExpiry(statuses: readonly ReminderStatus[]): "expired" | "due_soon" | "current" | null {
  if (statuses.includes("expired")) return "expired";
  if (statuses.includes("due_soon")) return "due_soon";
  if (statuses.includes("current")) return "current";
  return null;
}

export function expiryStatusLine(status: "expired" | "due_soon" | "current", locale: "en" | "fr"): string {
  if (locale === "fr") {
    if (status === "expired") return "Certaines vérifications enregistrées dépassent la date que le centre a inscrite.";
    if (status === "due_soon") return "Certaines vérifications enregistrées arrivent bientôt à échéance.";
    return "Les vérifications enregistrées sont encore dans les dates que le centre a inscrites.";
  }
  if (status === "expired") return "Some recorded checks are past the date the centre saved.";
  if (status === "due_soon") return "Some recorded checks are due soon.";
  return "Recorded checks are inside the dates the centre saved.";
}

export function attestationLine(input: { provinceName: string; asOf: string; locale: "en" | "fr" }): string {
  const place = input.provinceName.trim();
  const when = input.asOf.trim();
  if (input.locale === "fr") {
    return `Ce centre confirme que les vérifications d’antécédents exigées pour le personnel sont au dossier selon les règles de ${place} — fournies par le centre, en date du ${when}. KidEase ne vérifie pas ces contrôles.`;
  }
  return `This centre confirms required staff background checks are on file under ${place} rules - provided by the centre, as of ${when}. KidEase does not verify checks.`;
}

export function guideChrome(locale: "en" | "fr") {
  if (locale === "fr") {
    return {
      kicker: "KidEase",
      hubTitle: "Vérifications d’antécédents",
      hubWhat: "KidEase explique où obtenir les vérifications exigées pour travailler en garderie.",
      hubWhy: "Chaque province fixe ses propres règles. Le centre (le titulaire de permis) les obtient et garde le document officiel.",
      hubNext: "Choisissez votre province ou territoire.",
      searchLabel: "Chercher dans ce guide",
      searchPlaceholder: "Mot, rôle ou vérification",
      pickerLabel: "Province ou territoire",
      noMatches: "Aucun résultat. Essayez un autre mot, ou choisissez une autre province.",
      offTitle: "Ce guide n’est pas encore ouvert.",
      offBody: "KidEase ne fait pas les vérifications. Quand le guide sera ouvert, il indiquera les pages officielles.",
      home: "Accueil",
      contact: "Nous joindre",
      back: "Toutes les provinces",
      missing: "Ce guide n’est pas sur KidEase.",
      search: "Chercher une garderie",
      rolesTitle: "Selon le rôle",
      what: "Ce qui est exigé",
      when: "Échéance",
      where: "Où faire la demande",
      documents: "Documents",
      cost: "Coût publié",
      renewal: "Renouvellement",
      keeper: "Qui garde la copie officielle",
      sources: "Source officielle",
      unconfirmed: "Non confirmé",
      asOf: "Lu le",
      disclaimer:
        "KidEase ne fait pas de vérifications policières ni de registres et ne décide pas qui peut travailler auprès des enfants. Votre centre est responsable de suivre les règles officielles. Les frais et les délais sont fixés par la police ou le ministère, et peuvent changer.",
      roleLabels: {
        centre_staff: "Personnel du centre",
        volunteer_student: "Bénévoles et étudiants",
        home_provider: "Responsable en milieu familial",
        home_resident: "Personnes qui habitent le milieu familial",
        operator: "Exploitant",
      } as Record<BgRole, string>,
    };
  }
  return {
    kicker: "KidEase",
    hubTitle: "Background checks",
    hubWhat: "KidEase explains where to get the checks a daycare role needs.",
    hubWhy: "Each province sets its own rules. The centre (the licence holder) gets the check and keeps the official copy.",
      hubNext: "Pick your province or territory.",
      searchLabel: "Search this guide",
      searchPlaceholder: "Word, role, or check",
      pickerLabel: "Province or territory",
      noMatches: "Nothing matches. Try another word, or pick another province.",
    offTitle: "This guide is not on yet.",
    offBody: "KidEase does not run the checks. When this guide is on, it will point to the official pages.",
    home: "Home",
    contact: "Contact us",
    back: "All provinces",
    missing: "That guide is not on KidEase.",
    search: "Search for daycare",
    rolesTitle: "By role",
    what: "What is required",
    when: "Deadline",
    where: "Where to apply",
    documents: "Documents",
    cost: "Published cost",
    renewal: "Renewal",
    keeper: "Who keeps the official copy",
    sources: "Official source",
    unconfirmed: "Unconfirmed",
    asOf: "As of",
    disclaimer:
      "KidEase does not run police or registry checks and does not decide who may work with children. Your centre is responsible for following the official rules. Fees and wait times are set by the police or ministry, and can change.",
    roleLabels: {
      centre_staff: "Centre staff",
      volunteer_student: "Volunteers and students",
      home_provider: "Home provider",
      home_resident: "People who live in the home",
      operator: "Operator",
    } as Record<BgRole, string>,
  };
}

export function reminderLabel(status: ReminderStatus, locale: "en" | "fr"): string {
  const fr: Record<ReminderStatus, string> = {
    current: "Dans les dates",
    due_soon: "Bientôt dû",
    expired: "Expiré",
    needs_policy: "Politique du centre requise",
    unconfirmed: "Intervalle non confirmé",
    no_interval: "Aucun intervalle publié",
    no_date: "Date manquante",
  };
  const en: Record<ReminderStatus, string> = {
    current: "In date",
    due_soon: "Due soon",
    expired: "Expired",
    needs_policy: "Centre policy needed",
    unconfirmed: "Interval unconfirmed",
    no_interval: "No published interval",
    no_date: "Date missing",
  };
  return locale === "fr" ? fr[status] : en[status];
}

const FORBIDDEN_PUBLIC = [
  /background checked/i,
  /background-checked/i,
  /verified by kidease/i,
  /screening on file/i,
  /vérifié par kidease/i,
  /filtrage au dossier/i,
];

export function forbiddenPublicPhrase(text: string): string | null {
  for (const pattern of FORBIDDEN_PUBLIC) {
    if (pattern.test(text)) return pattern.source;
  }
  return null;
}

export function guidePlainText(): string {
  const chunks: string[] = [];
  for (const locale of ["en", "fr"] as const) {
    const chrome = guideChrome(locale);
    chunks.push(Object.values(chrome).filter((value) => typeof value === "string").join("\n"));
  }
  chunks.push(attestationLine({ provinceName: "Ontario", asOf: "22 November 2026", locale: "en" }));
  chunks.push(attestationLine({ provinceName: "Ontario", asOf: "22 novembre 2026", locale: "fr" }));
  for (const row of BG_JURISDICTIONS) {
    chunks.push(row.summaryEn, row.summaryFr);
    for (const note of Object.values(row.roleNotes)) {
      if (note) chunks.push(note.en, note.fr);
    }
    for (const check of row.checks) {
      chunks.push(
        check.titleEn,
        check.titleFr,
        check.whatEn,
        check.whatFr,
        check.whenEn,
        check.whenFr,
        check.whereEn,
        check.whereFr,
        check.documentsEn,
        check.documentsFr,
        check.costEn,
        check.costFr,
        check.renewalEn,
        check.renewalFr,
        check.keeperEn,
        check.keeperFr,
        check.unconfirmedEn || "",
        check.unconfirmedFr || "",
      );
    }
  }
  return chunks.join("\n");
}

export function canRecordBackgroundCheck(role: string | null | undefined): boolean {
  return role === "owner";
}

export function canViewBackgroundCheckRecords(role: string | null | undefined): boolean {
  return canRecordBackgroundCheck(role);
}

export function policyMonthsAllowed(province: string): boolean {
  const row = jurisdictionByCode(province);
  if (!row) return false;
  return row.checks.some((check) => check.renewal.mode === "centre_policy" || check.renewal.mode === "unconfirmed");
}

export function validPolicyMonths(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 60) return null;
  return value;
}
