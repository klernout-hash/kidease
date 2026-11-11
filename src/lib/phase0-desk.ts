/**
 * Document requests, both-guardian signing, form-share notes, family email,
 * and list exports. Nothing here sends mail or opens a signature envelope.
 * scripts/phase0-desk.test.mjs loads this file in Node.
 */
import type { CentreMemberRole } from "./centre-roles.ts";
import { dayKeyInTimeZone } from "./family-time.ts";

export const REQUEST_DOC_TYPES = ["immunization", "custody"] as const;
export type RequestDocType = (typeof REQUEST_DOC_TYPES)[number];

export const REQUEST_DOC_LABELS: Record<RequestDocType, { en: string; fr: string }> = {
  immunization: { en: "Immunization record", fr: "Carnet de vaccination" },
  custody: { en: "Custody order", fr: "Ordonnance de garde" },
};

export function canViewRequestedDocument(role: CentreMemberRole | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

export type ReminderMilestone = "created" | "due_soon" | "overdue";

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year || 1970, (month || 1) - 1, date || 1));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function planDocumentReminder(input: {
  flagOn: boolean;
  createdAt: string;
  enabledAt: string | null;
  dueOn: string;
  now: Date;
  timeZone: string;
  received: boolean;
  sentMilestones: readonly ReminderMilestone[];
}): { milestone: ReminderMilestone | null; deliver: false; reason: string } {
  if (!input.flagOn) return { milestone: null, deliver: false, reason: "flag_off" };
  const enabled = input.enabledAt ? Date.parse(input.enabledAt) : NaN;
  const created = Date.parse(input.createdAt);
  if (!Number.isFinite(enabled) || !Number.isFinite(created) || created < enabled) {
    return { milestone: null, deliver: false, reason: "pre_enable" };
  }
  if (input.received) return { milestone: null, deliver: false, reason: "received" };
  const today = dayKeyInTimeZone(input.now, input.timeZone);
  const sent = new Set(input.sentMilestones);
  let milestone: ReminderMilestone | null = null;
  if (today > input.dueOn) milestone = "overdue";
  else if (today >= addDays(input.dueOn, -3)) milestone = "due_soon";
  else milestone = "created";
  if (sent.has(milestone)) return { milestone: null, deliver: false, reason: "duplicate" };
  return { milestone, deliver: false, reason: "held" };
}

export type AgreementState = "draft" | "sent" | "partially_signed" | "completed" | "voided";

/** Complete only when every required signer has signed, or one signer has a director attestation. */
export function agreementAfterSign(input: {
  state: AgreementState;
  requiredSignerIds: readonly string[];
  signedSignerIds: readonly string[];
  directorAttestation: boolean;
}): AgreementState {
  if (input.state === "voided" || input.state === "completed") return input.state;
  const required = [...new Set(input.requiredSignerIds.map((id) => id.trim()).filter(Boolean))];
  const signed = new Set(input.signedSignerIds.map((id) => id.trim()).filter(Boolean));
  if (!required.length) return input.state === "draft" ? "draft" : "sent";
  const allSigned = required.every((id) => signed.has(id));
  if (required.length === 1 && input.directorAttestation && allSigned) return "completed";
  if (required.length >= 2 && allSigned) return "completed";
  if (required.some((id) => signed.has(id))) return "partially_signed";
  return input.state === "draft" ? "sent" : input.state;
}

const TEN_MINUTES = 10 * 60 * 1000;

export function planFormShareEmail(input: {
  flagOn: boolean;
  shares: readonly { id: string; at: string; locale: "en" | "fr" }[];
  alreadySentIds: readonly string[];
  nowMs: number;
}): { deliver: false; shareIds: string[]; locale: "en" | "fr"; batched: boolean; reason: string } {
  if (!input.flagOn) return { deliver: false, shareIds: [], locale: "en", batched: false, reason: "flag_off" };
  const sent = new Set(input.alreadySentIds);
  const fresh = input.shares
    .filter((share) => share.id && !sent.has(share.id))
    .map((share) => ({ ...share, atMs: Date.parse(share.at) }))
    .filter((share) => Number.isFinite(share.atMs))
    .sort((a, b) => a.atMs - b.atMs);
  if (!fresh.length) return { deliver: false, shareIds: [], locale: "en", batched: false, reason: "duplicate" };
  const newest = fresh[fresh.length - 1]!;
  const batch = fresh.filter((share) => newest.atMs - share.atMs <= TEN_MINUTES && share.atMs <= input.nowMs);
  return {
    deliver: false,
    shareIds: batch.map((share) => share.id),
    locale: newest.locale === "fr" ? "fr" : "en",
    batched: batch.length > 1,
    reason: "held",
  };
}

export function senderIsKidEase(email: string): boolean {
  const host = email.trim().toLowerCase().split("@")[1] || "";
  return host === "kidease.ca" && !email.toLowerCase().includes("openroadoutlet.ca");
}

export function planFamilyEmail(input: {
  flagOn: boolean;
  messageId: string;
  sender: string;
  locale: "en" | "fr";
  alreadySent: boolean;
  suppressed: "none" | "bounce" | "complaint";
}): { deliver: false; reason: string; event: "family_email_sent" | "email_bounced"; locale: "en" | "fr" } {
  const locale = input.locale === "fr" ? "fr" : "en";
  if (!input.flagOn) return { deliver: false, reason: "flag_off", event: "family_email_sent", locale };
  if (!senderIsKidEase(input.sender)) return { deliver: false, reason: "bad_sender", event: "family_email_sent", locale };
  if (input.suppressed === "bounce") return { deliver: false, reason: "bounce", event: "email_bounced", locale };
  if (input.suppressed === "complaint") return { deliver: false, reason: "complaint", event: "email_bounced", locale };
  if (input.alreadySent) return { deliver: false, reason: "duplicate", event: "family_email_sent", locale };
  return { deliver: false, reason: "held", event: "family_email_sent", locale };
}

export function familyEmailSubject(locale: "en" | "fr", centre: string): string {
  return locale === "fr" ? `Message de ${centre} : fermeture demain` : `Note from ${centre}: closed tomorrow`;
}

const HEALTH_COLUMNS = new Set(["immunization", "custody", "allergy"]);

export function listCsv(input: {
  flagOn: boolean;
  list: string;
  canViewHealth: boolean;
  columns: readonly string[];
  rows: readonly Record<string, string>[];
  timeZone: string;
  dateColumns: readonly string[];
}): { ok: true; body: string; event: "csv_exported" } | { ok: false; reason: "flag_off" } {
  if (!input.flagOn) return { ok: false, reason: "flag_off" };
  const columns = input.columns.filter((column) => input.canViewHealth || !HEALTH_COLUMNS.has(column));
  const lines = [columns.join(",")];
  for (const row of input.rows) {
    lines.push(
      columns
        .map((column) => {
          const raw = row[column] ?? "";
          const value = input.dateColumns.includes(column) ? isoInZone(raw, input.timeZone) : raw;
          return csvCell(value);
        })
        .join(","),
    );
  }
  return { ok: true, body: `\uFEFF${lines.join("\r\n")}\r\n`, event: "csv_exported" };
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function isoInZone(value: string, timeZone: string): string {
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return value;
  return dayKeyInTimeZone(new Date(stamp), timeZone);
}
