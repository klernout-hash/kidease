/**
 * Government desk pages. Every call runs behind the government sign-in and
 * second factor (govAuthMiddleware). Parent, daycare, and admin sessions are
 * rejected there. Rows are always limited to the official's province.
 *
 * Truth rules: no invented data. When a source has no rows, the page says so
 * with the source and the time it was checked. Counts under 5 are blanked.
 * Opens of sensitive pages, every export, and every change are written to
 * government_audit.
 */

import { createServerFn } from "@tanstack/react-start";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { getSql, type Sql } from "@/lib/db";
import { formatCad } from "@/lib/cad-format";
import { nid } from "@/lib/utils";
import { assertGovWritable, type GovActor } from "@/lib/server/gov-actor.server";
import { readScope } from "@/lib/server/compliance-common";
import { isAdminOnlyListing } from "@/lib/listing-visibility";
import { suppressRows, suppressCount } from "@/lib/gov/k-anonymity";
import {
  broadcastDraftOk,
  broadcastTargets,
  changeNoteOk,
  changeTransition,
  changeView,
  feeOverCap,
  govPage,
  incidentClock,
  screeningTally,
  suppressedCsv,
  type ChangeAction,
  type GovLeaf,
} from "@/lib/gov/desk";
import { incidentsMode, deadlineFor } from "@/lib/compliance/incidents";
import { complaintsMode } from "@/lib/compliance/complaints";
import { screeningMode, credentialStatus } from "@/lib/compliance/screening";
import { calendarMode } from "@/lib/compliance/calendar";
import { feeMode, publishedCapsFor } from "@/lib/compliance/fees";
import { fundingMode } from "@/lib/compliance/funding";
import { broadcastMode } from "@/lib/compliance/broadcast";
import { ratioMode } from "@/lib/compliance/ratios";
import { rosterRatio, staffOnShift, ROOM_BANDS } from "@/lib/staff-scheduling";
import type { RoomBand } from "@/lib/provincial-ratios";
import { changeRequestsEnabled, listingPatch, type ChangeField } from "@/lib/wiring/change-requests";

type Locale = "en" | "fr";
type Cell = string | number | null;

export type GovDeskStat = { key: string; label: string; value: number | null; tone?: "bad" | "warn" | "ok"; text?: string };
export type GovDeskRow = { id: string; cells: Cell[]; tone?: "bad" | "warn" | "ok"; detail?: string | null; meta?: Record<string, string | number | boolean | null> };
export type GovDeskTable = { headers: string[]; rows: GovDeskRow[]; countColumns: number[] };
export type GovDeskState = "live" | "empty" | "off" | "unavailable";

export type GovDeskPageData = {
  leaf: GovLeaf;
  locale: Locale;
  province: string;
  orgName: string;
  readOnly: boolean;
  demo: boolean;
  generatedAt: string;
  state: GovDeskState;
  /** Plain words: where the numbers come from. */
  source: string;
  notes: string[];
  stats: GovDeskStat[];
  table: GovDeskTable | null;
  extra: GovDeskExtra;
};

export type GovDeskExtra = {
  enabled?: boolean;
  history?: Array<{ requestId: string; role: string; action: string; note: string | null; at: string }>;
  updates?: Array<{ reportId: string; note: string; at: string }>;
  caps?: Array<{ ageKey: string; cents: number | null; source: string }>;
  mode?: string;
  production?: boolean;
  centres?: Array<{ id: string; name: string; city: string; email: boolean; qa: boolean }>;
  lastLogin?: string | null;
};

const t = (locale: Locale, en: string, fr: string) => (locale === "fr" ? fr : en);

function isLeaf(value: string): value is GovLeaf {
  return Boolean(govPage(value));
}

async function provinceFor(gov: GovActor): Promise<string> {
  const scope = await readScope(gov.userId).catch(() => null);
  return String(scope?.province || gov.province || "").trim().toUpperCase();
}

function day(value: unknown): string {
  if (!value) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return text.slice(0, 10);
}

function stamp(value: unknown): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** Real centres only. Test and demo listings never count on the desk. */
function realCentre(row: { name: string; slug: string | null; visibility: string | null; is_test: number | null }) {
  return !isAdminOnlyListing({ name: row.name, slug: row.slug, visibility: row.visibility, isTest: row.is_test });
}

/** Audit one desk event. Page opens are kept once per 15 minutes per page. */
export async function auditDesk(sql: Sql, gov: GovActor, province: string, action: string, dedupeOpen = false) {
  const name = action.slice(0, 80);
  try {
    if (dedupeOpen) {
      const recent = await sql<{ n: number }>`
        select count(*)::int as n from government_audit
        where user_id = ${gov.userId} and action = ${name} and created_at > now() - interval '15 minutes'
      `;
      if ((recent[0]?.n ?? 0) > 0) return;
    }
    await sql`
      insert into government_audit (id, user_id, action, province)
      values (${nid("ga")}, ${gov.userId}, ${name}, ${province || null})
    `;
  } catch {
    console.error("[gov-desk] audit write failed", name);
  }
}

function base(gov: GovActor, province: string, leaf: GovLeaf, locale: Locale): GovDeskPageData {
  return {
    leaf,
    locale,
    province,
    orgName: gov.orgName,
    readOnly: gov.readOnly || gov.demo,
    demo: gov.demo,
    generatedAt: new Date().toISOString(),
    state: "live",
    source: "",
    notes: [],
    stats: [],
    table: null,
    extra: {},
  };
}

function offPage(page: GovDeskPageData, flag: string): GovDeskPageData {
  page.state = "off";
  page.notes.push(
    t(page.locale, `This tool is switched off on KidEase (${flag}). Nothing is shown and nothing is sent.`, `Cet outil est éteint sur KidEase (${flag}). Rien n’est affiché et rien n’est envoyé.`),
  );
  return page;
}

/* ------------------------------------------------------------------ */
/* Compliance pages                                                    */
/* ------------------------------------------------------------------ */

async function changeRequestsPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  page.source = t(L, "Requests centres send from their daycare desk on KidEase.", "Les demandes envoyées par les centres depuis leur bureau KidEase.");
  type Row = { id: string; daycare_id: string; name: string; city: string; field: string; proposed_value: string; status: string; created_at: string; reviewed_at: string | null; returned_at: string | null; review_note: string | null };
  const rows: Row[] = await sql<Row>`
    select r.id, r.daycare_id, d.name, d.city, r.field, r.proposed_value, r.status, r.created_at, r.reviewed_at, r.returned_at, r.review_note
    from listing_change_requests r join daycares d on d.id = r.daycare_id
    where upper(r.province) = ${page.province}
    order by r.created_at desc limit 100
  `.catch(async () =>
    // Before migration 0234 is applied: no return columns yet.
    (await sql<Omit<Row, "returned_at" | "review_note">>`
      select r.id, r.daycare_id, d.name, d.city, r.field, r.proposed_value, r.status, r.created_at, r.reviewed_at
      from listing_change_requests r join daycares d on d.id = r.daycare_id
      where upper(r.province) = ${page.province}
      order by r.created_at desc limit 100
    `.catch(() => [])).map((row) => ({ ...row, returned_at: null, review_note: null })),
  );
  const label: Record<string, string> = {
    to_review: t(L, "To review", "À examiner"),
    returned: t(L, "Returned to centre", "Retournée au centre"),
    approved: t(L, "Approved", "Approuvée"),
    declined: t(L, "Declined", "Refusée"),
  };
  const fieldLabel: Record<string, string> = {
    capacity: t(L, "Capacity", "Capacité"),
    hours: t(L, "Hours", "Heures"),
    address: t(L, "Address", "Adresse"),
    director: t(L, "Director", "Direction"),
  };
  const ids = rows.map((row) => row.id);
  const events = ids.length
    ? await sql<{ request_id: string; actor_role: string; action: string; note: string | null; created_at: string }>`
        select request_id, actor_role, action, note, created_at from listing_change_request_events
        where request_id = any(${ids}::text[]) order by created_at asc
      `.catch(() => [])
    : [];
  const views = rows.map((row) => changeView(row));
  page.stats = [
    { key: "to_review", label: label.to_review, value: views.filter((v) => v === "to_review").length, tone: "warn" },
    { key: "returned", label: label.returned, value: views.filter((v) => v === "returned").length },
    { key: "approved", label: label.approved, value: views.filter((v) => v === "approved").length, tone: "ok" },
    { key: "declined", label: label.declined, value: views.filter((v) => v === "declined").length },
  ];
  page.table = {
    headers: [t(L, "Centre", "Centre"), t(L, "City", "Ville"), t(L, "Change", "Changement"), t(L, "New value", "Nouvelle valeur"), t(L, "Sent", "Envoyée"), t(L, "Status", "Statut")],
    countColumns: [],
    rows: rows.map((row, index) => ({
      id: row.id,
      tone: views[index] === "to_review" ? "warn" : undefined,
      cells: [row.name, row.city, fieldLabel[row.field] ?? row.field, row.proposed_value, day(row.created_at), label[views[index]]],
      detail: row.review_note,
      meta: { view: views[index] },
    })),
  };
  page.extra = {
    enabled: changeRequestsEnabled(),
    history: events.map((event) => ({ requestId: event.request_id, role: event.actor_role, action: event.action, note: event.note, at: stamp(event.created_at) })),
  };
  if (!changeRequestsEnabled()) {
    page.notes.push(t(L, "Centres cannot send listing changes yet: the change request switch (FEATURE_CHANGE_REQUESTS) is off. Requests already on file still show here.", "Les centres ne peuvent pas encore envoyer de changements : l’interrupteur (FEATURE_CHANGE_REQUESTS) est éteint. Les demandes déjà reçues s’affichent quand même."));
  }
  if (!rows.length) page.state = "empty";
}

async function incidentsPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  if (incidentsMode(process.env) === "off") return offPage(page, "FEATURE_INCIDENTS");
  const rule = deadlineFor(page.province);
  const hours = rule?.hours ?? 24;
  page.source = t(L, "Serious occurrence reports centres file on KidEase.", "Les rapports d’événements graves déposés par les centres sur KidEase.");
  page.notes.push(
    rule?.verified
      ? t(L, `Filing clock: ${hours} hours from when the centre became aware.`, `Délai de dépôt : ${hours} heures après la prise de connaissance par le centre.`)
      : t(L, `Filing clock: ${hours} hours. This is a KidEase placeholder until your province confirms its rule.`, `Délai de dépôt : ${hours} heures. C’est une valeur provisoire de KidEase jusqu’à la confirmation de votre province.`),
  );
  type Row = { id: string; name: string; city: string; kind: string; aware_at: string; filed_at: string | null; gov_reviewed_at: string | null };
  const rows: Row[] = await sql<Row>`
    select i.id, d.name, d.city, i.kind, i.aware_at, i.filed_at, i.gov_reviewed_at
    from serious_incidents i join daycares d on d.id = i.daycare_id
    where upper(i.province) = ${page.province}
    order by i.aware_at desc limit 100
  `.catch(async () =>
    (await sql<Omit<Row, "gov_reviewed_at">>`
      select i.id, d.name, d.city, i.kind, i.aware_at, i.filed_at
      from serious_incidents i join daycares d on d.id = i.daycare_id
      where upper(i.province) = ${page.province}
      order by i.aware_at desc limit 100
    `.catch(() => [])).map((row) => ({ ...row, gov_reviewed_at: null })),
  );
  const now = new Date();
  const clocks = rows.map((row) => incidentClock({ awareAt: String(row.aware_at), filedAt: row.filed_at ? String(row.filed_at) : null, hours, now }));
  const stateLabel: Record<string, string> = {
    filed: t(L, "Filed", "Déposé"),
    overdue: t(L, "Overdue", "En retard"),
    due_soon: t(L, "Due soon", "Bientôt dû"),
    open: t(L, "Open", "Ouvert"),
  };
  page.stats = [
    { key: "overdue", label: stateLabel.overdue, value: clocks.filter((c) => c.state === "overdue").length, tone: "bad" },
    { key: "due_soon", label: stateLabel.due_soon, value: clocks.filter((c) => c.state === "due_soon").length, tone: "warn" },
    { key: "filed", label: stateLabel.filed, value: clocks.filter((c) => c.state === "filed").length, tone: "ok" },
    { key: "unreviewed", label: t(L, "Not reviewed by your desk", "Non examinés par votre bureau"), value: rows.filter((r) => !r.gov_reviewed_at).length },
  ];
  page.table = {
    headers: [t(L, "Centre", "Centre"), t(L, "City", "Ville"), t(L, "Kind", "Type"), t(L, "Aware", "Connu le"), t(L, "Filing due", "Dépôt dû"), t(L, "Status", "Statut"), t(L, "Reviewed", "Examiné")],
    countColumns: [],
    rows: rows.map((row, index) => ({
      id: row.id,
      tone: clocks[index].state === "overdue" ? "bad" : clocks[index].state === "due_soon" ? "warn" : undefined,
      cells: [row.name, row.city, row.kind.replace(/_/g, " "), stamp(row.aware_at), stamp(clocks[index].dueAt), stateLabel[clocks[index].state], row.gov_reviewed_at ? day(row.gov_reviewed_at) : "—"],
    })),
  };
  if (!rows.length) page.state = "empty";
}

async function complaintsPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  if (complaintsMode(process.env) === "off") return offPage(page, "FEATURE_GOV_COMPLAINTS");
  page.source = t(L, "Licensing complaints families send through KidEase. Families do not name a child.", "Les plaintes de permis envoyées par les familles sur KidEase. Les familles ne nomment pas d’enfant.");
  const rows = await sql<{ id: string; tracking_code: string; kind: string; status: string; created_at: string; detail: string; name: string | null; city: string | null }>`
    select c.id, c.tracking_code, c.kind, c.status, c.created_at, c.detail, d.name, d.city
    from licensing_complaints c left join daycares d on d.id = c.daycare_id
    where upper(c.province) = ${page.province}
    order by c.created_at desc limit 100
  `.catch(() => []);
  const ids = rows.map((row) => row.id);
  const updates = ids.length
    ? await sql<{ report_id: string; note: string; created_at: string }>`
        select report_id, note, created_at from complaint_updates
        where source = 'gov_complaints' and report_id = any(${ids}::text[]) order by created_at asc
      `.catch(() => [])
    : [];
  const open = rows.filter((row) => row.status === "open");
  const stale = open.filter((row) => Date.now() - new Date(String(row.created_at)).getTime() > 14 * 86_400_000);
  page.stats = [
    { key: "open", label: t(L, "Open", "Ouvertes"), value: open.length, tone: "warn" },
    { key: "stale", label: t(L, "Open over 14 days", "Ouvertes depuis plus de 14 jours"), value: stale.length, tone: "bad" },
    { key: "closed", label: t(L, "Closed", "Fermées"), value: rows.length - open.length, tone: "ok" },
  ];
  page.table = {
    headers: [t(L, "Tracking", "Suivi"), t(L, "Centre", "Centre"), t(L, "Kind", "Type"), t(L, "Received", "Reçue"), t(L, "Status", "Statut"), t(L, "Updates", "Suivis")],
    countColumns: [],
    rows: rows.map((row) => ({
      id: row.id,
      tone: row.status === "open" ? "warn" : undefined,
      detail: row.detail,
      cells: [row.tracking_code, row.name ? `${row.name}${row.city ? `, ${row.city}` : ""}` : "—", row.kind, day(row.created_at), row.status === "open" ? t(L, "Open", "Ouverte") : t(L, "Closed", "Fermée"), updates.filter((u) => u.report_id === row.id).length],
      meta: { status: row.status },
    })),
  };
  page.extra = { updates: updates.map((u) => ({ reportId: u.report_id, note: u.note, at: stamp(u.created_at) })) };
  if (!rows.length) page.state = "empty";
}

async function complaintUpdatesPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  page.source = t(L, "Updates your desk sent to families about their complaint.", "Les suivis envoyés par votre bureau aux familles sur leur plainte.");
  const rows = await sql<{ id: string; note: string; created_at: string; tracking_code: string | null }>`
    select u.id, u.note, u.created_at, c.tracking_code
    from complaint_updates u left join licensing_complaints c on c.id = u.report_id
    where upper(u.province) = ${page.province}
    order by u.created_at desc limit 100
  `.catch(() => []);
  page.stats = [{ key: "sent", label: t(L, "Updates sent", "Suivis envoyés"), value: rows.length }];
  page.table = {
    headers: [t(L, "Tracking", "Suivi"), t(L, "Update", "Suivi"), t(L, "Sent", "Envoyé")],
    countColumns: [],
    rows: rows.map((row) => ({ id: row.id, cells: [row.tracking_code ?? "—", row.note, stamp(row.created_at)] })),
  };
  page.notes.push(t(L, "To send a new update, open Complaints and pick one.", "Pour envoyer un nouveau suivi, ouvrez Plaintes et choisissez-en une."));
  if (!rows.length) page.state = "empty";
}

function normBand(value: string | null): string | null {
  const v = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  if (!v) return null;
  if (v.startsWith("infant")) return "infant";
  if (v.startsWith("toddler")) return "toddler";
  if (v.startsWith("preschool") || v === "pre-school") return "preschool";
  if (v.startsWith("school")) return "school-age";
  return null;
}

function bandLabel(band: string, L: Locale) {
  const map: Record<string, [string, string]> = {
    infant: ["Infant", "Poupons"],
    toddler: ["Toddler", "Bambins"],
    preschool: ["Preschool", "Préscolaire"],
    "school-age": ["School age", "Âge scolaire"],
  };
  const pair = map[band] ?? [band, band];
  return L === "fr" ? pair[1] : pair[0];
}

async function ratiosPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  if (ratioMode(process.env) === "off") return offPage(page, "FEATURE_RATIO_MONITOR");
  page.source = t(L, "Children checked in today (attendance) and staff on shift right now (staff schedule), per centre and age group. Rooms are grouped by age group because shifts are scheduled by age group.", "Enfants arrivés aujourd’hui (présences) et personnel en quart maintenant (horaire), par centre et groupe d’âge. Les salles sont regroupées par groupe d’âge, car les quarts sont planifiés ainsi.");
  const centres = await sql<{ id: string; name: string; city: string; slug: string | null; visibility: string | null; is_test: number | null }>`
    select id, name, city, slug, visibility, is_test from daycares where upper(province) = ${page.province}
      and id in (select daycare_id from staff_shifts union select daycare_id from attendance where day >= current_date - 1)
    limit 300
  `.catch(() => []);
  const real = centres.filter(realCentre);
  const ids = real.map((c) => c.id);
  const present = ids.length
    ? await sql<{ daycare_id: string; band: string | null; n: number }>`
        select a.daycare_id, b.age_group as band, count(*)::int as n
        from attendance a left join bookings b on b.id = a.booking_id
        where a.daycare_id = any(${ids}::text[]) and a.day = current_date and a.status = 'arrived'
        group by a.daycare_id, b.age_group
      `.catch(() => [])
    : [];
  const shifts = ids.length
    ? await sql<{ daycare_id: string; room_band: string; starts_at: string; ends_at: string }>`
        select daycare_id, room_band, starts_at, ends_at from staff_shifts
        where daycare_id = any(${ids}::text[]) and ends_at > now() - interval '1 day' and starts_at < now() + interval '1 day'
      `.catch(() => [])
    : [];
  const now = new Date();
  const rows: GovDeskRow[] = [];
  let fail = 0;
  let pass = 0;
  let unknown = 0;
  for (const centre of real) {
    const centreShifts = shifts
      .filter((s) => s.daycare_id === centre.id)
      .map((s) => ({ roomBand: s.room_band, startsAt: String(s.starts_at), endsAt: String(s.ends_at) }));
    for (const band of ROOM_BANDS) {
      const kids = present
        .filter((p) => p.daycare_id === centre.id && normBand(p.band) === band)
        .reduce((sum, p) => sum + Number(p.n || 0), 0);
      const staff = staffOnShift(centreShifts, band, now);
      if (!kids && !staff) continue;
      const result = rosterRatio({ province: page.province, band: band as RoomBand, childrenPresent: kids, staffOnShift: staff });
      const verdict = result.status === "out" ? "fail" : result.status === "unknown" ? "unknown" : "pass";
      if (verdict === "fail") fail += 1;
      else if (verdict === "pass") pass += 1;
      else unknown += 1;
      const resultText =
        verdict === "fail"
          ? t(L, "Fail", "Non conforme")
          : verdict === "pass"
            ? result.status === "near"
              ? t(L, "Pass (at limit)", "Conforme (à la limite)")
              : t(L, "Pass", "Conforme")
            : t(L, "No verified rule", "Aucune règle vérifiée");
      rows.push({
        id: `${centre.id}:${band}`,
        tone: verdict === "fail" ? "bad" : result.status === "near" ? "warn" : undefined,
        cells: [
          centre.name,
          centre.city,
          bandLabel(band, L),
          kids > 0 && kids < 5 ? t(L, "Under 5", "Moins de 5") : kids,
          staff,
          result.staffToChildren ? `1:${result.staffToChildren}` : "—",
          resultText,
        ],
      });
    }
  }
  const unbanded = present.filter((p) => !normBand(p.band)).reduce((sum, p) => sum + Number(p.n || 0), 0);
  if (unbanded) {
    page.notes.push(t(L, "Some checked-in children have no age group on their enrolment, so they are not in a room count.", "Certains enfants arrivés n’ont pas de groupe d’âge à l’inscription; ils ne sont pas comptés dans une salle."));
  }
  const manual = await sql<{ n: number }>`
    select count(*)::int as n from ratio_checks where upper(province) = ${page.province} and ok = 0 and checked_at > now() - interval '31 days'
  `.catch(() => [{ n: 0 }]);
  page.stats = [
    { key: "fail", label: t(L, "Rooms failing now", "Salles non conformes"), value: fail, tone: "bad" },
    { key: "pass", label: t(L, "Rooms passing now", "Salles conformes"), value: pass, tone: "ok" },
    { key: "unknown", label: t(L, "No verified rule", "Sans règle vérifiée"), value: unknown },
    { key: "manual", label: t(L, "Breaches centres logged (31 days)", "Écarts notés par les centres (31 jours)"), value: suppressCount(Number(manual[0]?.n ?? 0)) },
  ];
  page.table = {
    headers: [t(L, "Centre", "Centre"), t(L, "City", "Ville"), t(L, "Age group", "Groupe d’âge"), t(L, "Children in", "Enfants présents"), t(L, "Staff on shift", "Personnel en quart"), t(L, "Rule", "Règle"), t(L, "Result", "Résultat")],
    countColumns: [],
    rows,
  };
  if (!rows.length) {
    page.state = "empty";
    page.notes.push(t(L, "No centre in your province has attendance or staff shifts on KidEase right now.", "Aucun centre de votre province n’a de présences ou de quarts sur KidEase en ce moment."));
  }
}

async function screeningPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  if (screeningMode(process.env) === "off") return offPage(page, "FEATURE_STAFF_SCREENING");
  page.source = t(L, "Screening dates centres saved on KidEase (criminal record and vulnerable sector checks, first aid, and others). No staff names are shown.", "Dates de vérification enregistrées par les centres sur KidEase (casier judiciaire, secteur vulnérable, premiers soins, etc.). Aucun nom n’est affiché.");
  const rows = await sql<{ daycare_id: string; name: string; city: string; expires_on: string | null }>`
    select c.daycare_id, d.name, d.city, c.expires_on::text as expires_on
    from staff_credentials c join daycares d on d.id = c.daycare_id
    where upper(c.province) = ${page.province} limit 5000
  `.catch(() => []);
  const today = new Date().toISOString().slice(0, 10);
  const statusOf = (value: string | null) => credentialStatus(value ? String(value).slice(0, 10) : null, today);
  const byCentre = new Map<string, { name: string; city: string; statuses: { status: string }[] }>();
  for (const row of rows) {
    const entry = byCentre.get(row.daycare_id) ?? { name: row.name, city: row.city, statuses: [] };
    entry.statuses.push({ status: statusOf(row.expires_on) });
    byCentre.set(row.daycare_id, entry);
  }
  const all = screeningTally(rows.map((row) => ({ status: statusOf(row.expires_on) })));
  page.stats = [
    { key: "expired", label: t(L, "Expired records", "Dossiers expirés"), value: all.expired, tone: "bad" },
    { key: "expiring", label: t(L, "Due in 60 days", "Dus dans 60 jours"), value: all.expiring, tone: "warn" },
    { key: "current", label: t(L, "Current", "À jour"), value: all.current, tone: "ok" },
    { key: "centres", label: t(L, "Centres with records", "Centres avec dossiers"), value: byCentre.size },
  ];
  page.table = {
    headers: [t(L, "Centre", "Centre"), t(L, "City", "Ville"), t(L, "Expired", "Expirés"), t(L, "Due in 60 days", "Dus dans 60 jours"), t(L, "Current", "À jour")],
    countColumns: [],
    rows: [...byCentre.entries()]
      .map(([id, entry]) => {
        const tally = screeningTally(entry.statuses);
        const tone: GovDeskRow["tone"] = tally.expired ? "bad" : tally.expiring ? "warn" : undefined;
        return { id, tone, cells: [entry.name, entry.city, tally.expired, tally.expiring, tally.current] as Cell[] };
      })
      .sort((a, b) => Number(b.cells[2]) - Number(a.cells[2]) || Number(b.cells[3]) - Number(a.cells[3])),
  };
  if (!rows.length) page.state = "empty";
}

async function calendarPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  if (calendarMode(process.env) === "off") return offPage(page, "FEATURE_COMPLIANCE_CALENDAR");
  page.source = t(L, "Licence expiry dates matched from the provincial licence registry, dates centres saved on KidEase, and public inspection records.", "Dates d’expiration de permis du registre provincial, dates enregistrées par les centres sur KidEase et inspections publiques.");
  const licences = await sql<{ id: string; name: string; city: string; license_expiry: string; slug: string | null; visibility: string | null; is_test: number | null }>`
    select id, name, city, license_expiry::text as license_expiry, slug, visibility, is_test from daycares
    where upper(province) = ${page.province} and license_expiry is not null
      and license_expiry < current_date + interval '180 days'
    order by license_expiry asc limit 200
  `.catch(() => []);
  const dates = await sql<{ id: string; name: string; city: string; kind: string; due_on: string }>`
    select c.id, d.name, d.city, c.kind, c.due_on::text as due_on
    from compliance_dates c join daycares d on d.id = c.daycare_id
    where upper(c.province) = ${page.province} and c.completed_at is null
    order by c.due_on asc limit 200
  `.catch(() => []);
  const inspections = await sql<{ n: number }>`
    select count(*)::int as n from listing_inspections where upper(province) = ${page.province}
  `.catch(() => [{ n: 0 }]);
  const today = new Date().toISOString().slice(0, 10);
  const rows: GovDeskRow[] = [];
  for (const row of licences.filter(realCentre)) {
    const due = String(row.license_expiry).slice(0, 10);
    rows.push({ id: `lic:${row.id}`, tone: due < today ? "bad" : "warn", cells: [row.name, row.city, t(L, "Licence expiry", "Expiration du permis"), due, due < today ? t(L, "Past due", "Dépassé") : t(L, "Coming up", "À venir"), t(L, "Licence registry", "Registre des permis")] });
  }
  for (const row of dates) {
    const due = String(row.due_on).slice(0, 10);
    rows.push({ id: `cal:${row.id}`, tone: due < today ? "bad" : undefined, cells: [row.name, row.city, row.kind.replace(/_/g, " "), due, due < today ? t(L, "Past due", "Dépassé") : t(L, "Coming up", "À venir"), t(L, "Saved by centre", "Saisi par le centre")] });
  }
  rows.sort((a, b) => String(a.cells[3]).localeCompare(String(b.cells[3])));
  const inspected = Number(inspections[0]?.n ?? 0);
  page.stats = [
    { key: "past", label: t(L, "Past due", "Dépassés"), value: rows.filter((r) => String(r.cells[3]) < today).length, tone: "bad" },
    { key: "soon", label: t(L, "Due in 180 days", "Dus dans 180 jours"), value: rows.filter((r) => String(r.cells[3]) >= today).length, tone: "warn" },
    { key: "inspections", label: t(L, "Inspection records on file", "Inspections au dossier"), value: inspected || null, text: inspected ? undefined : t(L, "Not connected yet", "Pas encore relié") },
  ];
  page.table = {
    headers: [t(L, "Centre", "Centre"), t(L, "City", "Ville"), t(L, "What", "Quoi"), t(L, "Date", "Date"), t(L, "Status", "Statut"), t(L, "Source", "Source")],
    countColumns: [],
    rows,
  };
  if (!inspected) {
    page.notes.push(t(L, `Inspection dates are not connected for ${page.province} yet. No inspection date is shown until a public source is linked.`, `Les dates d’inspection ne sont pas encore reliées pour ${page.province}. Aucune date n’est affichée avant qu’une source publique soit reliée.`));
  }
  if (!rows.length) {
    page.state = "empty";
    page.notes.push(t(L, "No licence or compliance date in the next 180 days is on file for your province.", "Aucune date de permis ou de conformité dans les 180 prochains jours n’est au dossier pour votre province."));
  }
}

async function feeCapsPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  if (feeMode(process.env) === "off") return offPage(page, "FEATURE_FEE_CAPS");
  const caps = publishedCapsFor(page.province);
  page.source = t(L, "Daily fees centres saved on KidEase, compared with your province’s published cap. A monthly fee is never turned into a guessed daily fee.", "Tarifs quotidiens enregistrés par les centres sur KidEase, comparés au plafond publié de votre province. Un tarif mensuel n’est jamais converti en tarif quotidien estimé.");
  const money = (cents: number) => formatCad(cents / 100, L);
  page.extra = { caps: caps.map((cap) => ({ ageKey: cap.ageKey, cents: cap.maxDailyCents, source: cap.source })) };
  if (!caps.length) {
    page.state = "unavailable";
    page.notes.push(t(L, "Fee caps are not available in your province yet: no single verified, province-wide daily cap is on file, so nothing is compared.", "Les plafonds ne sont pas encore offerts dans votre province : aucun plafond quotidien vérifié pour toute la province n’est au dossier; rien n’est comparé."));
    return;
  }
  const rows = await sql<{ id: string; name: string; city: string; age_key: string; daily_cents: number; cap_cents: number; created_at: string }>`
    select f.id, d.name, d.city, f.age_key, f.daily_cents, f.cap_cents, f.created_at
    from fee_cap_flags f join daycares d on d.id = f.daycare_id
    where upper(f.province) = ${page.province}
    order by f.created_at desc limit 200
  `.catch(() => []);
  const flagged = rows.filter((row) => feeOverCap({ dailyCents: Number(row.daily_cents), capCents: Number(row.cap_cents), verified: true }));
  page.stats = [
    { key: "flagged", label: t(L, "Fees above the cap", "Tarifs au-dessus du plafond"), value: flagged.length, tone: "bad" },
    ...caps.slice(0, 3).map((cap) => ({
      key: `cap:${cap.ageKey}`,
      label: t(L, `Published cap (${cap.ageKey})`, `Plafond publié (${cap.ageKey})`),
      value: null,
      text: `${money(Number(cap.maxDailyCents))} / ${t(L, "day", "jour")}`,
    })),
  ];
  page.notes.push(caps[0].source);
  page.table = {
    headers: [t(L, "Centre", "Centre"), t(L, "City", "Ville"), t(L, "Age group", "Groupe d’âge"), t(L, "Daily fee", "Tarif quotidien"), t(L, "Cap", "Plafond"), t(L, "Saved", "Enregistré")],
    countColumns: [],
    rows: flagged.map((row) => ({ id: row.id, tone: "bad" as const, cells: [row.name, row.city, row.age_key, money(Number(row.daily_cents)), money(Number(row.cap_cents)), day(row.created_at)] })),
  };
  if (!flagged.length) page.state = "empty";
}

async function escalationsPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  page.source = t(L, "Items KidEase tracks with a response time (complaints, reports, requests).", "Dossiers suivis par KidEase avec un délai de réponse (plaintes, rapports, demandes).");
  const rows = await sql<{ id: string; kind: string; status: string; sla_hours: number; opened_at: string; resolved_at: string | null }>`
    select id, kind, status, sla_hours, opened_at, resolved_at from escalation_items
    where upper(province) = ${page.province} order by opened_at desc limit 100
  `.catch(() => []);
  const now = Date.now();
  const overdue = (row: (typeof rows)[number]) => !row.resolved_at && new Date(String(row.opened_at)).getTime() + Number(row.sla_hours) * 3_600_000 < now;
  page.stats = [
    { key: "overdue", label: t(L, "Past response time", "Délai dépassé"), value: rows.filter(overdue).length, tone: "bad" },
    { key: "open", label: t(L, "Open", "Ouverts"), value: rows.filter((r) => !r.resolved_at).length, tone: "warn" },
    { key: "resolved", label: t(L, "Resolved", "Réglés"), value: rows.filter((r) => r.resolved_at).length, tone: "ok" },
  ];
  page.table = {
    headers: [t(L, "Kind", "Type"), t(L, "Opened", "Ouvert"), t(L, "Response time", "Délai"), t(L, "Status", "Statut")],
    countColumns: [],
    rows: rows.map((row) => ({
      id: row.id,
      tone: overdue(row) ? "bad" : undefined,
      cells: [row.kind.replace(/_/g, " "), stamp(row.opened_at), `${row.sla_hours} h`, row.resolved_at ? t(L, "Resolved", "Réglé") : overdue(row) ? t(L, "Past due", "En retard") : t(L, "Open", "Ouvert")],
    })),
  };
  if (!rows.length) page.state = "empty";
}

async function inspectionSyncPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  page.source = t(L, "Public inspection records published by the province, matched to KidEase listings by licence number.", "Inspections publiques publiées par la province, associées aux fiches KidEase par numéro de permis.");
  const rows = await sql<{ id: string; licence_number: string; inspected_on: string; outcome: string | null; fetched_at: string; name: string | null }>`
    select i.id, i.licence_number, i.inspected_on::text as inspected_on, i.outcome, i.fetched_at,
      (select d.name from daycares d where upper(d.province) = upper(i.province) and d.license_number = i.licence_number limit 1) as name
    from listing_inspections i
    where upper(i.province) = ${page.province}
    order by i.inspected_on desc limit 100
  `.catch(() => []);
  if (!rows.length) {
    page.state = "unavailable";
    page.notes.push(t(L, `Inspection sync is not available in ${page.province} yet. No public inspection feed is connected for your province.`, `La synchronisation des inspections n’est pas encore offerte pour ${page.province}. Aucune source publique n’est reliée pour votre province.`));
    return;
  }
  page.stats = [
    { key: "records", label: t(L, "Inspection records", "Inspections"), value: rows.length },
    { key: "matched", label: t(L, "Matched to a listing", "Associées à une fiche"), value: rows.filter((r) => r.name).length },
  ];
  page.table = {
    headers: [t(L, "Licence", "Permis"), t(L, "Centre", "Centre"), t(L, "Inspected", "Inspecté le"), t(L, "Outcome", "Résultat"), t(L, "Fetched", "Récupéré")],
    countColumns: [],
    rows: rows.map((row) => ({ id: row.id, cells: [row.licence_number, row.name ?? t(L, "Not matched", "Non associé"), day(row.inspected_on), row.outcome ?? "—", day(row.fetched_at)] })),
  };
}

/* ------------------------------------------------------------------ */
/* Report pages                                                        */
/* ------------------------------------------------------------------ */

async function fundingPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  if (fundingMode(process.env) === "off") return offPage(page, "FEATURE_FUNDING_REPORTS");
  page.source = t(L, "Monthly funding checks centres ran on KidEase (enrolment compared with attendance). KidEase does not file them with the province.", "Vérifications mensuelles faites par les centres sur KidEase (inscriptions comparées aux présences). KidEase ne les dépose pas auprès de la province.");
  const rows = await sql<{ period: string; blocked: number; n: number }>`
    select period, blocked, count(*)::int as n from funding_reports where upper(province) = ${page.province}
    group by period, blocked order by period desc limit 48
  `.catch(() => []);
  const periods = [...new Set(rows.map((row) => row.period))];
  const count = (p: string, isBlocked: boolean) => Number(rows.find((r) => r.period === p && (Number(r.blocked) === 1) === isBlocked)?.n ?? 0);
  const cells = suppressRows(periods.flatMap((p) => [{ p, kind: "clean", n: count(p, false) }, { p, kind: "blocked", n: count(p, true) }]));
  const value = (p: string, kind: string) => cells.find((c) => c.p === p && c.kind === kind)?.n ?? null;
  const totalClean = periods.reduce((s, p) => s + count(p, false), 0);
  const totalBlocked = periods.reduce((s, p) => s + count(p, true), 0);
  page.stats = [
    { key: "clean", label: t(L, "Clean reports", "Rapports sans écart"), value: suppressCount(totalClean), tone: "ok" },
    { key: "blocked", label: t(L, "Reports with a mismatch", "Rapports avec écart"), value: suppressCount(totalBlocked), tone: "warn" },
  ];
  page.table = {
    headers: [t(L, "Month", "Mois"), t(L, "Clean", "Sans écart"), t(L, "Mismatch", "Écart")],
    countColumns: [1, 2],
    rows: periods.map((p) => ({ id: p, cells: [p, value(p, "clean"), value(p, "blocked")] })),
  };
  page.notes.push(t(L, "Groups under 5 are blank, and a neighbouring cell is blanked when a small one could be worked out.", "Les groupes de moins de 5 sont vides, et une cellule voisine est vidée quand une petite pourrait être déduite."));
  if (!periods.length) page.state = "empty";
}

const FSA_PROVINCE: Record<string, string[]> = {
  A: ["NL"], B: ["NS"], C: ["PE"], E: ["NB"], G: ["QC"], H: ["QC"], J: ["QC"], K: ["ON"], L: ["ON"], M: ["ON"], N: ["ON"], P: ["ON"], R: ["MB"], S: ["SK"], T: ["AB"], V: ["BC"], X: ["NT", "NU"], Y: ["YT"],
};

async function demandPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  page.source = t(L, "Daycare searches families saved on KidEase, placed by the postal code area (first three characters) they searched. These are searches, not children.", "Recherches enregistrées par les familles sur KidEase, classées par secteur postal (trois premiers caractères). Ce sont des recherches, pas des enfants.");
  const letters = Object.entries(FSA_PROVINCE).filter(([, provinces]) => provinces.includes(page.province)).map(([letter]) => letter);
  const rows = letters.length
    ? await sql<{ fsa: string; age_band: string | null; n: number }>`
        select upper(substr(replace(btrim(postal_code), ' ', ''), 1, 3)) as fsa, age_band, count(*)::int as n
        from saved_searches
        where postal_code is not null and upper(substr(btrim(postal_code), 1, 1)) = any(${letters}::text[])
        group by 1, 2 order by 1
      `.catch(() => [])
    : [];
  const cells = suppressRows(rows.map((row) => ({ fsa: row.fsa, age: row.age_band || "any", n: Number(row.n) || 0 })));
  const total = rows.reduce((s, r) => s + Number(r.n || 0), 0);
  page.stats = [
    { key: "searches", label: t(L, "Saved searches", "Recherches enregistrées"), value: suppressCount(total) },
    { key: "areas", label: t(L, "Postal areas", "Secteurs postaux"), value: new Set(rows.map((r) => r.fsa)).size },
  ];
  page.table = {
    headers: [t(L, "Postal area", "Secteur postal"), t(L, "Age group", "Groupe d’âge"), t(L, "Saved searches", "Recherches")],
    countColumns: [2],
    rows: cells.map((row, index) => ({ id: `${row.fsa}:${row.age}:${index}`, cells: [row.fsa, row.age, row.n] })),
  };
  page.notes.push(t(L, "Searches without a postal code are not placed on an area.", "Les recherches sans code postal ne sont pas classées par secteur."));
  if (!rows.length) page.state = "empty";
}

async function vacanciesPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  page.source = t(L, "Open spots centres posted on KidEase in the last 30 days, and the provincial vacancy list where your province publishes one.", "Places libres publiées par les centres sur KidEase dans les 30 derniers jours, et la liste provinciale lorsque votre province en publie une.");
  const listed = await sql<{ city: string; centres: number; spots: number }>`
    select city, count(*)::int as centres,
      sum(coalesce(spots_infant,0) + coalesce(spots_toddler,0) + coalesce(spots_preschool,0))::int as spots
    from daycares
    where upper(province) = ${page.province} and coalesce(is_test,0) = 0 and coalesce(is_demo,0) = 0
      and coalesce(visibility,'') <> 'admin_only' and merged_into is null
      and spots_updated_at > now() - interval '30 days'
    group by city order by spots desc nulls last limit 100
  `.catch(() => []);
  const provincial = await sql<{ n: number; total: number | null; as_of: string | null }>`
    select count(*)::int as n, sum(coalesce(total,0))::int as total, max(source_as_of)::text as as_of
    from provincial_vacancy where upper(province) = ${page.province}
  `.catch(() => [{ n: 0, total: 0, as_of: null }]);
  const prov = provincial[0] ?? { n: 0, total: 0, as_of: null };
  page.stats = [
    { key: "kidease", label: t(L, "Open spots posted (30 days)", "Places publiées (30 jours)"), value: listed.reduce((s, r) => s + Number(r.spots || 0), 0) },
    { key: "centres", label: t(L, "Centres reporting", "Centres déclarants"), value: listed.reduce((s, r) => s + Number(r.centres || 0), 0) },
    { key: "provincial", label: t(L, "Provincial list", "Liste provinciale"), value: Number(prov.n) ? Number(prov.total ?? 0) : null, text: Number(prov.n) ? undefined : t(L, "Not connected yet", "Pas encore relié") },
  ];
  if (Number(prov.n) && prov.as_of) page.notes.push(t(L, `Provincial list as of ${day(prov.as_of)}.`, `Liste provinciale au ${day(prov.as_of)}.`));
  page.table = {
    headers: [t(L, "City", "Ville"), t(L, "Centres reporting", "Centres déclarants"), t(L, "Open spots", "Places libres")],
    countColumns: [],
    rows: listed.map((row, index) => ({ id: `${row.city || "-"}:${index}`, cells: [row.city || "—", Number(row.centres), Number(row.spots)] })),
  };
  if (!listed.length && !Number(prov.n)) page.state = "empty";
}

async function subsidyPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  page.source = t(L, "Subsidy cases families opened through KidEase. Counts only.", "Dossiers de subvention ouverts par les familles sur KidEase. Des chiffres seulement.");
  const rows = await sql<{ status: string; n: number }>`
    select status, count(*)::int as n from subsidy_cases where upper(province) = ${page.province} group by status
  `.catch(() => []);
  const cells = suppressRows(rows.map((row) => ({ status: row.status, n: Number(row.n) || 0 })));
  const label: Record<string, string> = { submitted: t(L, "Submitted", "Soumis"), in_review: t(L, "In review", "En examen"), approved: t(L, "Approved", "Approuvé"), declined: t(L, "Declined", "Refusé") };
  page.stats = cells.map((row) => ({ key: row.status, label: label[row.status] ?? row.status, value: row.n }));
  page.table = { headers: [t(L, "Status", "Statut"), t(L, "Cases", "Dossiers")], countColumns: [1], rows: cells.map((row) => ({ id: row.status, cells: [label[row.status] ?? row.status, row.n] })) };
  page.notes.push(t(L, "Subsidy decisions are made by the province, not by KidEase.", "Les décisions de subvention sont prises par la province, pas par KidEase."));
  if (!rows.length) page.state = "empty";
}

/* ------------------------------------------------------------------ */
/* Centres, notices, data pages                                        */
/* ------------------------------------------------------------------ */

async function centresPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  page.source = t(L, "KidEase directory listings in your province, with licence details matched from the provincial registry.", "Fiches du répertoire KidEase dans votre province, avec les détails de permis du registre provincial.");
  const rows = await sql<{ id: string; name: string; city: string; license_number: string | null; license_status: string | null; licensed_capacity: number | null; claim_status: string | null; slug: string | null; visibility: string | null; is_test: number | null }>`
    select id, name, city, license_number, license_status, licensed_capacity, claim_status, slug, visibility, is_test
    from daycares where upper(province) = ${page.province} and merged_into is null
    order by city, name limit 1000
  `.catch(() => []);
  const real = rows.filter(realCentre);
  page.stats = [
    { key: "listed", label: t(L, "Listed centres", "Centres inscrits"), value: real.length },
    { key: "licensed", label: t(L, "With a licence number", "Avec un numéro de permis"), value: real.filter((r) => r.license_number).length },
    { key: "claimed", label: t(L, "Claimed by the centre", "Revendiqués par le centre"), value: real.filter((r) => r.claim_status === "approved" || r.claim_status === "claimed").length },
  ];
  page.table = {
    headers: [t(L, "Centre", "Centre"), t(L, "City", "Ville"), t(L, "Licence", "Permis"), t(L, "Licence status", "Statut du permis"), t(L, "Capacity", "Capacité")],
    countColumns: [],
    rows: real.map((row) => ({ id: row.id, cells: [row.name, row.city, row.license_number ?? "—", row.license_status ?? t(L, "Not matched", "Non associé"), row.licensed_capacity ?? "—"] })),
  };
  if (rows.length >= 1000) page.notes.push(t(L, "Showing the first 1,000 centres. Use Exports for province totals.", "Les 1 000 premiers centres sont affichés. Utilisez Exportations pour les totaux de la province."));
  if (!real.length) page.state = "empty";
}

async function broadcastsPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  const mode = broadcastMode(process.env);
  if (mode === "off") return offPage(page, "FEATURE_GOV_BROADCAST");
  const production = (process.env.VERCEL_ENV || "").trim() === "production";
  page.source = t(L, "Notices your desk wrote on KidEase. A send goes by email to the centres you pick. No texts, no calls.", "Avis rédigés par votre bureau sur KidEase. Un envoi part par courriel aux centres choisis. Aucun texto, aucun appel.");
  page.notes.push(
    mode === "live"
      ? t(L, "Sending is on: a confirmed send emails the picked centres.", "L’envoi est activé : un envoi confirmé écrit aux centres choisis.")
      : t(L, "Practice mode: a send is recorded and counted, but no email goes out.", "Mode pratique : l’envoi est noté et compté, mais aucun courriel ne part."),
  );
  if (!production) page.notes.push(t(L, "Test site: only KidEase test centres can be picked.", "Site de test : seuls les centres de test KidEase peuvent être choisis."));
  type Row = { id: string; title: string | null; body: string; status: string | null; created_at: string; sent_at: string | null; target_centre_ids: unknown; deliveries: number };
  const rows: Row[] = await sql<Row>`
    select b.id, b.title, b.body, b.status, b.created_at, b.sent_at, b.target_centre_ids,
      (select count(*)::int from gov_broadcast_deliveries d where d.broadcast_id = b.id) as deliveries
    from gov_broadcasts b where upper(b.province) = ${page.province}
    order by b.created_at desc limit 50
  `.catch(async () =>
    (await sql<{ id: string; body: string; created_at: string; deliveries: number }>`
      select b.id, b.body, b.created_at,
        (select count(*)::int from gov_broadcast_deliveries d where d.broadcast_id = b.id) as deliveries
      from gov_broadcasts b where upper(b.province) = ${page.province}
      order by b.created_at desc limit 50
    `.catch(() => [])).map((row) => ({ ...row, title: null, status: "sent", sent_at: row.created_at, target_centre_ids: null })),
  );
  const centres = await sql<{ id: string; name: string; city: string; contact_email: string | null; slug: string | null; visibility: string | null; is_test: number | null }>`
    select id, name, city, contact_email, slug, visibility, is_test from daycares
    where upper(province) = ${page.province} and merged_into is null
    order by name limit 1000
  `.catch(() => []);
  const pickable = centres
    .map((c) => ({ id: c.id, name: c.name, city: c.city, email: Boolean(c.contact_email), qa: !realCentre(c) }))
    .filter((c) => production || c.qa);
  const drafts = rows.filter((r) => r.status === "draft");
  page.stats = [
    { key: "drafts", label: t(L, "Drafts", "Brouillons"), value: drafts.length },
    { key: "sent", label: t(L, "Sent", "Envoyés"), value: rows.length - drafts.length },
  ];
  page.table = {
    headers: [t(L, "Title", "Titre"), t(L, "Status", "Statut"), t(L, "Created", "Créé"), t(L, "Sent", "Envoyé"), t(L, "Centres", "Centres"), t(L, "Deliveries", "Envois")],
    countColumns: [],
    rows: rows.map((row) => {
      const targets = Array.isArray(row.target_centre_ids) ? (row.target_centre_ids as string[]) : [];
      return {
        id: row.id,
        detail: row.body,
        cells: [row.title || row.body.slice(0, 60), row.status === "draft" ? t(L, "Draft", "Brouillon") : t(L, "Sent", "Envoyé"), day(row.created_at), row.sent_at ? stamp(row.sent_at) : "—", targets.length || "—", Number(row.deliveries)],
        meta: { status: row.status || "sent", title: row.title || "", targets: targets.join(",") },
      };
    }),
  };
  page.extra = { mode, production, centres: pickable };
  if (!rows.length) page.state = "empty";
}

/** Only desk links are followed from a notice. */
function safeGovHref(href: string | null): string | null {
  const value = String(href || "");
  return /^\/(fr\/)?gov(\/[a-z-]*)?$/.test(value) ? value : null;
}

async function notificationsPage(sql: Sql, page: GovDeskPageData, gov: GovActor) {
  const L = page.locale;
  page.source = t(L, "Notices KidEase sent to your desk account (new change requests, reports, and replies).", "Avis envoyés par KidEase à votre compte du bureau (nouvelles demandes, rapports et réponses).");
  const rows = await sql<{ id: string; title: string; body: string; href: string; created_at: string; read_at: string | null }>`
    select id, title, body, href, created_at, read_at from role_inbox where user_id = ${gov.userId}
    order by created_at desc limit 100
  `.catch(() => []);
  page.stats = [
    { key: "unread", label: t(L, "Unread", "Non lus"), value: rows.filter((r) => !r.read_at).length, tone: "warn" },
    { key: "all", label: t(L, "All notices", "Tous les avis"), value: rows.length },
  ];
  page.table = {
    headers: [t(L, "Notice", "Avis"), t(L, "Received", "Reçu"), t(L, "Status", "Statut")],
    countColumns: [],
    rows: rows.map((row) => ({
      id: row.id,
      detail: row.body,
      tone: row.read_at ? undefined : "warn",
      cells: [row.title, stamp(row.created_at), row.read_at ? t(L, "Read", "Lu") : t(L, "Unread", "Non lu")],
      meta: { href: safeGovHref(row.href), read: Boolean(row.read_at) },
    })),
  };
  if (!rows.length) page.state = "empty";
}

async function claimNoticesPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  page.source = t(L, "Decisions on centres that claimed their KidEase listing in your province.", "Décisions sur les centres qui ont revendiqué leur fiche KidEase dans votre province.");
  const rows = await sql<{ id: string; decision: string; created_at: string; name: string | null; city: string | null }>`
    select l.id, l.decision, l.created_at, d.name, d.city from claim_notice_log l left join daycares d on d.id = l.daycare_id
    where upper(l.province) = ${page.province} order by l.created_at desc limit 100
  `.catch(() => []);
  page.stats = [
    { key: "approved", label: t(L, "Approved", "Approuvées"), value: rows.filter((r) => r.decision === "approved").length, tone: "ok" },
    { key: "declined", label: t(L, "Declined", "Refusées"), value: rows.filter((r) => r.decision === "declined").length },
  ];
  page.table = {
    headers: [t(L, "Centre", "Centre"), t(L, "City", "Ville"), t(L, "Decision", "Décision"), t(L, "Date", "Date")],
    countColumns: [],
    rows: rows.map((row) => ({ id: row.id, cells: [row.name ?? "—", row.city ?? "—", row.decision === "approved" ? t(L, "Approved", "Approuvée") : t(L, "Declined", "Refusée"), day(row.created_at)] })),
  };
  if (!rows.length) page.state = "empty";
}

async function auditPage(sql: Sql, page: GovDeskPageData, gov: GovActor) {
  const L = page.locale;
  page.source = t(L, "The desk audit log: sign-ins, opens of private records, exports, and changes by people in your organization.", "Le journal d’audit du bureau : connexions, ouvertures de dossiers privés, exportations et changements par les personnes de votre organisation.");
  const rows = await sql<{ id: string; action: string; created_at: string; name: string | null }>`
    select a.id, a.action, a.created_at, coalesce(u.name, u.email) as name
    from government_audit a
    join government_members m on m.user_id = a.user_id and m.org_id = ${gov.orgId}
    left join "user" u on u.id = a.user_id
    order by a.created_at desc limit 200
  `.catch(() => []);
  const isChange = (action: string) => /^(change|broadcast|complaint|incident)/.test(action);
  page.stats = [
    { key: "events", label: t(L, "Events shown", "Événements affichés"), value: rows.length },
    { key: "exports", label: t(L, "Exports", "Exportations"), value: rows.filter((r) => r.action.startsWith("export")).length },
    { key: "changes", label: t(L, "Changes", "Changements"), value: rows.filter((r) => isChange(r.action)).length },
  ];
  page.table = {
    headers: [t(L, "When", "Quand"), t(L, "Who", "Qui"), t(L, "What", "Quoi")],
    countColumns: [],
    rows: rows.map((row) => ({ id: row.id, cells: [stamp(row.created_at), row.name ?? "—", row.action.replace(/_/g, " ").replace(":", " · ")] })),
  };
  page.notes.push(t(L, "Rows store an action, never a child or family name.", "Les lignes notent une action, jamais un nom d’enfant ou de famille."));
  if (!rows.length) page.state = "empty";
}

async function dataRequestsPage(sql: Sql, page: GovDeskPageData) {
  const L = page.locale;
  page.source = t(L, "Privacy requests (access or delete) people in your province sent to KidEase. Counts only, no names.", "Demandes de confidentialité (accès ou effacement) envoyées à KidEase par des personnes de votre province. Des chiffres seulement, aucun nom.");
  const rows = await sql<{ kind: string; status: string; n: number }>`
    select kind, status, count(*)::int as n from dsr_requests where upper(province) = ${page.province} group by kind, status order by kind, status
  `.catch(() => []);
  const cells = suppressRows(rows.map((row) => ({ kind: row.kind, status: row.status, n: Number(row.n) || 0 })));
  page.stats = [{ key: "requests", label: t(L, "Requests", "Demandes"), value: suppressCount(rows.reduce((s, r) => s + Number(r.n || 0), 0)) }];
  page.table = { headers: [t(L, "Kind", "Type"), t(L, "Status", "Statut"), t(L, "Requests", "Demandes")], countColumns: [2], rows: cells.map((row) => ({ id: `${row.kind}:${row.status}`, cells: [row.kind, row.status, row.n] })) };
  page.notes.push(t(L, "KidEase answers these requests. Your desk sees the totals only.", "KidEase répond à ces demandes. Votre bureau voit seulement les totaux."));
  if (!rows.length) page.state = "empty";
}

async function settingsPage(sql: Sql, page: GovDeskPageData, gov: GovActor) {
  const L = page.locale;
  page.source = t(L, "Your desk account on KidEase.", "Votre compte du bureau sur KidEase.");
  const keys = await sql<{ n: number }>`
    select count(*)::int as n from government_api_keys where user_id = ${gov.userId} and revoked_at is null
  `.catch(() => [{ n: 0 }]);
  const lastLogin = await sql<{ at: string | null }>`
    select max(created_at)::text as at from government_audit where user_id = ${gov.userId} and action = 'login'
  `.catch(() => [{ at: null }]);
  page.stats = [
    { key: "province", label: t(L, "Province", "Province"), value: null, text: page.province },
    { key: "access", label: t(L, "Access", "Accès"), value: null, text: gov.readOnly || gov.demo ? t(L, "Read only", "Lecture seule") : t(L, "Can review and send", "Peut examiner et envoyer") },
    { key: "factor", label: t(L, "Second sign-in step", "Deuxième étape de connexion"), value: null, text: t(L, "On (required)", "Activée (obligatoire)") },
    { key: "keys", label: t(L, "Active API keys", "Clés API actives"), value: Number(keys[0]?.n ?? 0) },
  ];
  page.extra = { lastLogin: lastLogin[0]?.at ? stamp(lastLogin[0].at) : null };
  page.notes.push(t(L, "To change your province or access, ask your organization’s KidEase contact.", "Pour changer votre province ou votre accès, demandez au contact KidEase de votre organisation."));
}

const SENSITIVE = new Set<GovLeaf>(["incidents", "complaints", "complaint-updates", "screening", "audit", "data-requests", "change-requests"]);

async function buildPage(gov: GovActor, leaf: GovLeaf, locale: Locale): Promise<GovDeskPageData> {
  const sql = await getSql();
  const province = await provinceFor(gov);
  const page = base(gov, province, leaf, locale);
  switch (leaf) {
    case "change-requests": await changeRequestsPage(sql, page); break;
    case "incidents": await incidentsPage(sql, page); break;
    case "complaints": await complaintsPage(sql, page); break;
    case "complaint-updates": await complaintUpdatesPage(sql, page); break;
    case "ratios": await ratiosPage(sql, page); break;
    case "screening": await screeningPage(sql, page); break;
    case "compliance": await calendarPage(sql, page); break;
    case "fee-caps": await feeCapsPage(sql, page); break;
    case "escalations": await escalationsPage(sql, page); break;
    case "inspection-sync": await inspectionSyncPage(sql, page); break;
    case "funding": await fundingPage(sql, page); break;
    case "demand": await demandPage(sql, page); break;
    case "vacancies": await vacanciesPage(sql, page); break;
    case "subsidy": await subsidyPage(sql, page); break;
    case "centres": await centresPage(sql, page); break;
    case "broadcasts": await broadcastsPage(sql, page); break;
    case "notifications": await notificationsPage(sql, page, gov); break;
    case "claim-notices": await claimNoticesPage(sql, page); break;
    case "audit": await auditPage(sql, page, gov); break;
    case "data-requests": await dataRequestsPage(sql, page); break;
    case "settings": await settingsPage(sql, page, gov); break;
    default:
      page.state = "unavailable";
      page.notes.push(t(locale, "This page is not available in your province yet.", "Cette page n’est pas encore offerte dans votre province."));
  }
  return page;
}

/* ------------------------------------------------------------------ */
/* Server functions (all behind govAuthMiddleware)                     */
/* ------------------------------------------------------------------ */

const localeOf = (value: unknown): Locale => (value === "fr" ? "fr" : "en");

export const loadGovDeskPage = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .validator((input: { leaf?: string; locale?: string }) => ({
    leaf: String(input?.leaf || "").slice(0, 40),
    locale: localeOf(input?.locale),
  }))
  .handler(async ({ context, data }) => {
    const gov = context.gov as GovActor;
    if (!isLeaf(data.leaf)) throw new Error("Unknown desk page");
    const page = await buildPage(gov, data.leaf, data.locale);
    if (SENSITIVE.has(data.leaf)) await auditDesk(await getSql(), gov, page.province, `open:${data.leaf}`, true);
    return page;
  });

const SUMMARY: Array<[GovLeaf, string]> = [
  ["change-requests", "to_review"],
  ["incidents", "overdue"],
  ["complaints", "open"],
  ["ratios", "fail"],
  ["screening", "expired"],
  ["compliance", "past"],
  ["fee-caps", "flagged"],
  ["notifications", "unread"],
];

/** Overview summary: one number per section, each with its page link. */
export const loadGovSummary = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .validator((input: { locale?: string } | undefined) => ({ locale: localeOf(input?.locale) }))
  .handler(async ({ context, data }) => {
    const gov = context.gov as GovActor;
    const pages = await Promise.all(SUMMARY.map(([leaf]) => buildPage(gov, leaf, data.locale).catch(() => null)));
    const out: Array<{ leaf: GovLeaf; state: GovDeskState; label: string; value: number | null; tone: string | null }> = [];
    pages.forEach((page, index) => {
      if (!page) return;
      const [leaf, key] = SUMMARY[index];
      const stat = page.stats.find((s) => s.key === key);
      out.push({ leaf, state: page.state, label: stat?.label ?? "", value: stat?.value ?? null, tone: stat?.tone ?? null });
    });
    return out;
  });

export const exportGovDeskCsv = createServerFn({ method: "POST" })
  .middleware([govAuthMiddleware])
  .validator((input: { leaf?: string; locale?: string }) => ({
    leaf: String(input?.leaf || "").slice(0, 40),
    locale: localeOf(input?.locale),
  }))
  .handler(async ({ context, data }) => {
    const gov = context.gov as GovActor;
    if (!isLeaf(data.leaf)) return { ok: false as const, error: "page" };
    const page = await buildPage(gov, data.leaf, data.locale);
    if (!page.table || !page.table.rows.length) return { ok: false as const, error: "empty" };
    const csv = suppressedCsv(page.table.headers, page.table.rows.map((row) => row.cells), page.table.countColumns);
    await auditDesk(await getSql(), gov, page.province, `export_csv:${data.leaf}`);
    return { ok: true as const, csv, filename: `kidease-${data.leaf}-${page.province.toLowerCase()}-${page.generatedAt.slice(0, 10)}.csv` };
  });

function writable(gov: GovActor): boolean {
  try {
    assertGovWritable(gov);
    return true;
  } catch {
    return false;
  }
}

export const govChangeDecision = createServerFn({ method: "POST" })
  .middleware([govAuthMiddleware])
  .validator((input: { id?: string; action?: string; note?: string }) => ({
    id: String(input?.id || "").slice(0, 80),
    action: String(input?.action || "").slice(0, 20) as ChangeAction,
    note: String(input?.note || "").slice(0, 500),
  }))
  .handler(async ({ context, data }) => {
    const gov = context.gov as GovActor;
    if (!writable(gov)) return { ok: false as const, error: "read_only" };
    if (!["approve", "return", "decline"].includes(data.action)) return { ok: false as const, error: "action" };
    if (!changeNoteOk(data.note, data.action !== "approve")) return { ok: false as const, error: "note" };
    const sql = await getSql();
    const province = await provinceFor(gov);
    const rows = await sql<{ id: string; daycare_id: string; province: string; field: string; proposed_value: string; status: string; returned_at: string | null }>`
      select id, daycare_id, province, field, proposed_value, status, returned_at from listing_change_requests where id = ${data.id} limit 1
    `.catch(() => null);
    if (rows === null) return { ok: false as const, error: "migration" };
    const row = rows[0];
    if (!row || String(row.province).toUpperCase() !== province) return { ok: false as const, error: "missing" };
    const move = changeTransition(changeView(row), data.action, "government");
    if (!move.ok) return { ok: false as const, error: move.error };
    if (move.status === "approved") {
      const patch = listingPatch(row.field as ChangeField, row.proposed_value);
      if ("licensed_capacity" in patch) await sql`update daycares set licensed_capacity = ${patch.licensed_capacity} where id = ${row.daycare_id}`;
      else if ("hours" in patch) await sql`update daycares set hours = ${String(patch.hours)}, hours_fr = ${String(patch.hours_fr)} where id = ${row.daycare_id}`;
      else if ("address" in patch) await sql`update daycares set address = ${String(patch.address)} where id = ${row.daycare_id}`;
      else if ("director_name" in patch) await sql`update daycares set director_name = ${String(patch.director_name)} where id = ${row.daycare_id}`;
    }
    await sql`
      update listing_change_requests
      set status = ${move.status},
          returned_at = ${move.returned ? new Date().toISOString() : null},
          review_note = ${data.note.trim() || null},
          reviewed_by = ${gov.userId}, reviewed_at = now()
      where id = ${row.id}
    `;
    await sql`
      insert into listing_change_request_events (id, request_id, actor_id, actor_role, action, note)
      values (${nid("cre")}, ${row.id}, ${gov.userId}, 'government', ${data.action}, ${data.note.trim() || null})
    `.catch(() => undefined);
    await auditDesk(sql, gov, province, `change_${data.action}`);
    try {
      const { deliverNotice } = await import("@/lib/server/wiring/runtime");
      const { changeRequestsMode } = await import("@/lib/wiring/change-requests");
      const owners = await sql<{ user_id: string }>`select user_id from provider_daycares where daycare_id = ${row.daycare_id}`.catch(() => []);
      const title = data.action === "approve" ? "Listing change approved" : data.action === "return" ? "Listing change returned" : "Listing change declined";
      const body = data.action === "return" ? "The province returned your listing change with a note. Fix it and send it again." : "The province reviewed your listing change.";
      for (const owner of owners) {
        await deliverNotice({ feature: "change_requests", flag: "FEATURE_CHANGE_REQUESTS", mode: changeRequestsMode(), userId: owner.user_id, role: "provider", title, body, href: "/provider/change-requests", province: row.province });
      }
    } catch {
      console.error("[gov-desk] change notice skipped");
    }
    return { ok: true as const, status: move.returned ? "returned" : move.status };
  });

export const govIncidentDetail = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .validator((input: { id?: string }) => ({ id: String(input?.id || "").slice(0, 80) }))
  .handler(async ({ context, data }) => {
    const gov = context.gov as GovActor;
    if (incidentsMode(process.env) === "off") return { ok: false as const, error: "off" };
    const sql = await getSql();
    const province = await provinceFor(gov);
    const rows = await sql<{ id: string; province: string; kind: string; summary: string; aware_at: string; filed_at: string | null; parent_notice_at: string | null; name: string; city: string; license_number: string | null }>`
      select i.id, i.province, i.kind, i.summary, i.aware_at, i.filed_at, i.parent_notice_at, d.name, d.city, d.license_number
      from serious_incidents i join daycares d on d.id = i.daycare_id where i.id = ${data.id} limit 1
    `.catch(() => []);
    const row = rows[0];
    if (!row || String(row.province).toUpperCase() !== province) return { ok: false as const, error: "missing" };
    await auditDesk(sql, gov, province, "open:incident_detail");
    const hours = deadlineFor(province)?.hours ?? 24;
    const clock = incidentClock({ awareAt: String(row.aware_at), filedAt: row.filed_at ? String(row.filed_at) : null, hours, now: new Date() });
    return {
      ok: true as const,
      incident: {
        id: row.id,
        centre: row.name,
        city: row.city,
        licence: row.license_number,
        kind: row.kind,
        // The child label the centre typed is never sent to the desk view.
        summary: row.summary,
        awareAt: stamp(row.aware_at),
        filedAt: row.filed_at ? stamp(row.filed_at) : null,
        dueAt: stamp(clock.dueAt),
        state: clock.state,
        parentNoticeAt: row.parent_notice_at ? stamp(row.parent_notice_at) : null,
      },
    };
  });

export const govIncidentReviewed = createServerFn({ method: "POST" })
  .middleware([govAuthMiddleware])
  .validator((input: { id?: string }) => ({ id: String(input?.id || "").slice(0, 80) }))
  .handler(async ({ context, data }) => {
    const gov = context.gov as GovActor;
    if (!writable(gov)) return { ok: false as const, error: "read_only" };
    const sql = await getSql();
    const province = await provinceFor(gov);
    const done = await sql<{ id: string }>`
      update serious_incidents set gov_reviewed_at = now(), gov_reviewed_by = ${gov.userId}
      where id = ${data.id} and upper(province) = ${province} returning id
    `.catch(() => null);
    if (done === null) return { ok: false as const, error: "migration" };
    if (!done.length) return { ok: false as const, error: "missing" };
    await auditDesk(sql, gov, province, "incident_reviewed");
    return { ok: true as const };
  });

export const govComplaintUpdate = createServerFn({ method: "POST" })
  .middleware([govAuthMiddleware])
  .validator((input: { id?: string; note?: string; close?: boolean; reopen?: boolean }) => ({
    id: String(input?.id || "").slice(0, 80),
    note: String(input?.note || "").slice(0, 500),
    close: Boolean(input?.close),
    reopen: Boolean(input?.reopen),
  }))
  .handler(async ({ context, data }) => {
    const gov = context.gov as GovActor;
    if (!writable(gov)) return { ok: false as const, error: "read_only" };
    if (complaintsMode(process.env) === "off") return { ok: false as const, error: "off" };
    const note = data.note.trim();
    if (!note && !data.close && !data.reopen) return { ok: false as const, error: "note" };
    if (note && (note.length < 4 || note.length > 500)) return { ok: false as const, error: "note" };
    const sql = await getSql();
    const province = await provinceFor(gov);
    const rows = await sql<{ id: string; province: string; parent_user_id: string | null; status: string }>`
      select id, province, parent_user_id, status from licensing_complaints where id = ${data.id} limit 1
    `.catch(() => []);
    const row = rows[0];
    if (!row || String(row.province).toUpperCase() !== province) return { ok: false as const, error: "missing" };
    if (note) {
      await sql`
        insert into complaint_updates (id, source, report_id, province, parent_user_id, note, actor_id)
        values (${nid("cu")}, 'gov_complaints', ${row.id}, ${province}, ${row.parent_user_id ?? ""}, ${note}, ${gov.userId})
      `;
    }
    if (data.close && row.status !== "closed") await sql`update licensing_complaints set status = 'closed' where id = ${row.id}`;
    if (data.reopen && row.status !== "open") await sql`update licensing_complaints set status = 'open' where id = ${row.id}`;
    await auditDesk(sql, gov, province, data.close ? "complaint_closed" : data.reopen ? "complaint_reopened" : "complaint_update");
    return { ok: true as const };
  });

export const govSaveBroadcast = createServerFn({ method: "POST" })
  .middleware([govAuthMiddleware])
  .validator((input: { id?: string; title?: string; body?: string; centreIds?: string[] }) => ({
    id: String(input?.id || "").slice(0, 80),
    title: String(input?.title || "").slice(0, 120),
    body: String(input?.body || "").slice(0, 500),
    centreIds: Array.isArray(input?.centreIds) ? input.centreIds.map((v) => String(v).slice(0, 80)).slice(0, 500) : [],
  }))
  .handler(async ({ context, data }) => {
    const gov = context.gov as GovActor;
    if (!writable(gov)) return { ok: false as const, error: "read_only" };
    if (broadcastMode(process.env) === "off") return { ok: false as const, error: "off" };
    if (!broadcastDraftOk(data)) return { ok: false as const, error: "text" };
    const sql = await getSql();
    const province = await provinceFor(gov);
    const targets = JSON.stringify(data.centreIds);
    if (data.id) {
      const done = await sql<{ id: string }>`
        update gov_broadcasts set title = ${data.title.trim()}, body = ${data.body.trim()}, target_centre_ids = ${targets}::jsonb, updated_at = now()
        where id = ${data.id} and upper(province) = ${province} and status = 'draft' returning id
      `.catch(() => null);
      if (done === null) return { ok: false as const, error: "migration" };
      if (!done.length) return { ok: false as const, error: "missing" };
      await auditDesk(sql, gov, province, "broadcast_draft_saved");
      return { ok: true as const, id: data.id };
    }
    const id = nid("brd");
    const done = await sql`
      insert into gov_broadcasts (id, province, audience_kind, body, created_by, status, title, target_centre_ids, updated_at)
      values (${id}, ${province}, 'centres', ${data.body.trim()}, ${gov.userId}, 'draft', ${data.title.trim()}, ${targets}::jsonb, now())
    `
      .then(() => true)
      .catch(() => false);
    if (!done) return { ok: false as const, error: "migration" };
    await auditDesk(sql, gov, province, "broadcast_draft_saved");
    return { ok: true as const, id };
  });

/**
 * Send a saved draft to its picked centres. Email only, never a text or call.
 * Practice mode records deliveries and sends nothing. Outside production only
 * KidEase test centres can be reached. The caller must type SEND to confirm.
 */
export const govSendBroadcast = createServerFn({ method: "POST" })
  .middleware([govAuthMiddleware])
  .validator((input: { id?: string; confirm?: string }) => ({
    id: String(input?.id || "").slice(0, 80),
    confirm: String(input?.confirm || ""),
  }))
  .handler(async ({ context, data }) => {
    const gov = context.gov as GovActor;
    if (!writable(gov)) return { ok: false as const, error: "read_only" };
    const mode = broadcastMode(process.env);
    if (mode === "off") return { ok: false as const, error: "off" };
    if (data.confirm !== "SEND") return { ok: false as const, error: "confirm" };
    const sql = await getSql();
    const province = await provinceFor(gov);
    const rows = await sql<{ id: string; title: string | null; body: string; status: string; target_centre_ids: unknown }>`
      select id, title, body, status, target_centre_ids from gov_broadcasts where id = ${data.id} and upper(province) = ${province} limit 1
    `.catch(() => []);
    const draft = rows[0];
    if (!draft || draft.status !== "draft") return { ok: false as const, error: "missing" };
    const picked = Array.isArray(draft.target_centre_ids) ? (draft.target_centre_ids as string[]) : [];
    if (!picked.length) return { ok: false as const, error: "centres" };
    const centres = await sql<{ id: string; name: string; province: string; contact_email: string | null; slug: string | null; visibility: string | null; is_test: number | null }>`
      select id, name, province, contact_email, slug, visibility, is_test from daycares where id = any(${picked}::text[])
    `.catch(() => []);
    const production = (process.env.VERCEL_ENV || "").trim() === "production";
    const { allowed, blocked } = broadcastTargets({
      centres: centres.map((c) => ({ ...c, qa: !realCentre(c) })),
      picked,
      province,
      production,
    });
    if (blocked.length) return { ok: false as const, error: "blocked", blocked: blocked.length };
    const { sendComplianceEmail } = await import("@/lib/server/compliance-common");
    let sent = 0;
    let logged = 0;
    let skipped = 0;
    for (const centre of allowed) {
      let status: "sent" | "logged" | "skipped" = "skipped";
      if (centre.contact_email) {
        if (mode === "live") {
          const result = await sendComplianceEmail({
            essential: true,
            to: centre.contact_email,
            subject: `KidEase: ${(draft.title || "A notice from the province").slice(0, 100)}`,
            text: draft.body,
            heading: draft.title || "A notice from the province",
            cta: { label: "Open your daycare desk", href: "https://www.kidease.ca/provider" },
            reason: "You get this because the province picked your centre for this notice.",
          });
          status = result === "sent" ? "sent" : "logged";
        } else status = "logged";
      }
      if (status === "sent") sent += 1;
      else if (status === "logged") logged += 1;
      else skipped += 1;
      await sql`
        insert into gov_broadcast_deliveries (id, broadcast_id, channel, status, target_kind)
        values (${nid("dlv")}, ${draft.id}, 'email', ${status}, 'daycare')
      `.catch(() => undefined);
    }
    await sql`update gov_broadcasts set status = 'sent', sent_at = now(), sent_by = ${gov.userId}, updated_at = now() where id = ${draft.id}`;
    await auditDesk(sql, gov, province, "broadcast_sent");
    return { ok: true as const, mode, sent, logged, skipped };
  });

export const govNotificationsRead = createServerFn({ method: "POST" })
  .middleware([govAuthMiddleware])
  .validator((input: { id?: string; all?: boolean }) => ({ id: String(input?.id || "").slice(0, 80), all: Boolean(input?.all) }))
  .handler(async ({ context, data }) => {
    const gov = context.gov as GovActor;
    const sql = await getSql();
    if (data.all) {
      await sql`update role_inbox set read_at = now(), read_by = ${gov.userId} where user_id = ${gov.userId} and read_at is null`;
      return { ok: true as const };
    }
    const done = await sql<{ id: string }>`
      update role_inbox set read_at = now(), read_by = ${gov.userId} where id = ${data.id} and user_id = ${gov.userId} and read_at is null returning id
    `;
    if (!done.length) return { ok: false as const, error: "missing" };
    return { ok: true as const };
  });
