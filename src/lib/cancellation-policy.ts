/**
 * Draft cancellation framework for counsel review. Nothing here is in force.
 * It does not change a contract, collect a fee, or confirm a spot.
 */

export const POLICY_DRAFT_STATUS = "counsel-review" as const;

export const PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
export type ProvinceCode = (typeof PROVINCES)[number];

export type CareSetting = "licensed-centre" | "licensed-home" | "funded-program" | "school-board" | "other";

export type PolicyTopic =
  | "tour"
  | "pre-start"
  | "ongoing"
  | "provider-cancel"
  | "planned-closure"
  | "emergency-closure"
  | "deposit"
  | "waitlist-fee";

export type PolicyDraft = {
  status: typeof POLICY_DRAFT_STATUS;
  inForce: false;
  topic: PolicyTopic;
  province: ProvinceCode | "CA";
  setting: CareSetting;
  summary: string;
  counselOpen: string[];
};

const QC_PARENT =
  "Quebec draft: a parent may cancel in writing with no required notice. Before care starts, no penalty. After care starts, only care already given plus the lesser of $50 or 10% of care not yet given, refund in 10 days. Counsel must confirm which agreements this covers.";

const QC_PROVIDER =
  "Quebec provider ending care is not settled here. One official model uses two weeks, or immediate for a health or safety threat. The consumer law also describes a 60-day notice for some open-ended contracts. Do not treat two weeks as the rule for every provider.";

export function draftCancellation(input: {
  topic: PolicyTopic;
  province?: ProvinceCode | null;
  setting?: CareSetting;
  fundedProgram?: boolean;
}): PolicyDraft {
  const province = input.province || "CA";
  const setting = input.setting || "other";
  const funded = input.fundedProgram === true;
  const counselOpen: string[] = [];
  let summary = "Canada-wide draft only. No fee is set, and this text is not in force.";

  if (input.topic === "tour") {
    summary = "Draft: a tour is not a confirmed place. No tour deposit is proposed.";
  }
  if (input.topic === "pre-start" && province === "QC") summary = QC_PARENT;
  if (input.topic === "ongoing" && province === "QC") summary = QC_PARENT;
  if (input.topic === "provider-cancel" && province === "QC") {
    summary = QC_PROVIDER;
    counselOpen.push("Which Quebec provider-notice rule applies to this agreement.");
  }
  if (input.topic === "waitlist-fee" && province === "ON" && setting.startsWith("licensed")) {
    summary = "Ontario draft for licensees: no fee or deposit to join a wait list. An enrolment deposit is a different question and is not decided here.";
  }
  if (input.topic === "planned-closure" && province === "ON" && funded) {
    summary = "Ontario draft: paid-closure limits apply to programs in the Canada-wide funding plan, not to every Ontario centre. Counsel must confirm this program and the dates.";
    counselOpen.push("Is this centre in the funded plan for the dates in question?");
  }
  if (input.topic === "deposit" && province === "BC") {
    summary = "British Columbia draft: if a licensed program takes a prepayment, the refund terms must be in writing at that time. The refund amount is not set by that rule.";
  }
  if (input.topic === "waitlist-fee" && province === "NS" && funded) {
    summary = "Nova Scotia draft: wait-list and registration fees are barred for licensed programs in the funded agreements that were reviewed. That is not a finding for every Nova Scotia arrangement.";
  }
  if (input.topic === "deposit" && province === "NL" && setting === "licensed-home" && funded) {
    summary = "Newfoundland and Labrador draft: deposit and registration caps were located for family child care in the operating-grant manual, not for every program.";
  }
  if (province !== "QC" && province !== "ON" && province !== "BC" && province !== "NS" && province !== "NL") {
    counselOpen.push("Reviewed sources did not locate a complete rule. That does not mean no law exists.");
  }
  return { status: POLICY_DRAFT_STATUS, inForce: false, topic: input.topic, province, setting, summary, counselOpen };
}

export function acceptanceSnapshot(input: { versionId: string; text: string; at: string }): {
  versionId: string;
  text: string;
  at: string;
  confirmsPlacement: false;
} {
  return { versionId: input.versionId, text: input.text, at: input.at, confirmsPlacement: false };
}
