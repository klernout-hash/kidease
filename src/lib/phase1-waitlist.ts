/**
 * Walk-in leads and program waitlists. Consent defaults off.
 * Offers are held, never emailed. One spot cannot be taken twice.
 */
import { holdAlert, type HoldReason } from "./phase1-gate.ts";
import { standardGroupForAgeMonths } from "./standard-age-groups.ts";

export type LeadSource = "walk_in" | "phone" | "web";

export function canCreateLead(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager" || role === "admissions";
}

export function normalizeContact(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9@+]/g, "");
}

export function suggestLeadMerge(existing: readonly { email: string; phone: string }[], email: string, phone: string): boolean {
  const mail = normalizeContact(email);
  const tel = normalizeContact(phone);
  return existing.some((row) => (mail && normalizeContact(row.email) === mail) || (tel && normalizeContact(row.phone) === tel));
}

export function positionBand(index: number): "1-5" | "6-20" | "21+" {
  const place = index + 1;
  if (place <= 5) return "1-5";
  if (place <= 20) return "6-20";
  return "21+";
}

/** A blank program is not guessed. It only matches when no program is selected. */
export function sameProgram(rowProgram: string | null | undefined, selected: string | null): boolean {
  if (!selected) return true;
  const stored = String(rowProgram || "").trim();
  if (!stored) return false;
  return stored === selected;
}

export type WaitRow = { id: string; joinedAt: string; sibling: boolean; staffChild: boolean };

export function sortWaitlist(rows: readonly WaitRow[], priorities: readonly ("sibling" | "staff_child")[]): WaitRow[] {
  const rank = (row: WaitRow) => {
    for (const [index, rule] of priorities.entries()) {
      if (rule === "sibling" && row.sibling) return index;
      if (rule === "staff_child" && row.staffChild) return index;
    }
    return priorities.length;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id));
}

export function manualReorderAllowed(reason: string): boolean {
  return reason.trim().length >= 3;
}

export function ageAtStartMonths(dob: string | null, start: string): number | null {
  if (!dob) return null;
  const born = Date.parse(dob);
  const when = Date.parse(start);
  if (!Number.isFinite(born) || !Number.isFinite(when) || when < born) return null;
  const months = (when - born) / (1000 * 60 * 60 * 24 * 30.4375);
  return Math.floor(months);
}

export function ageAtStartBand(dob: string | null, start: string): string {
  const months = ageAtStartMonths(dob, start);
  if (months == null) return "unknown";
  return standardGroupForAgeMonths(months) ?? "unknown";
}

export type OfferOutcome = "accepted" | "declined" | "expired" | "open";

export function resolveOffer(input: {
  now: Date;
  expiresAt: string;
  timeZone: string;
  decision: "accept" | "decline" | null;
  spotsAvailable: number;
  alreadyResolved: boolean;
}): { outcome: OfferOutcome; enrolled: boolean; reason: string } {
  if (input.alreadyResolved) return { outcome: "open", enrolled: false, reason: "duplicate" };
  const expires = Date.parse(input.expiresAt);
  if (!Number.isFinite(expires)) return { outcome: "expired", enrolled: false, reason: "bad_deadline" };
  if (input.now.getTime() >= expires) return { outcome: "expired", enrolled: false, reason: "expired" };
  if (input.decision === "decline") return { outcome: "declined", enrolled: false, reason: "declined" };
  if (input.decision === "accept") {
    if (input.spotsAvailable < 1) return { outcome: "open", enrolled: false, reason: "no_spot" };
    return { outcome: "accepted", enrolled: true, reason: "accepted" };
  }
  return { outcome: "open", enrolled: false, reason: "waiting" };
}

export function offerNotice(input: {
  flagOn: boolean;
  enabledAt: string | null;
  sentAt: string;
  alreadySent: boolean;
  quiet: boolean;
  caslOk: boolean;
}): { deliver: false; reason: HoldReason } {
  return holdAlert({
    flagOn: input.flagOn,
    enabledAt: input.enabledAt,
    occurredAt: input.sentAt,
    alreadySent: input.alreadySent,
    quiet: input.quiet,
    needsCasl: true,
    caslOk: input.caslOk,
  });
}

export type FormStatus = "not_sent" | "sent" | "viewed" | "in_progress" | "submitted" | "approved" | "rejected";

const FORM_ORDER: FormStatus[] = ["not_sent", "sent", "viewed", "in_progress", "submitted", "approved", "rejected"];

export function nextFormStatus(current: FormStatus, event: "send" | "view" | "progress" | "submit" | "approve" | "reject"): FormStatus {
  const map: Record<typeof event, FormStatus> = {
    send: "sent",
    view: "viewed",
    progress: "in_progress",
    submit: "submitted",
    approve: "approved",
    reject: "rejected",
  };
  const next = map[event];
  if (current === "approved" || current === "rejected") return current;
  if (FORM_ORDER.indexOf(next) < FORM_ORDER.indexOf(current) && next !== "rejected") return current;
  return next;
}

export function parentSeesOwnWaitlist(ownerId: string, viewerId: string): boolean {
  return ownerId === viewerId;
}
