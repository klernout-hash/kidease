/**
 * Light centre CRM: derive inquiry → tour → enrol stages from existing rows.
 * Does not invent bookings or convert a tour into enrolment automatically.
 * Sibling parent-rails work may add parent CTAs; this is the centre board.
 */

import { compareTimeDesc } from "@/lib/sort-time";

export const PIPELINE_STAGES = ["inquiry", "tour_pending", "tour_accepted", "enrol_open", "enrolled"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type PipelineKind = "conversation" | "tour" | "booking";

export type PipelineInput = {
  id: string;
  kind: PipelineKind;
  daycareId: string;
  daycareName: string;
  daycareSlug?: string;
  conversationId?: string | null;
  parentUserId?: string | null;
  parentName?: string | null;
  childName?: string | null;
  tourStatus?: "pending" | "accepted" | "declined" | null;
  bookingStatus?: string | null;
  updatedAt: string;
};

export type PipelineCard = PipelineInput & {
  stage: PipelineStage;
  href: string;
};

const STAGE_RANK: Record<PipelineStage, number> = {
  inquiry: 0,
  tour_pending: 1,
  tour_accepted: 2,
  enrol_open: 3,
  enrolled: 4,
};

const OPEN_ENROL = new Set(["requested", "under_review", "waitlist"]);
const ENROLLED = new Set(["accepted", "active"]);

export function pipelineStageFor(row: PipelineInput): PipelineStage | null {
  if (row.kind === "booking") {
    const status = (row.bookingStatus || "").trim().toLowerCase();
    if (ENROLLED.has(status)) return "enrolled";
    if (OPEN_ENROL.has(status)) return "enrol_open";
    return null;
  }
  if (row.kind === "tour") {
    if (row.tourStatus === "pending") return "tour_pending";
    if (row.tourStatus === "accepted") return "tour_accepted";
    return null;
  }
  if (row.kind === "conversation") return "inquiry";
  return null;
}

export function pipelineHref(row: PipelineInput): string {
  if (row.conversationId) return `/inbox/${row.conversationId}`;
  if (row.kind === "conversation") return `/inbox/${row.id}`;
  return "/inbox";
}

export function pipelineGroupKey(row: PipelineInput) {
  const parent = row.parentUserId || row.parentName || "unknown";
  return `${row.daycareId}:${parent}`;
}

/** Highest stage wins per parent+centre. Declined tours and declined bookings drop out. */
export function assignPipeline(rows: PipelineInput[]): PipelineCard[] {
  const best = new Map<string, PipelineCard>();
  for (const row of rows) {
    const stage = pipelineStageFor(row);
    if (!stage) continue;
    const card: PipelineCard = { ...row, stage, href: pipelineHref(row) };
    const key = pipelineGroupKey(row);
    const cur = best.get(key);
    if (!cur || STAGE_RANK[stage] > STAGE_RANK[cur.stage]) {
      best.set(key, card);
    }
  }
  return [...best.values()].sort((a, b) => {
    const delta = STAGE_RANK[b.stage] - STAGE_RANK[a.stage];
    if (delta !== 0) return delta;
    return compareTimeDesc(a.updatedAt, b.updatedAt);
  });
}

export function pipelineByStage(cards: PipelineCard[]): Record<PipelineStage, PipelineCard[]> {
  const out = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, [] as PipelineCard[]])) as Record<
    PipelineStage,
    PipelineCard[]
  >;
  for (const card of cards) out[card.stage].push(card);
  return out;
}
