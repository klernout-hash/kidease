/**
 * Phase 6. Flags default off. Nothing here sends or charges.
 * Stripe stays in test mode and is not charged.
 */

export const CRA_CHILD_CARE_URL =
  "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-21400-child-care-expenses.html";

export const CUSTODY_GUIDANCE = {
  en: "Follow the most recent order. In an emergency, call the police.",
  fr: "Suivez l'ordonnance la plus récente. En urgence, appelez la police.",
} as const;

export type CustodyOrder = { id: string; effectiveOn: string; uploaded: boolean };
export type PickupPerson = { id: string; name: string; authorized: boolean };

export function bothParentsKeepAccess(): true {
  return true;
}

export function hideFromParent(): false {
  return false;
}

export function canRemoveParent(input: { uploadedOrder: boolean; jointInstruction: boolean }): boolean {
  return input.uploadedOrder || input.jointInstruction;
}

export function latestOrder(orders: readonly CustodyOrder[]): CustodyOrder | null {
  const uploaded = orders.filter((order) => order.uploaded && order.effectiveOn);
  if (!uploaded.length) return null;
  return [...uploaded].sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn))[0] ?? null;
}

export function custodyVisible(input: { role: string | null | undefined; centreStaff: boolean }): boolean {
  if (!input.centreStaff) return false;
  return input.role === "owner" || input.role === "manager" || input.role === "staff";
}

export function checkoutSafetyAlert(safetyFlag: boolean): boolean {
  return safetyFlag;
}

export function custodyChange(input: { actorId: string; action: string; at: string }): { actorId: string; action: string; at: string } | null {
  if (!input.actorId || !input.action) return null;
  return { actorId: input.actorId, action: input.action, at: input.at };
}

export const PACK_KINDS = ["attendance", "enrolment", "staff_qualification", "serious_occurrence"] as const;
export type PackKind = (typeof PACK_KINDS)[number];

export const PROVINCE_PACK_NOTES: Record<string, { en: string; fr: string }> = {
  ON: { en: "Ontario: draft for CCLS. The licensee submits it.", fr: "Ontario : brouillon pour le SGEE. Le titulaire le dépose." },
  MB: { en: "Manitoba: four-week attendance draft for Child Care Online.", fr: "Manitoba : brouillon de présence de quatre semaines pour Garderie en ligne." },
  BC: { en: "British Columbia: monthly draft for the $10 a Day report.", fr: "Colombie-Britannique : brouillon mensuel pour le rapport à 10 $ par jour." },
  AB: { en: "Alberta: draft only. The licensee submits it.", fr: "Alberta : brouillon seulement. Le titulaire le dépose." },
  QC: { en: "Quebec: draft only. The licensee submits it.", fr: "Québec : brouillon seulement. Le titulaire le dépose." },
};

export function packIssues(input: { kind: PackKind; rows: number; province: string }): string[] {
  const issues: string[] = [];
  if (!PROVINCE_PACK_NOTES[input.province]) issues.push("province");
  if (input.rows < 1) issues.push("empty");
  if (input.kind === "serious_occurrence" && input.rows < 1) issues.push("occurrence");
  return issues;
}

export function autoFilePack(): false {
  return false;
}

export function storePortalPassword(): false {
  return false;
}

export type RoomLoad = { present: number; dropIns: number; capacity: number; groupMax: number; staff: number; childrenPerStaff: number };

export function headcount(room: Pick<RoomLoad, "present" | "dropIns">): number {
  return Math.max(0, room.present) + Math.max(0, room.dropIns);
}

export function capacityBlock(room: RoomLoad): "ok" | "capacity" | "group" | "ratio" {
  const count = headcount(room);
  if (room.capacity >= 0 && count > room.capacity) return "capacity";
  if (room.groupMax >= 0 && count > room.groupMax) return "group";
  if (room.childrenPerStaff > 0 && room.staff >= 0 && count > room.staff * room.childrenPerStaff) return "ratio";
  return "ok";
}

export function bookingChoice(input: { swapFrom: string | null }): "exchange" | "extra" {
  return input.swapFrom ? "exchange" : "extra";
}

export function exchangeFeeCents(): 0 {
  return 0;
}

export function extraDayFee(input: { enteredCents: number | null; capCents: number | null; mode: "warn" | "block" }): { cents: number | null; overCap: boolean; blocked: boolean } {
  if (input.enteredCents == null || input.enteredCents < 0) return { cents: null, overCap: false, blocked: true };
  const over = input.capCents != null && input.enteredCents > input.capCents;
  return { cents: input.enteredCents, overCap: over, blocked: over && input.mode === "block" };
}

export function quebecCounters(days: readonly string[]): { yearDays: number; overYear: boolean; busiestFourWeeks: number; overFourWeeks: boolean } {
  const unique = [...new Set(days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort();
  const yearDays = unique.filter((day) => day.startsWith("2026-")).length;
  let busiest = 0;
  for (const day of unique) {
    const start = Date.parse(`${day}T00:00:00.000Z`);
    const count = unique.filter((other) => {
      const time = Date.parse(`${other}T00:00:00.000Z`);
      return time >= start && time < start + 28 * 86_400_000;
    }).length;
    if (count > busiest) busiest = count;
  }
  return { yearDays, overYear: yearDays > 261, busiestFourWeeks: busiest, overFourWeeks: busiest > 20 };
}

export function chargeExtraDay(): { charged: false; mode: "test" } {
  return { charged: false, mode: "test" };
}

export function reofferVacantSpot(): false {
  return false;
}

export type PayerKind = "family" | "employer" | "other";

export function receiptGoesTo(payer: PayerKind): PayerKind {
  return payer;
}

export function parentFeeOk(input: { chargedCents: number; lawfulParentCents: number }): boolean {
  return input.chargedCents >= 0 && input.chargedCents <= input.lawfulParentCents;
}

export function waitlistJump(): false {
  return false;
}

export function reserveSpot(): false {
  return false;
}

export function taxAdvice(): null {
  return null;
}
