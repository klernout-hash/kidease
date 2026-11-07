import { draftCancellation, type CareSetting, type PolicyTopic, type ProvinceCode } from "./cancellation-policy.ts";

export const COUNSEL_REVIEW = "counsel-review" as const;
export type DisputeStatus = "open" | "human-review" | "closed";

export type StoredDraftPolicy = {
  id: string;
  daycareId: string;
  province: ProvinceCode | "CA";
  program: string;
  topic: PolicyTopic;
  setting: CareSetting;
  body: string;
  status: typeof COUNSEL_REVIEW;
  inForce: false;
  version: number;
};

export type AcceptanceSnapshot = {
  policyId: string;
  policyVersion: number;
  bodySnapshot: string;
  userId: string;
  placeStatus: "draft";
  immutable: true;
  /** Draft acknowledgement only. Never a confirmed place or binding consent. */
  confirmsPlacement: false;
  bindingConsent: false;
};

export function draftAcknowledgementNotice(locale: "en" | "fr"): string {
  if (locale === "fr") {
    return "Examen du conseiller. Ceci est un accusé provisoire seulement. Ce n’est pas une place confirmée et ce n’est pas un consentement qui vous lie.";
  }
  return "Counsel review. This is a draft acknowledgement only. It is not a confirmed place and it is not binding consent.";
}

/** True only if a screen would be showing this text as a live enrolment rule. */
export function draftShownAsActive(policy: { status: string; inForce: boolean }): boolean {
  return policy.status !== COUNSEL_REVIEW || policy.inForce !== false;
}

const TOPICS = new Set<PolicyTopic>([
  "tour",
  "pre-start",
  "ongoing",
  "provider-cancel",
  "planned-closure",
  "emergency-closure",
  "deposit",
  "waitlist-fee",
]);

export function supportReferenceFromConversation(id: string | null | undefined): string | null {
  const match = /^cv_([a-z0-9]{8,16})$/i.exec(String(id || "").trim());
  if (!match) return null;
  const groups = match[1].toUpperCase().match(/.{1,4}/g);
  return groups ? `KE-${groups.join("-")}` : null;
}

export function canSaveDraftPolicy(input: { ownsCentre: boolean }): boolean {
  return input.ownsCentre === true;
}

export function buildDraftPolicy(input: {
  id: string;
  daycareId: string;
  topic: string;
  province?: string | null;
  setting?: string | null;
  program?: string | null;
  fundedProgram?: boolean;
  version: number;
}): StoredDraftPolicy | { error: string } {
  if (!TOPICS.has(input.topic as PolicyTopic)) return { error: "Unknown topic" };
  const draft = draftCancellation({
    topic: input.topic as PolicyTopic,
    province: (input.province || "CA") as ProvinceCode,
    setting: (input.setting || "other") as CareSetting,
    fundedProgram: input.fundedProgram === true,
  });
  if (draft.status !== COUNSEL_REVIEW || draft.inForce !== false) {
    return { error: "This text stays in counsel review. It is not an active policy." };
  }
  const program = String(input.program || (input.fundedProgram ? "funded" : "unspecified")).trim().slice(0, 80);
  return {
    id: input.id,
    daycareId: input.daycareId,
    province: draft.province,
    program,
    topic: draft.topic,
    setting: draft.setting,
    body: draft.summary,
    status: draft.status,
    inForce: false,
    version: Math.max(1, Math.floor(input.version)),
  };
}

export function acceptanceSnapshot(policy: StoredDraftPolicy, userId: string): AcceptanceSnapshot {
  return {
    policyId: policy.id,
    policyVersion: policy.version,
    bodySnapshot: policy.body,
    userId,
    placeStatus: "draft",
    immutable: true,
    confirmsPlacement: false,
    bindingConsent: false,
  };
}

export function canReadDispute(input: { actorId: string; ownerId: string; staff: boolean }): boolean {
  if (input.staff) return true;
  return input.actorId !== "" && input.actorId === input.ownerId;
}

export function nextDisputeStatus(input: {
  staff: boolean;
  from: DisputeStatus;
  to: DisputeStatus;
}): DisputeStatus | { error: string } {
  if (!input.staff) return { error: "Only a person on the support desk can review a dispute." };
  if (input.from === "open" && (input.to === "human-review" || input.to === "closed")) return input.to;
  if (input.from === "human-review" && input.to === "closed") return input.to;
  return { error: "That status change is not allowed." };
}

export function openDispute(input: {
  conversationId: string;
  userId: string;
  evidenceNote: string;
}): { supportReference: string; userId: string; status: "open"; evidenceNote: string } | { error: string } {
  const supportReference = supportReferenceFromConversation(input.conversationId);
  if (!supportReference) return { error: "Use an existing message number." };
  const evidenceNote = String(input.evidenceNote || "").trim().slice(0, 500);
  if (!evidenceNote) return { error: "Add a short note about the evidence." };
  return { supportReference, userId: input.userId, status: "open", evidenceNote };
}
