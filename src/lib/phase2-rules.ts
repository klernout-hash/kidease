/**
 * Phase 2 rules. Flags default off. Nothing here sends mail, push, or a charge.
 */

export function startDateAvailable(openingOn: string | null, requestedOn: string): "yes" | "no" | "unknown" {
  if (!openingOn) return "unknown";
  const open = Date.parse(openingOn);
  const want = Date.parse(requestedOn);
  if (!Number.isFinite(open) || !Number.isFinite(want)) return "unknown";
  return open <= want ? "yes" : "no";
}

export function parseLeadCsv(text: string): { kept: { name: string; email: string }[]; skipped: number } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const body = lines[0]?.toLowerCase().startsWith("name") ? lines.slice(1) : lines;
  const kept: { name: string; email: string }[] = [];
  let skipped = 0;
  for (const line of body) {
    const [name = "", email = ""] = line.split(",").map((part) => part.trim());
    if (!name) {
      skipped += 1;
      continue;
    }
    kept.push({ name: name.slice(0, 80), email: email.slice(0, 120) });
  }
  return { kept, skipped };
}

export const LEAD_TEMPLATE_LABELS = {
  en: "Note for a new family",
  fr: "Note pour une nouvelle famille",
} as const;

export function leadTemplateReady(input: { enSubject: string; frSubject: string }): boolean {
  return input.enSubject.trim().length > 0 && input.frSubject.trim().length > 0;
}

export function leadTemplateSend(): { deliver: false; reason: "held" } {
  return { deliver: false, reason: "held" };
}

export function customRoleAllows(granted: readonly string[], resource: string): boolean {
  return granted.includes(resource);
}

export function staffMessageVisible(input: {
  viewerRole: string | null | undefined;
  centreIds: readonly string[];
  messageCentreId: string;
}): boolean {
  const role = input.viewerRole;
  if (role !== "owner" && role !== "manager" && role !== "staff") return false;
  return input.centreIds.includes(input.messageCentreId);
}

export function nativePushPlan(): { deliver: false; reason: "send_disabled" } {
  return { deliver: false, reason: "send_disabled" };
}

export type PtoDecision = "approved" | "denied" | "blocked";

export function decidePto(input: { actorId: string; staffId: string; decision: "approve" | "deny" }): PtoDecision {
  if (!input.actorId || input.actorId === input.staffId) return "blocked";
  return input.decision === "approve" ? "approved" : "denied";
}

export function approvedPtoHours(rows: readonly { status: "requested" | "approved" | "denied"; hours: number }[]): number {
  return rows.reduce((sum, row) => sum + (row.status === "approved" && row.hours > 0 ? row.hours : 0), 0);
}

export const PTO_LABELS = {
  requested: { en: "Requested", fr: "Demandé" },
  approved: { en: "Approved", fr: "Approuvé" },
  denied: { en: "Not approved", fr: "Refusé" },
} as const;

export function splitSharesOk(shares: readonly number[]): boolean {
  if (shares.length < 2) return false;
  if (shares.some((share) => !Number.isInteger(share) || share < 1 || share > 99)) return false;
  return shares.reduce((sum, share) => sum + share, 0) === 100;
}

export function applyCredit(balanceCents: number, creditCents: number): { balanceCents: number; appliedCents: number } {
  const balance = Math.max(0, Math.trunc(balanceCents));
  const credit = Math.max(0, Math.trunc(creditCents));
  const applied = Math.min(balance, credit);
  return { balanceCents: balance - applied, appliedCents: applied };
}

export const MEDICATION_LABELS = {
  dose: { en: "Dose given", fr: "Dose donnée" },
  check: { en: "Health check", fr: "Contrôle de santé" },
} as const;

export function medicationDoseAllowed(input: { name: string; permissionId: string | null }): boolean {
  return input.name.trim().length > 0 && Boolean(input.permissionId && input.permissionId.trim());
}

export function medicationReminder(): { deliver: false; reason: "send_disabled" } {
  return { deliver: false, reason: "send_disabled" };
}

export function healthCheckVisible(input: {
  role: string | null | undefined;
  childId: string;
  viewerChildIds: readonly string[];
}): boolean {
  if (input.role !== "parent" && input.role !== "owner" && input.role !== "manager" && input.role !== "staff") return false;
  return input.viewerChildIds.includes(input.childId);
}

export function siteTransferAllowed(input: {
  fromId: string;
  toId: string;
  ownerCentreIds: readonly string[];
}): boolean {
  if (!input.fromId || !input.toId || input.fromId === input.toId) return false;
  return input.ownerCentreIds.includes(input.fromId) && input.ownerCentreIds.includes(input.toId);
}
