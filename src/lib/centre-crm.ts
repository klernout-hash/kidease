/**
 * Daycare CRM on top of the centre lead tracker.
 * No GoHighLevel calls. Mail and text stay held unless the send gate says yes.
 * scripts/centre-crm.test.mjs loads this file in Node.
 */
import { CENTRE_LEAD_STAGES, type CentreLeadStage, type LeadSource } from "./centre-leads.ts";
import type { CentreMemberRole } from "./centre-roles.ts";
import { qaSendDecision, type QaSendChannel } from "./qa-send.ts";

export type PipelineStage = {
  key: string;
  labelEn: string;
  labelFr: string;
  sort: number;
  system: boolean;
};

export const DEFAULT_PIPELINE: PipelineStage[] = [
  { key: "inquiry", labelEn: "New inquiry", labelFr: "Nouvelle demande", sort: 0, system: true },
  { key: "contacted", labelEn: "Contacted", labelFr: "Contacté", sort: 1, system: true },
  { key: "tour_booked", labelEn: "Tour booked", labelFr: "Visite réservée", sort: 2, system: true },
  { key: "toured", labelEn: "Toured", labelFr: "Visite faite", sort: 3, system: true },
  { key: "applied", labelEn: "Application", labelFr: "Demande", sort: 4, system: true },
  { key: "offered", labelEn: "Offered", labelFr: "Place offerte", sort: 5, system: true },
  { key: "enrolled", labelEn: "Enrolled", labelFr: "Inscrit", sort: 6, system: true },
  { key: "waitlisted", labelEn: "Waitlisted", labelFr: "Liste d’attente", sort: 7, system: true },
  { key: "lost", labelEn: "Lost", labelFr: "Perdu", sort: 8, system: true },
];

export type CrmViewer = {
  role?: string | null;
  centreRole?: CentreMemberRole | null;
  sameCentre: boolean;
};

export function crmCanView(viewer: CrmViewer): boolean {
  if (!viewer.sameCentre) return false;
  const role = String(viewer.role || "").toLowerCase();
  if (role === "parent" || role === "government" || role === "guest") return false;
  if (role === "admin" && viewer.centreRole == null) return false;
  return viewer.centreRole === "owner" || viewer.centreRole === "manager" || viewer.centreRole === "staff" || viewer.centreRole === "read_only";
}

export function crmCanEdit(viewer: CrmViewer): boolean {
  if (!crmCanView(viewer)) return false;
  return viewer.centreRole === "owner" || viewer.centreRole === "manager" || viewer.centreRole === "staff";
}

export function leadDedupeKey(input: { daycareId: string; parentUserId?: string | null; email?: string | null }): string {
  const centre = input.daycareId.trim();
  const parent = String(input.parentUserId || "").trim();
  if (parent) return `${centre}:parent:${parent}`;
  const email = String(input.email || "").trim().toLowerCase();
  return `${centre}:email:${email}`;
}

export function renameStage(stages: PipelineStage[], key: string, labelEn: string, labelFr: string): PipelineStage[] {
  const en = labelEn.trim().slice(0, 40);
  const fr = labelFr.trim().slice(0, 40);
  if (!en || !fr) return stages;
  return stages.map((stage) => (stage.key === key ? { ...stage, labelEn: en, labelFr: fr } : stage));
}

export function reorderStages(stages: PipelineStage[], keys: string[]): PipelineStage[] {
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));
  if (keys.length !== stages.length || keys.some((key) => !byKey.has(key))) return stages;
  return keys.map((key, sort) => ({ ...byKey.get(key)!, sort }));
}

export function addStage(stages: PipelineStage[], labelEn: string, labelFr: string): PipelineStage[] {
  const en = labelEn.trim().slice(0, 40);
  const fr = (labelFr.trim() || en).slice(0, 40);
  if (!en) return stages;
  const key = `custom_${stages.length}_${en.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "stage"}`;
  const lost = stages.find((stage) => stage.key === "lost");
  const rest = stages.filter((stage) => stage.key !== "lost");
  const next = [...rest, { key, labelEn: en, labelFr: fr, sort: rest.length, system: false }];
  if (lost) next.push({ ...lost, sort: next.length });
  return next.map((stage, sort) => ({ ...stage, sort }));
}

export type CrmLead = {
  id: string;
  stage: string;
  source: LeadSource | string;
  startedAt: string;
  lastActivityAt: string;
  enrolledAt?: string | null;
};

export function conversionByStage(leads: readonly CrmLead[], stages: readonly PipelineStage[]): Array<{ key: string; count: number; fromPrevious: number | null }> {
  const counts = new Map(stages.map((stage) => [stage.key, leads.filter((lead) => lead.stage === stage.key).length]));
  let previous = 0;
  return stages.map((stage, index) => {
    const count = counts.get(stage.key) || 0;
    const fromPrevious = index === 0 || previous === 0 ? null : Math.round((count / previous) * 1000) / 1000;
    previous = count || previous;
    return { key: stage.key, count, fromPrevious };
  });
}

export function timeInStageDays(enteredAt: string, leftAt: string): number | null {
  const start = Date.parse(enteredAt);
  const end = Date.parse(leftAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round(((end - start) / 86_400_000) * 10) / 10;
}

export function sourceBreakdown(leads: readonly CrmLead[]): Array<{ source: string; count: number }> {
  const map = new Map<string, number>();
  for (const lead of leads) map.set(String(lead.source), (map.get(String(lead.source)) || 0) + 1);
  return [...map.entries()].map(([source, count]) => ({ source, count }));
}

export function monthlyCohort(leads: readonly CrmLead[]): Array<{ month: string; leads: number; enrolled: number; rate: number | null }> {
  const map = new Map<string, { leads: number; enrolled: number }>();
  for (const lead of leads) {
    const month = lead.startedAt.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const row = map.get(month) || { leads: 0, enrolled: 0 };
    row.leads += 1;
    if (lead.stage === "enrolled") row.enrolled += 1;
    map.set(month, row);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, row]) => ({
      month,
      leads: row.leads,
      enrolled: row.enrolled,
      rate: row.leads === 0 ? null : Math.round((row.enrolled / row.leads) * 1000) / 1000,
    }));
}

export type WorkflowKind = "stage_task" | "idle_notice" | "tour_suggest" | "offer_enrol" | "family_message";

export type WorkflowRule = {
  kind: WorkflowKind;
  stageKey?: string;
  idleDays?: number;
  enabled: boolean;
};

export type WorkflowEvent = {
  type: "entered_stage" | "idle" | "tour_checked_in" | "offer_accepted";
  stage?: string;
  idleDays?: number;
  casl?: boolean;
  email?: string | null;
};

export type WorkflowResult =
  | { action: "task"; title: string }
  | { action: "in_app_notice"; title: string }
  | { action: "suggest_stage"; stage: "toured" }
  | { action: "move_stage"; stage: "enrolled"; linkEnrolment: true }
  | { action: "hold_message"; reason: "off" | "no_consent" | "not_allowlisted" | "no_customer_sends" };

export function planWorkflow(rules: readonly WorkflowRule[], event: WorkflowEvent, allowlist: readonly string[] = []): WorkflowResult | null {
  if (event.type === "tour_checked_in") {
    const rule = rules.find((item) => item.kind === "tour_suggest" && item.enabled);
    return rule ? { action: "suggest_stage", stage: "toured" } : null;
  }
  if (event.type === "offer_accepted") {
    const rule = rules.find((item) => item.kind === "offer_enrol" && item.enabled);
    return rule ? { action: "move_stage", stage: "enrolled", linkEnrolment: true } : null;
  }
  if (event.type === "idle") {
    const rule = rules.find((item) => item.kind === "idle_notice" && item.enabled);
    const limit = rule?.idleDays ?? 0;
    if (!rule || !event.idleDays || event.idleDays <= limit) return null;
    return { action: "in_app_notice", title: "A family has been quiet" };
  }
  if (event.type === "entered_stage") {
    const task = rules.find((item) => item.kind === "stage_task" && item.enabled && item.stageKey === event.stage);
    if (task) return { action: "task", title: "Follow up with this family" };
    const message = rules.find((item) => item.kind === "family_message" && item.enabled && item.stageKey === event.stage);
    if (!message) return null;
    if (!event.casl) return { action: "hold_message", reason: "no_consent" };
    const email = String(event.email || "").trim().toLowerCase();
    if (!email || !allowlist.map((item) => item.toLowerCase()).includes(email)) {
      return { action: "hold_message", reason: "not_allowlisted" };
    }
    return { action: "hold_message", reason: "no_customer_sends" };
  }
  return null;
}

export function systemStageKeys(): readonly string[] {
  return CENTRE_LEAD_STAGES;
}

export const CENTRE_WORKFLOW_IDS = [
  "inquiry",
  "tour",
  "application",
  "offer",
  "waitlist",
  "lost",
  "enrolled",
] as const;

export type CentreWorkflowId = (typeof CENTRE_WORKFLOW_IDS)[number];

export type CentreWorkflowSettings = {
  id: CentreWorkflowId;
  enabled: boolean;
  /** Offer only. How many days until the offer ends. */
  offerDays?: number;
  /** Offer only. Where an expired offer goes. */
  expiryGoesTo?: "lost" | "waitlisted";
  /** Lost only. The 90-day check is off until the centre turns it on. */
  reengage?: boolean;
};

export function defaultCentreWorkflows(): CentreWorkflowSettings[] {
  return CENTRE_WORKFLOW_IDS.map((id) => ({
    id,
    enabled: true,
    offerDays: id === "offer" ? 7 : undefined,
    expiryGoesTo: id === "offer" ? "lost" : undefined,
    reengage: id === "lost" ? false : undefined,
  }));
}

export function setWorkflowEnabled(
  settings: readonly CentreWorkflowSettings[],
  id: CentreWorkflowId,
  enabled: boolean,
): CentreWorkflowSettings[] {
  return settings.map((item) => (item.id === id ? { ...item, enabled } : item));
}

export function configureOfferWorkflow(
  settings: readonly CentreWorkflowSettings[],
  patch: { offerDays?: number; expiryGoesTo?: "lost" | "waitlisted" },
): CentreWorkflowSettings[] {
  const days = patch.offerDays == null ? undefined : Math.min(90, Math.max(1, Math.round(patch.offerDays)));
  return settings.map((item) => {
    if (item.id !== "offer") return item;
    return {
      ...item,
      offerDays: days ?? item.offerDays ?? 7,
      expiryGoesTo: patch.expiryGoesTo ?? item.expiryGoesTo ?? "lost",
    };
  });
}

export function configureLostWorkflow(settings: readonly CentreWorkflowSettings[], reengage: boolean): CentreWorkflowSettings[] {
  return settings.map((item) => (item.id === "lost" ? { ...item, reengage } : item));
}

function workflowOn(settings: readonly CentreWorkflowSettings[], id: CentreWorkflowId): CentreWorkflowSettings | null {
  const row = settings.find((item) => item.id === id);
  return row?.enabled ? row : null;
}

function plusHours(at: string, hours: number): string {
  const start = Date.parse(at);
  if (!Number.isFinite(start)) return at;
  return new Date(start + hours * 3_600_000).toISOString();
}

export type PlannedTask = {
  kind: "task";
  key: string;
  titleEn: string;
  titleFr: string;
  dueAt: string;
};

export type PlannedWork =
  | { kind: "assign"; userId: string }
  | PlannedTask
  | { kind: "move"; stage: "contacted" | "lost" | "waitlisted" | "enrolled"; lostReason?: string }
  | { kind: "checklist"; key: string; items: PlannedTask[] }
  | { kind: "suggest"; leadIds: string[] }
  | { kind: "block"; reason: "lost_reason" }
  | { kind: "hold_message"; template: string; reason: string }
  | { kind: "template_message"; template: string };

export type WaitlistPerson = {
  id: string;
  joinedAt: string;
  ageGroup?: string | null;
  roomWanted?: string | null;
  schedule?: string | null;
  siblings?: number;
};

export type WorkflowMoment =
  | { type: "stage"; stage: string; at: string; tourAt?: string | null; ownerUserId?: string | null; lostReason?: string | null }
  | { type: "idle"; stage: string; idleHours: number; at: string }
  | { type: "tour_no_show"; at: string }
  | { type: "offer_expired"; at: string }
  | { type: "offer_accepted"; at: string }
  | { type: "spot_opened"; at: string; people: readonly WaitlistPerson[]; ageGroup?: string | null; room?: string | null; schedule?: string | null };

function task(key: string, titleEn: string, titleFr: string, dueAt: string): PlannedTask {
  return { kind: "task", key, titleEn, titleFr, dueAt };
}

export function planCentreWorkflows(
  settings: readonly CentreWorkflowSettings[],
  moment: WorkflowMoment,
): PlannedWork[] {
  if (moment.type === "idle") {
    const inquiry = workflowOn(settings, "inquiry");
    if (!inquiry || moment.stage !== "inquiry" || moment.idleHours < 48) return [];
    return [task("inquiry_idle", "This inquiry has had no reply for 48 hours", "Cette demande n’a pas eu de réponse depuis 48 heures", moment.at)];
  }
  if (moment.type === "tour_no_show") {
    if (!workflowOn(settings, "tour")) return [];
    return [
      { kind: "move", stage: "contacted" },
      task("tour_no_show", "Call the family about the missed tour", "Appeler la famille pour la visite manquée", moment.at),
    ];
  }
  if (moment.type === "offer_expired") {
    const offer = workflowOn(settings, "offer");
    if (!offer) return [];
    const stage = offer.expiryGoesTo === "waitlisted" ? "waitlisted" : "lost";
    return [{ kind: "move", stage, lostReason: stage === "lost" ? "offer_expired" : undefined }];
  }
  if (moment.type === "offer_accepted") {
    if (!workflowOn(settings, "offer")) return [];
    const at = moment.at;
    return [
      { kind: "move", stage: "enrolled" },
      {
        kind: "checklist",
        key: "enrol_start",
        items: [
          task("enrol_forms", "Collect the enrolment forms", "Recueillir les formulaires d’inscription", at),
          task("enrol_allergies", "Record allergies", "Noter les allergies", at),
          task("enrol_pickup", "Confirm the pickup list", "Confirmer la liste de récupération", at),
          task("enrol_start", "Confirm the start date", "Confirmer la date de début", at),
        ],
      },
    ];
  }
  if (moment.type === "spot_opened") {
    if (!workflowOn(settings, "waitlist")) return [];
    return [{ kind: "suggest", leadIds: suggestForOpenSpot(moment.people, moment).map((person) => person.id) }];
  }
  if (moment.type !== "stage") return [];
  const at = moment.at;
  if (moment.stage === "inquiry") {
    const inquiry = workflowOn(settings, "inquiry");
    if (!inquiry) return [];
    const works: PlannedWork[] = [];
    if (moment.ownerUserId) works.push({ kind: "assign", userId: moment.ownerUserId });
    works.push(task("inquiry_reply", "Reply within 24 hours", "Répondre dans les 24 heures", plusHours(at, 24)));
    works.push(task("inquiry_idle", "This inquiry has had no reply for 48 hours", "Cette demande n’a pas eu de réponse depuis 48 heures", plusHours(at, 48)));
    return works;
  }
  if (moment.stage === "tour_booked") {
    if (!workflowOn(settings, "tour")) return [];
    if (!moment.tourAt) {
      return [task("tour_reminder", "Pick the tour time and remind the family the day before", "Choisir l’heure de la visite et rappeler la famille la veille", at)];
    }
    return [task("tour_reminder", "Remind the family about tomorrow's tour", "Rappeler la visite de demain à la famille", plusHours(moment.tourAt, -24))];
  }
  if (moment.stage === "toured") {
    if (!workflowOn(settings, "tour")) return [];
    return [task("tour_follow", "Follow up after the tour", "Faire le suivi après la visite", plusHours(at, 24))];
  }
  if (moment.stage === "applied") {
    if (!workflowOn(settings, "application")) return [];
    return [
      task("application_docs", "Ask for the missing documents", "Demander les documents manquants", at),
      task("application_review", "Review this application", "Examiner cette demande", plusHours(at, 72)),
    ];
  }
  if (moment.stage === "offered") {
    const offer = workflowOn(settings, "offer");
    if (!offer) return [];
    const days = offer.offerDays ?? 7;
    const expiry = plusHours(at, days * 24);
    return [
      task("offer_expires", "The offer expiry date is set", "La date d’expiration de l’offre est fixée", expiry),
      task("offer_reminder", "Remind the family before the offer expires", "Rappeler à la famille avant la fin de l’offre", plusHours(expiry, -24)),
    ];
  }
  if (moment.stage === "waitlisted") {
    if (!workflowOn(settings, "waitlist")) return [];
    return [task("waitlist_check", "Ask if this family is still interested", "Demander si cette famille est encore intéressée", plusHours(at, 14 * 24))];
  }
  if (moment.stage === "lost") {
    const lost = workflowOn(settings, "lost");
    if (!lost) return [];
    if (!String(moment.lostReason || "").trim()) return [{ kind: "block", reason: "lost_reason" }];
    return lost.reengage
      ? [task("lost_reengage", "Check if this family is ready to try again", "Vérifier si cette famille veut réessayer", plusHours(at, 90 * 24))]
      : [];
  }
  if (moment.stage === "enrolled") {
    if (!workflowOn(settings, "enrolled")) return [];
    return [
      task("enrolled_week", "Check in during the first week", "Prendre des nouvelles pendant la première semaine", plusHours(at, 7 * 24)),
      task("enrolled_month", "Ask how the first month went", "Demander comment s’est passé le premier mois", plusHours(at, 30 * 24)),
      task("enrol_forms", "Collect the enrolment forms", "Recueillir les formulaires d’inscription", at),
      task("enrol_allergies", "Record allergies", "Noter les allergies", at),
      task("enrol_pickup", "Confirm the pickup list", "Confirmer la liste de récupération", at),
      task("enrol_start", "Confirm the start date", "Confirmer la date de début", at),
      planWorkflowFamilyMail({
        template: "review_request",
        channel: "email",
        feature: "CRM-FAMILY",
        recipient: "",
        sender: "hello@kidease.ca",
        allowlist: [],
        occurredAt: at,
        enabledAt: at,
      }),
    ];
  }
  return [];
}

export function waitlistPosition(people: readonly WaitlistPerson[], id: string): number | null {
  const ordered = [...people].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id));
  const index = ordered.findIndex((person) => person.id === id);
  return index < 0 ? null : index + 1;
}

export function suggestForOpenSpot(
  people: readonly WaitlistPerson[],
  spot: { ageGroup?: string | null; room?: string | null; schedule?: string | null },
): WaitlistPerson[] {
  const age = String(spot.ageGroup || "").trim().toLowerCase();
  const room = String(spot.room || "").trim().toLowerCase();
  const schedule = String(spot.schedule || "").trim().toLowerCase();
  return [...people]
    .filter((person) => {
      if (age && age !== "any" && String(person.ageGroup || "").trim().toLowerCase() !== age) return false;
      if (room && String(person.roomWanted || "").trim().toLowerCase() !== room) return false;
      if (schedule && String(person.schedule || "").trim().toLowerCase() !== schedule) return false;
      return true;
    })
    .sort((a, b) => {
      const sibling = Number(b.siblings || 0) - Number(a.siblings || 0);
      if (sibling !== 0) return sibling;
      return a.joinedAt.localeCompare(b.joinedAt);
    });
}

/** Family mail from a workflow. It uses the existing send gate and never sends on its own. */
export function planWorkflowFamilyMail(input: {
  template: "still_interested" | "review_request" | "offer_reminder";
  channel: QaSendChannel;
  feature: string;
  recipient: string;
  sender: string;
  allowlist: readonly string[];
  occurredAt: string | null;
  enabledAt: string | null;
}): { kind: "hold_message"; template: string; reason: string } | { kind: "template_message"; template: string } {
  const decision = qaSendDecision({
    feature: input.feature,
    channel: input.channel,
    recipient: input.recipient,
    sender: input.sender,
    occurredAt: input.occurredAt,
    enabledAt: input.enabledAt,
    alreadySent: false,
    allowlist: input.allowlist,
  });
  if (!decision.deliver) return { kind: "hold_message", template: input.template, reason: decision.reason };
  return { kind: "template_message", template: input.template };
}
