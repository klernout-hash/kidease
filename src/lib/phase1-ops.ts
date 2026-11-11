/**
 * Credentials, roles, reports, audit, and privacy requests.
 * No file is scanned by a new vendor. PDF text is checked, not sent.
 */
import { holdAlert, type HoldReason } from "./phase1-gate.ts";
import { dayKeyInTimeZone } from "./family-time.ts";

const ALLOWED_FILE = /\.(pdf|jpe?g|png)$/i;

export function certificateFileOk(name: string, bytes: number): { ok: boolean; reason: "ok" | "type" | "size" | "scan_not_run" } {
  if (!ALLOWED_FILE.test(name)) return { ok: false, reason: "type" };
  if (bytes <= 0 || bytes > 8_000_000) return { ok: false, reason: "size" };
  return { ok: true, reason: "scan_not_run" };
}

export function credentialReminder(input: {
  flagOn: boolean;
  enabledAt: string | null;
  expiresOn: string;
  now: Date;
  timeZone: string;
  sentDays: readonly number[];
  quiet: boolean;
  staffId: string;
  viewerId: string;
  viewerRole: string;
}): { deliver: false; reason: HoldReason | "not_due" | "not_own"; days: number | null } {
  if (input.viewerRole !== "owner" && input.viewerRole !== "director" && input.viewerId !== input.staffId) {
    return { deliver: false, reason: "not_own", days: null };
  }
  const today = dayKeyInTimeZone(input.now, input.timeZone);
  const days = Math.round((Date.parse(`${input.expiresOn}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000);
  const milestone = [60, 30, 7].find((mark) => days <= mark && days > mark - 1 && !input.sentDays.includes(mark));
  if (milestone == null) return { deliver: false, reason: "not_due", days };
  const held = holdAlert({
    flagOn: input.flagOn,
    enabledAt: input.enabledAt,
    occurredAt: input.now.toISOString(),
    alreadySent: false,
    quiet: input.quiet,
    needsCasl: false,
    caslOk: true,
  });
  return { ...held, days: milestone };
}

export type ScreeningStatus = "current" | "due" | "overdue" | "missing";

export function screeningStatus(input: { issuedOn: string | null; intervalDays: number; now: Date }): ScreeningStatus {
  if (!input.issuedOn) return "missing";
  const issued = Date.parse(input.issuedOn);
  if (!Number.isFinite(issued)) return "missing";
  const ageDays = (input.now.getTime() - issued) / 86_400_000;
  if (ageDays > input.intervalDays) return "overdue";
  if (input.intervalDays - ageDays <= 30) return "due";
  return "current";
}

export function centreContext(selectedId: string | null, memberships: readonly string[], fallbackId: string): {
  ok: boolean;
  centreId: string | null;
  status: 200 | 403;
} {
  const selected = String(selectedId || "").trim();
  if (!selected || !memberships.includes(selected)) {
    return memberships.includes(fallbackId)
      ? { ok: false, centreId: fallbackId, status: 403 }
      : { ok: false, centreId: null, status: 403 };
  }
  return { ok: true, centreId: selected, status: 200 };
}

const BILLING_RESOURCES = new Set(["invoices", "payments", "statements", "receipts"]);
const HEALTH_RESOURCES = new Set(["health", "messages", "daily_care", "documents"]);

export function billingRoleAllows(resource: string): boolean {
  if (HEALTH_RESOURCES.has(resource)) return false;
  return BILLING_RESOURCES.has(resource);
}

export function familyMessagingAllowed(denied: boolean): boolean {
  return !denied;
}

export function ledgerTotal(rows: readonly { cents: number }[]): number {
  return rows.reduce((sum, row) => sum + row.cents, 0);
}

export function pdfLineFits(line: string, maxChars = 90): boolean {
  return [...line].length <= maxChars;
}

export type AuditEntry = { id: string; actorId: string; action: string; at: string; centreId: string };

export function appendAudit(log: readonly AuditEntry[], entry: AuditEntry): AuditEntry[] {
  return [...log, entry];
}

export function auditVisible(entry: AuditEntry, ownerCentreIds: readonly string[]): boolean {
  return ownerCentreIds.includes(entry.centreId);
}

export function securityStatementAllowed(input: { claim: string; evidenceReviewedAt: string | null; now: Date }): boolean {
  if (!input.evidenceReviewedAt) return false;
  const reviewed = Date.parse(input.evidenceReviewedAt);
  if (!Number.isFinite(reviewed)) return false;
  if (input.now.getTime() - reviewed > 366 * 86_400_000) return false;
  return !/certified|soc 2|iso 27001|hipaa/i.test(input.claim);
}

export function privacyCase(input: { type: "access" | "correction" | "deletion"; requesterId: string }): {
  caseId: string;
  visibleTo: "privacy_officer";
  contact: "privacy@kidease.ca";
} {
  const caseId = `pr-${input.type}-${input.requesterId.slice(0, 8)}`;
  return { caseId, visibleTo: "privacy_officer", contact: "privacy@kidease.ca" };
}
