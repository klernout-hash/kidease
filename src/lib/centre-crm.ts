/**
 * Daycare CRM on top of the centre lead tracker.
 * No GoHighLevel calls. Mail and text stay held unless the send gate says yes.
 * scripts/centre-crm.test.mjs loads this file in Node.
 */
import { CENTRE_LEAD_STAGES, type CentreLeadStage, type LeadSource } from "./centre-leads.ts";
import type { CentreMemberRole } from "./centre-roles.ts";

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
