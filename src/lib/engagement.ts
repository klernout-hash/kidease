/**
 * Parent and centre engagement rules. Analytics stay coarse.
 * A file stays in quarantine until a scanner exists. This module never marks one clean.
 */

import type { CentreMemberRole } from "./centre-roles.ts";

export const ENGAGEMENT_EVENTS = [
  "inquiry_sent",
  "provider_reply",
  "tour_outcome",
  "thread_return_7d",
] as const;

export type EngagementEventName = (typeof ENGAGEMENT_EVENTS)[number];

export const TOUR_OUTCOMES = ["accepted", "declined", "enrolled", "lost", "expired", "no_show"] as const;

const PII = /email|phone|name|child|address|message|body|note|postal|token|secret|birth/i;

export type EngagementPlan = {
  event: EngagementEventName;
  dedupeKey: string;
  actorHash: string;
  centreHash: string;
  threadHash: string;
  role: "parent" | "provider" | "staff";
  environment: "production" | "preview" | "test";
  responseSeconds: number | null;
  tourOutcome: string | null;
};

export function opaqueId(kind: "a" | "c" | "t", raw: string): string {
  const value = `${kind}\0${raw}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < value.length; i += 1) {
    h1 = Math.imul(h1 ^ value.charCodeAt(i), 0x01000193);
    h2 = Math.imul(h2 ^ value.charCodeAt(value.length - 1 - i), 0x01000193);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `${kind}_${hex(h1)}${hex(h2)}`;
}

export function planEngagementEvent(input: {
  event: EngagementEventName;
  actorId: string;
  centreId: string;
  threadId: string;
  role: "parent" | "provider" | "staff";
  environment: "production" | "preview" | "test";
  qa: boolean;
  responseSeconds?: number | null;
  tourOutcome?: string | null;
  day?: string;
  extra?: Record<string, unknown>;
}): EngagementPlan | null {
  if (input.qa) return null;
  if (!input.actorId || !input.centreId || !input.threadId) return null;
  if (input.extra) {
    for (const key of Object.keys(input.extra)) {
      if (PII.test(key)) return null;
    }
  }
  const outcome = input.event === "tour_outcome" ? String(input.tourOutcome || "") : "";
  if (input.event === "tour_outcome" && !(TOUR_OUTCOMES as readonly string[]).includes(outcome)) return null;
  const seconds =
    input.event === "provider_reply" && typeof input.responseSeconds === "number" && input.responseSeconds >= 0
      ? Math.min(Math.round(input.responseSeconds), 60 * 60 * 24 * 30)
      : null;
  const threadHash = opaqueId("t", input.threadId);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(input.day || "") ? input.day : "undated";
  const dedupe =
    input.event === "provider_reply"
      ? `provider_reply:${threadHash}`
      : input.event === "thread_return_7d"
        ? `thread_return_7d:${threadHash}:${day}`
        : input.event === "tour_outcome"
          ? `tour_outcome:${threadHash}:${outcome}`
          : `inquiry_sent:${threadHash}:${opaqueId("a", input.actorId)}`;
  return {
    event: input.event,
    dedupeKey: dedupe,
    actorHash: opaqueId("a", input.actorId),
    centreHash: opaqueId("c", input.centreId),
    threadHash,
    role: input.role,
    environment: input.environment,
    responseSeconds: seconds,
    tourOutcome: outcome || null,
  };
}

export function withinSevenDays(earlierIso: string, laterIso: string): boolean {
  const a = Date.parse(earlierIso);
  const b = Date.parse(laterIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return false;
  return b - a <= 7 * 24 * 60 * 60 * 1000;
}

export type InboxNext = "reply" | "tour" | "follow_up" | "waitlist" | "none";

export function nextInboxAction(input: {
  unread: boolean;
  viewerIsParent: boolean;
  providerReplied: boolean;
  tourStatus?: string | null;
  bookingStatus?: string | null;
}): InboxNext {
  const tour = String(input.tourStatus || "").toLowerCase();
  const booking = String(input.bookingStatus || "").toLowerCase();
  if (booking === "waitlist" || tour === "enrolled") return "waitlist";
  if (tour === "pending") return "tour";
  if (tour === "completed" || tour === "declined" || tour === "lost" || tour === "expired" || tour === "no_show") {
    return "follow_up";
  }
  if (!input.viewerIsParent && !input.providerReplied) return "reply";
  if (input.unread && !input.viewerIsParent) return "reply";
  return "none";
}

export function canAssignThread(role: CentreMemberRole | null | undefined, active: boolean): boolean {
  return active && (role === "owner" || role === "manager");
}

export function staffSeesThread(input: {
  role: CentreMemberRole | null;
  active: boolean;
  assignedTo: string | null;
  staffId: string;
}): boolean {
  if (!input.active || !input.role) return false;
  if (input.role === "owner" || input.role === "manager") return true;
  if (input.role === "read_only") return true;
  if (input.role !== "staff") return false;
  if (!input.assignedTo) return true;
  return input.assignedTo === input.staffId;
}

export type MessageReceipt = {
  seenInApp: boolean;
  phoneSent: false;
  label: "seen_in_kidease" | "saved_not_phoned";
};

/** Phone delivery is never claimed. Seen means a server read time is after the message. */
export function messageReceipt(input: { seenInApp: boolean; pushDelivered?: boolean }): MessageReceipt {
  return {
    seenInApp: input.seenInApp,
    phoneSent: false,
    label: input.seenInApp ? "seen_in_kidease" : "saved_not_phoned",
  };
}

export function searchAllowed(conversationId: string, allowed: readonly string[]): boolean {
  return allowed.includes(conversationId);
}

const ATTACH_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const ATTACH_MAX = 5 * 1024 * 1024;

export function holdAttachment(input: { mime: string; bytes: number }): 
  | { ok: false; reason: "type" | "size" }
  | { ok: true; status: "quarantine"; readable: false } {
  if (!ATTACH_MIME.has(input.mime)) return { ok: false, reason: "type" };
  if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > ATTACH_MAX) return { ok: false, reason: "size" };
  return { ok: true, status: "quarantine", readable: false };
}

export function readQuarantinedFile(): { ok: false; reason: "quarantine" } {
  return { ok: false, reason: "quarantine" };
}

export function messageNoticePlan(input: { unifiedOn: boolean; liveOn: boolean }): {
  inApp: "off" | "ready";
  email: "off";
  push: "off";
} {
  if (!input.unifiedOn) return { inApp: "off", email: "off", push: "off" };
  return { inApp: "ready", email: "off", push: "off" };
}

export const ENGAGEMENT_FOLLOWUPS = [
  {
    id: "attachments",
    status: "deferred",
    reason: "Files stay in quarantine. Nothing is served until a scanner can mark them clean.",
  },
  {
    id: "announcements",
    status: "deferred",
    reason: "No private announcement or acknowledgement channel in this change.",
  },
  {
    id: "photo_meals_attendance",
    status: "deferred",
    reason: "Those tools stay off. This change only checks the gates.",
  },
  {
    id: "outbound",
    status: "deferred",
    reason: "Email, text, and phone push stay off. In-app readiness does not send.",
  },
] as const;
