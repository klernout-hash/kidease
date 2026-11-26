/**
 * Government desk pages: one list, used by the menu, the routes, and tests.
 * Pure. No database, no React. Every label has English and French.
 */

import type { GovLocale } from "./aggregate.ts";
import { suppressCount, K_ANONYMITY } from "./k-anonymity.ts";

export type GovLeaf =
  | "expiries"
  | "change-requests"
  | "incidents"
  | "complaints"
  | "complaint-updates"
  | "ratios"
  | "screening"
  | "compliance"
  | "fee-caps"
  | "escalations"
  | "inspection-sync"
  | "reports"
  | "analytics"
  | "funding"
  | "demand"
  | "vacancies"
  | "subsidy"
  | "centres"
  | "broadcasts"
  | "notifications"
  | "claim-notices"
  | "data"
  | "exports"
  | "audit"
  | "data-requests"
  | "settings";

export type GovPageDef = {
  leaf: GovLeaf;
  group: "overview" | "compliance" | "reports" | "centres" | "data";
  en: string;
  fr: string;
  leadEn: string;
  leadFr: string;
};

export const GOV_GROUPS: Array<{ id: GovPageDef["group"]; en: string; fr: string; first: GovLeaf | "" }> = [
  { id: "overview", en: "Overview", fr: "Aperçu", first: "" },
  { id: "compliance", en: "Compliance", fr: "Conformité", first: "change-requests" },
  { id: "reports", en: "Reports", fr: "Rapports", first: "reports" },
  { id: "centres", en: "Centres and notices", fr: "Centres et avis", first: "centres" },
  { id: "data", en: "Data and exports", fr: "Données et exportations", first: "data" },
];

const P = (
  leaf: GovLeaf,
  group: GovPageDef["group"],
  en: string,
  fr: string,
  leadEn: string,
  leadFr: string,
): GovPageDef => ({ leaf, group, en, fr, leadEn, leadFr });

export const GOV_PAGES: readonly GovPageDef[] = [
  P("change-requests", "compliance", "Change requests", "Demandes de changement", "Centres ask to change capacity, hours, address, or director. You approve, return, or decline. The public listing changes only after you approve.", "Les centres demandent de changer la capacité, les heures, l’adresse ou la direction. Vous approuvez, retournez ou refusez. La fiche publique change seulement après votre approbation."),
  P("incidents", "compliance", "Serious occurrences", "Événements graves", "Reports from centres in your province, with the filing deadline and an overdue flag.", "Les rapports des centres de votre province, avec l’échéance de dépôt et un signal de retard."),
  P("complaints", "compliance", "Complaints", "Plaintes", "Licensing complaints sent by families. No child names.", "Les plaintes de permis envoyées par les familles. Aucun nom d’enfant."),
  P("complaint-updates", "compliance", "Complaint updates", "Suivis de plaintes", "Updates sent back to the family on each complaint.", "Les suivis envoyés à la famille pour chaque plainte."),
  P("ratios", "compliance", "Room ratios", "Ratios par salle", "Pass or fail for each centre and age group right now, from today’s attendance and the staff shifts on file.", "Conforme ou non pour chaque centre et groupe d’âge en ce moment, selon les présences du jour et les quarts du personnel."),
  P("screening", "compliance", "Staff screening", "Vérifications du personnel", "Expired and due-soon screening records by centre. No staff names.", "Dossiers de vérification expirés ou bientôt dus, par centre. Aucun nom du personnel."),
  P("compliance", "compliance", "Compliance calendar", "Calendrier de conformité", "Licence expiry and inspection dates the centres and registries have given us.", "Les dates d’expiration de permis et d’inspection fournies par les centres et les registres."),
  P("expiries", "compliance", "Expiries and alerts", "Échéances et alertes", "Licences that expire soon.", "Les permis qui expirent bientôt."),
  P("fee-caps", "compliance", "Fee caps", "Plafonds de tarifs", "Centres whose saved daily fee is above your province’s published cap.", "Les centres dont le tarif quotidien enregistré dépasse le plafond publié de votre province."),
  P("escalations", "compliance", "Escalations", "Escalades", "Items past their response time.", "Les dossiers qui ont dépassé leur délai de réponse."),
  P("inspection-sync", "compliance", "Inspection sync", "Synchronisation des inspections", "Public inspection records matched to licences in your province.", "Les inspections publiques associées aux permis de votre province."),
  P("reports", "reports", "Reports", "Rapports", "Report tabs for your province.", "Les onglets de rapports pour votre province."),
  P("analytics", "reports", "Analytics", "Analyses", "Fees, trends, and demand.", "Tarifs, tendances et demande."),
  P("funding", "reports", "Funding report", "Rapport de financement", "Monthly enrolment and attendance checks from centres. Counts only. Groups under 5 are blank.", "Vérifications mensuelles des inscriptions et présences des centres. Des chiffres seulement. Les groupes de moins de 5 sont vides."),
  P("demand", "reports", "Saved-search demand", "Demande enregistrée", "Where families saved a daycare search, by area. Saved searches, not children.", "Où les familles ont enregistré une recherche, par secteur. Des recherches, pas des enfants."),
  P("vacancies", "reports", "Vacancies", "Places libres", "Open spots that centres or the provincial list reported.", "Les places libres déclarées par les centres ou la liste provinciale."),
  P("subsidy", "reports", "Subsidy cases", "Dossiers de subvention", "Subsidy cases families started through KidEase, by status.", "Les dossiers de subvention ouverts par les familles sur KidEase, par statut."),
  P("centres", "centres", "Centres", "Centres", "Licensed centres listed in your province.", "Les centres autorisés inscrits dans votre province."),
  P("broadcasts", "centres", "Notices to centres", "Avis aux centres", "Write a notice, save it as a draft, then send it to the centres you pick.", "Rédigez un avis, enregistrez-le comme brouillon, puis envoyez-le aux centres choisis."),
  P("notifications", "centres", "Notification centre", "Centre d’avis", "Notices sent to your desk account.", "Les avis envoyés à votre compte du bureau."),
  P("claim-notices", "centres", "Claim notices", "Avis de revendication", "Decisions on centres claiming their listing in your province.", "Les décisions sur les centres qui revendiquent leur fiche dans votre province."),
  P("data", "data", "Data sources", "Sources de données", "Where each number comes from.", "La provenance de chaque chiffre."),
  P("exports", "data", "Exports", "Exportations", "Download province totals as CSV or PDF.", "Téléchargez les totaux de la province en CSV ou PDF."),
  P("audit", "data", "Audit log", "Journal d’audit", "Who on your desk opened, exported, or changed what, and when.", "Qui, dans votre bureau, a ouvert, exporté ou modifié quoi, et quand."),
  P("data-requests", "data", "Data requests", "Demandes de données", "Privacy requests (access or delete) from people in your province.", "Les demandes de confidentialité (accès ou effacement) des personnes de votre province."),
  P("settings", "data", "Settings", "Paramètres", "Your desk account, province, and sign-in checks.", "Votre compte du bureau, votre province et vos vérifications de connexion."),
];

export function govPage(leaf: string): GovPageDef | null {
  return GOV_PAGES.find((page) => page.leaf === leaf) ?? null;
}

export function govPageTitle(leaf: string, locale: GovLocale): string {
  const page = govPage(leaf);
  if (!page) return locale === "fr" ? "Bureau" : "Desk";
  return locale === "fr" ? page.fr : page.en;
}

export function govPageHref(locale: GovLocale, leaf: GovLeaf | ""): string {
  const root = locale === "fr" ? "/fr/gov" : "/gov";
  return leaf ? `${root}/${leaf}` : root;
}

export function govGroupPages(group: GovPageDef["group"]): GovPageDef[] {
  return GOV_PAGES.filter((page) => page.group === group);
}

/* ---------- Serious occurrences ---------- */

export type IncidentClock = "filed" | "overdue" | "due_soon" | "open";

/** Filing clock. Hours come from the province rule (24 h placeholder when unknown). */
export function incidentClock(input: { awareAt: string; filedAt: string | null; hours: number; now: Date }): {
  state: IncidentClock;
  dueAt: string;
} {
  const aware = Date.parse(input.awareAt);
  const due = new Date((Number.isFinite(aware) ? aware : input.now.getTime()) + input.hours * 3_600_000);
  if (input.filedAt) return { state: "filed", dueAt: due.toISOString() };
  const left = due.getTime() - input.now.getTime();
  if (left < 0) return { state: "overdue", dueAt: due.toISOString() };
  if (left <= 6 * 3_600_000) return { state: "due_soon", dueAt: due.toISOString() };
  return { state: "open", dueAt: due.toISOString() };
}

/* ---------- Change requests (round trip) ---------- */

export type ChangeAction = "approve" | "return" | "decline" | "resubmit";
export type ChangeView = "to_review" | "returned" | "approved" | "declined";

/** Status column stays pending | approved | declined. A return is pending + returned_at. */
export function changeView(row: { status: string; returned_at: string | null }): ChangeView {
  if (row.status === "approved") return "approved";
  if (row.status === "declined") return "declined";
  return row.returned_at ? "returned" : "to_review";
}

export function changeTransition(
  view: ChangeView,
  action: ChangeAction,
  actor: "government" | "centre",
): { ok: true; status: "pending" | "approved" | "declined"; returned: boolean } | { ok: false; error: "state" | "actor" } {
  if (actor === "government") {
    if (view !== "to_review") return { ok: false, error: "state" };
    if (action === "approve") return { ok: true, status: "approved", returned: false };
    if (action === "decline") return { ok: true, status: "declined", returned: false };
    if (action === "return") return { ok: true, status: "pending", returned: true };
    return { ok: false, error: "actor" };
  }
  if (action !== "resubmit") return { ok: false, error: "actor" };
  if (view !== "returned") return { ok: false, error: "state" };
  return { ok: true, status: "pending", returned: false };
}

export function changeNoteOk(note: string, required: boolean): boolean {
  const text = note.trim();
  if (!text) return !required;
  return text.length >= 4 && text.length <= 500;
}

/* ---------- Staff screening ---------- */

export function screeningTally(rows: readonly { status: string }[]): { expired: number; expiring: number; current: number; missing: number } {
  const out = { expired: 0, expiring: 0, current: 0, missing: 0 };
  for (const row of rows) {
    if (row.status === "expired") out.expired += 1;
    else if (row.status === "expiring") out.expiring += 1;
    else if (row.status === "current") out.current += 1;
    else out.missing += 1;
  }
  return out;
}

/* ---------- Fee caps ---------- */

/** A posted daily fee above a verified cap is a flag. A monthly fee is never turned into a daily guess. */
export function feeOverCap(input: { dailyCents: number | null; capCents: number | null; verified: boolean }): boolean | null {
  if (input.dailyCents == null || input.capCents == null || !input.verified) return null;
  return input.dailyCents > input.capCents;
}

/* ---------- Broadcasts ---------- */

export type BroadcastStatus = "draft" | "sent";

/**
 * Who a send may reach. Outside production, only QA test centres
 * (is_test = 1 or admin-only listing) can receive a real send.
 */
export function broadcastTargets<T extends { id: string; province: string; qa: boolean }>(input: {
  centres: readonly T[];
  picked: readonly string[];
  province: string;
  production: boolean;
}): { allowed: T[]; blocked: string[] } {
  const want = new Set(input.picked);
  const allowed: T[] = [];
  const blocked: string[] = [];
  for (const centre of input.centres) {
    if (!want.has(centre.id)) continue;
    if (centre.province.trim().toUpperCase() !== input.province.trim().toUpperCase()) {
      blocked.push(centre.id);
      continue;
    }
    if (!input.production && !centre.qa) {
      blocked.push(centre.id);
      continue;
    }
    allowed.push(centre);
  }
  for (const id of input.picked) {
    if (!input.centres.some((centre) => centre.id === id)) blocked.push(id);
  }
  return { allowed, blocked };
}

export function broadcastDraftOk(input: { title: string; body: string }): boolean {
  const title = input.title.trim();
  const body = input.body.trim();
  return title.length >= 3 && title.length <= 120 && body.length >= 8 && body.length <= 500;
}

/* ---------- Suppressed CSV ---------- */

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  let text = String(value);
  // Spreadsheet formula guard: a cell that starts like a formula is kept as text.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * CSV for a count table. Count columns under K become blank, and the
 * label column of a blanked row stays (it names a province area, not a person).
 */
export function suppressedCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
  countColumns: readonly number[],
  k = K_ANONYMITY,
): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    const out = row.map((value, index) => {
      if (!countColumns.includes(index)) return csvCell(value);
      if (typeof value !== "number") return csvCell(value);
      return csvCell(suppressCount(value, k));
    });
    lines.push(out.join(","));
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

/** Show a count with the small-group rule. */
export function shownCount(n: number | null | undefined, locale: GovLocale): string {
  if (n == null) return locale === "fr" ? "Masqué (moins de 5)" : "Hidden (under 5)";
  const kept = suppressCount(n);
  if (kept == null) return locale === "fr" ? "Masqué (moins de 5)" : "Hidden (under 5)";
  return kept.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA");
}
