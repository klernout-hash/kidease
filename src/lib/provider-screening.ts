/**
 * Daycare-provider screening — first slice (MB-first, Canada stubs).
 *
 * Honesty rules (same as src/lib/trust.ts):
 * - KidEase stores and reviews documents. It does not issue Vulnerable Sector
 *   Checks. Only local police / RCMP (or BC CRRP) can.
 * - Never emit "Background checked by KidEase".
 * - Public surfaces may show centre-level "Screening on file" only after Admin
 *   clears every required current document. Individual PDFs, person names, and
 *   the names of specific checks never go to guests or parents.
 */

import { isHomeBasedFacility, normalizeFacilityType } from "./facility-type.ts";
import type { CentreMemberRole } from "./centre-roles.ts";

export const SCREENING_ROLES = [
  "owner",
  "director",
  "staff",
  "volunteer",
  "home_resident",
] as const;
export type ScreeningRole = (typeof SCREENING_ROLES)[number];

export const SCREENING_DOC_KINDS = ["vsc", "child_abuse_registry", "prior_contact"] as const;
export type ScreeningDocKind = (typeof SCREENING_DOC_KINDS)[number];

export const SCREENING_DOC_STATUSES = [
  "missing",
  "letter_ready",
  "uploaded",
  "admin_review",
  "cleared",
  "rejected",
  "expired",
] as const;
export type ScreeningDocStatus = (typeof SCREENING_DOC_STATUSES)[number];

export const SCREENING_FACILITY_SCOPES = ["all", "home"] as const;
export type ScreeningFacilityScope = (typeof SCREENING_FACILITY_SCOPES)[number];

export const SCREENING_PACK_STATUSES = ["seeded", "stub"] as const;
export type ScreeningPackStatus = (typeof SCREENING_PACK_STATUSES)[number];

export const CA_PROVINCE_CODES = [
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
export type CaProvinceCode = (typeof CA_PROVINCE_CODES)[number];

export const SCREENING_MAX_BYTES = 4 * 1024 * 1024;
export const SCREENING_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

export const SCREENING_NOT_OWNER = "Only the centre owner can manage screening for the whole team.";
export const SCREENING_FORBIDDEN = "You can only open your own screening items.";
export const SCREENING_REJECT_REASON = "Add a short reason so the centre knows what to fix.";
export const SCREENING_BAD_FILE = "Upload a PDF or image under 4 MB.";
export const SCREENING_PERSON_NAME = "Enter the person’s name as it should appear on the police letter.";

export type ScreeningRequirement = {
  id: string;
  province: CaProvinceCode;
  screeningRole: ScreeningRole;
  docKind: ScreeningDocKind;
  required: boolean;
  minAge: number;
  facilityScope: ScreeningFacilityScope;
  packStatus: ScreeningPackStatus;
  notes: string;
};

const MB_VSC_NOTE =
  "Criminal Record Check with Vulnerable Sector Search. Issued only by local police or RCMP — KidEase cannot run or stamp this check. Required at 18+.";
const MB_CAR_NOTE =
  "Manitoba Child Abuse Registry Check. KidEase records the certificate; it does not search the registry itself.";
const MB_PRIOR_NOTE =
  "Prior Contact Check (Child and Family Services) for home-based licensees and adult household residents where the regulation applies.";
const STUB_VSC_NOTE =
  "Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.";

function req(
  province: CaProvinceCode,
  screeningRole: ScreeningRole,
  docKind: ScreeningDocKind,
  facilityScope: ScreeningFacilityScope,
  packStatus: ScreeningPackStatus,
  notes: string,
): ScreeningRequirement {
  return {
    id: `psr_${province.toLowerCase()}_${screeningRole}_${docKind}_${facilityScope}`,
    province,
    screeningRole,
    docKind,
    required: true,
    minAge: 18,
    facilityScope,
    packStatus,
    notes,
  };
}

function manitobaPack(): ScreeningRequirement[] {
  const roles: ScreeningRole[] = ["owner", "director", "staff", "volunteer"];
  const rows: ScreeningRequirement[] = [];
  for (const role of roles) {
    rows.push(req("MB", role, "vsc", "all", "seeded", MB_VSC_NOTE));
    rows.push(req("MB", role, "child_abuse_registry", "all", "seeded", MB_CAR_NOTE));
    rows.push(req("MB", role, "prior_contact", "home", "seeded", MB_PRIOR_NOTE));
  }
  rows.push(req("MB", "home_resident", "vsc", "home", "seeded", MB_VSC_NOTE));
  rows.push(req("MB", "home_resident", "child_abuse_registry", "home", "seeded", MB_CAR_NOTE));
  rows.push(req("MB", "home_resident", "prior_contact", "home", "seeded", MB_PRIOR_NOTE));
  return rows;
}

function stubPacks(): ScreeningRequirement[] {
  const rows: ScreeningRequirement[] = [];
  for (const province of CA_PROVINCE_CODES) {
    if (province === "MB") continue;
    rows.push(req(province, "owner", "vsc", "all", "stub", STUB_VSC_NOTE));
    rows.push(req(province, "staff", "vsc", "all", "stub", STUB_VSC_NOTE));
  }
  return rows;
}

/** Canonical seed used by tests and documented in migrations/0046_provider_screening.sql. */
export const SCREENING_REQUIREMENTS: readonly ScreeningRequirement[] = [...manitobaPack(), ...stubPacks()];

export function isScreeningRole(value: string | null | undefined): value is ScreeningRole {
  return (SCREENING_ROLES as readonly string[]).includes((value || "").trim());
}

export function isScreeningDocKind(value: string | null | undefined): value is ScreeningDocKind {
  return (SCREENING_DOC_KINDS as readonly string[]).includes((value || "").trim());
}

export function isScreeningDocStatus(value: string | null | undefined): value is ScreeningDocStatus {
  return (SCREENING_DOC_STATUSES as readonly string[]).includes((value || "").trim());
}

export function parseScreeningRole(value: string | null | undefined): ScreeningRole | null {
  const v = (value || "").trim();
  return isScreeningRole(v) ? v : null;
}

export function deskRoleToScreeningRole(role: string | null | undefined): ScreeningRole {
  const v = (role || "").trim();
  if (v === "owner") return "owner";
  if (v === "manager") return "director";
  if (v === "read_only") return "volunteer";
  return "staff";
}

export function isHomeBasedForScreening(facilityType: string | null | undefined): boolean {
  const type = normalizeFacilityType(facilityType);
  return type ? isHomeBasedFacility(type) : false;
}

export function requirementsFor(
  province: string,
  role: ScreeningRole,
  homeBased: boolean,
): ScreeningRequirement[] {
  const code = province.trim().toUpperCase();
  return SCREENING_REQUIREMENTS.filter((row) => {
    if (row.province !== code) return false;
    if (row.screeningRole !== role) return false;
    if (!row.required) return false;
    if (row.facilityScope === "home" && !homeBased) return false;
    return true;
  });
}

export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function effectiveDocStatus(
  doc: { status: ScreeningDocStatus; expiresOn?: string | null },
  now: Date = new Date(),
): ScreeningDocStatus {
  if (doc.status === "cleared" && doc.expiresOn) {
    const exp = Date.parse(`${doc.expiresOn.slice(0, 10)}T00:00:00Z`);
    if (Number.isFinite(exp) && exp < startOfUtcDay(now).getTime()) return "expired";
  }
  return doc.status;
}

export function isCurrentCleared(
  doc: { status: ScreeningDocStatus; expiresOn?: string | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!doc) return false;
  return effectiveDocStatus(doc, now) === "cleared";
}

export function centreEarnsScreeningOnFile(input: {
  province: string;
  facilityType?: string | null;
  people: Array<{ id: string; screeningRole: ScreeningRole; archivedAt?: string | null }>;
  documents: Array<{
    personId: string;
    docKind: ScreeningDocKind;
    status: ScreeningDocStatus;
    expiresOn?: string | null;
  }>;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const home = isHomeBasedForScreening(input.facilityType);
  const people = input.people.filter((p) => !p.archivedAt);
  const requiredPeople = people.filter((p) => requirementsFor(input.province, p.screeningRole, home).length > 0);
  if (!requiredPeople.length) return false;
  for (const person of requiredPeople) {
    const reqs = requirementsFor(input.province, person.screeningRole, home);
    for (const row of reqs) {
      const doc = input.documents.find((d) => d.personId === person.id && d.docKind === row.docKind);
      if (!isCurrentCleared(doc, now)) return false;
    }
  }
  return true;
}

export type ScreeningAction = "view_all" | "view_own" | "manage" | "act_own" | "add_person";

export function centreCanManageScreening(role: CentreMemberRole | null | undefined): boolean {
  return role === "owner";
}

export function centreCanViewScreening(role: CentreMemberRole | null | undefined): boolean {
  return role === "owner" || role === "manager" || role === "staff" || role === "read_only";
}

export function decideScreeningAccess(input: {
  actorRole: CentreMemberRole | null;
  actorUserId: string;
  targetUserId?: string | null;
  action: ScreeningAction;
}): { ok: true } | { ok: false; error: string } {
  if (!centreCanViewScreening(input.actorRole)) {
    return { ok: false, error: SCREENING_FORBIDDEN };
  }
  if (input.action === "view_all" || input.action === "manage" || input.action === "add_person") {
    if (!centreCanManageScreening(input.actorRole)) {
      return { ok: false, error: SCREENING_NOT_OWNER };
    }
    return { ok: true };
  }
  if (input.action === "view_own" || input.action === "act_own") {
    if (centreCanManageScreening(input.actorRole)) return { ok: true };
    if (input.targetUserId && input.targetUserId === input.actorUserId) return { ok: true };
    return { ok: false, error: SCREENING_FORBIDDEN };
  }
  return { ok: false, error: SCREENING_FORBIDDEN };
}

export function decideAdminScreeningReview(input: {
  action: "approve" | "reject";
  reason?: string;
  currentStatus: ScreeningDocStatus;
}): { ok: true; next: ScreeningDocStatus } | { ok: false; error: string } {
  if (input.currentStatus !== "uploaded" && input.currentStatus !== "admin_review") {
    return { ok: false, error: "This document is not waiting on Admin." };
  }
  if (input.action === "reject") {
    if (!(input.reason || "").trim()) return { ok: false, error: SCREENING_REJECT_REASON };
    return { ok: true, next: "rejected" };
  }
  return { ok: true, next: "cleared" };
}

export function parseScreeningUpload(input: {
  dataUrl?: string;
  mime?: string;
  filename?: string;
}):
  | { ok: true; dataUrl: string; mime: string; filename: string }
  | { ok: false; error: string } {
  const dataUrl = (input.dataUrl || "").trim();
  const mime = (input.mime || "").trim().toLowerCase().split(";")[0]?.trim() || "";
  const filename = (input.filename || "document").trim().slice(0, 160) || "document";
  if (!dataUrl.startsWith("data:") || !dataUrl.includes(",")) {
    return { ok: false, error: SCREENING_BAD_FILE };
  }
  if (!(SCREENING_MIME as readonly string[]).includes(mime)) {
    return { ok: false, error: SCREENING_BAD_FILE };
  }
  const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Math.floor((payload.length * 3) / 4);
  if (bytes <= 0 || bytes > SCREENING_MAX_BYTES) {
    return { ok: false, error: SCREENING_BAD_FILE };
  }
  return { ok: true, dataUrl, mime, filename };
}

export function publicScreeningPayload<T extends { screeningOnFile?: boolean; screeningOnFileAt?: string | null }>(
  item: T,
): { screeningOnFile: boolean; screeningOnFileAt: string | null } {
  return {
    screeningOnFile: Boolean(item.screeningOnFile),
    screeningOnFileAt: item.screeningOnFileAt ?? null,
  };
}

export function screeningLetterHtml(input: {
  locale?: "en" | "fr";
  centreName: string;
  personName: string;
  role: ScreeningRole;
  province: string;
  generatedOn: string;
}): string {
  const fr = input.locale === "fr";
  const roleEn: Record<ScreeningRole, string> = {
    owner: "owner / licensee",
    director: "director",
    staff: "staff member",
    volunteer: "volunteer",
    home_resident: "adult household resident",
  };
  const roleFr: Record<ScreeningRole, string> = {
    owner: "propriétaire / titulaire de permis",
    director: "direction",
    staff: "membre du personnel",
    volunteer: "bénévole",
    home_resident: "résident adulte du foyer",
  };
  const title = fr
    ? "Demande de vérification du secteur vulnérable"
    : "Request for a Vulnerable Sector Check";
  const lead = fr
    ? "Ceci est une lettre de demande. KidEase n’est pas un service de police et ne peut pas délivrer une vérification du secteur vulnérable. Seul le service de police local ou la GRC (ou le Programme de vérification des casiers judiciaires de la C.-B.) peut le faire."
    : "This is a request letter. KidEase is not a police service and cannot issue a Vulnerable Sector Check. Only your local police service or the RCMP (or BC’s Criminal Records Review Program) can.";
  const ask = fr
    ? `${input.personName} travaille ou réside auprès des enfants à ${input.centreName} (${input.province}) à titre de ${roleFr[input.role]}. Veuillez accepter une demande de contrôle du casier judiciaire avec vérification du secteur vulnérable.`
    : `${input.personName} works with or lives around children at ${input.centreName} (${input.province}) as ${roleEn[input.role]}. Please accept an application for a Criminal Record Check with Vulnerable Sector Search.`;
  const keep = fr
    ? "Remettez le certificat au centre. KidEase conserve une copie privée pour la révision Admin. Les parents ne voient jamais le PDF ni le nom de la personne."
    : "Give the certificate to the centre. KidEase keeps a private copy for Admin review. Parents never see the PDF or the person’s name.";
  return `<!doctype html>
<html lang="${fr ? "fr-CA" : "en-CA"}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 40rem; margin: 2rem auto; padding: 0 1.25rem; color: #1a1a1a; }
    h1 { font-size: 1.4rem; }
    p { line-height: 1.5; }
    .meta { color: #555; font-size: 0.9rem; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <p class="meta">KidEase · ${escapeHtml(input.generatedOn)}</p>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(lead)}</p>
  <p>${escapeHtml(ask)}</p>
  <p>${escapeHtml(keep)}</p>
  <p class="meta">${fr ? "Imprimez cette page ou enregistrez-la en PDF." : "Print this page or save it as a PDF."}</p>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function docKindLabel(kind: ScreeningDocKind, locale: "en" | "fr" = "en"): string {
  if (locale === "fr") {
    if (kind === "vsc") return "Contrôle du casier + secteur vulnérable";
    if (kind === "child_abuse_registry") return "Registre des mauvais traitements";
    return "Vérification des contacts antérieurs";
  }
  if (kind === "vsc") return "Criminal Record Check with Vulnerable Sector Search";
  if (kind === "child_abuse_registry") return "Child Abuse Registry Check";
  return "Prior Contact Check";
}
