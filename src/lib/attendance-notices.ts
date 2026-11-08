/**
 * Who may be told about a saved arrival or pickup.
 * A notice never grants pickup. Demo rows stay held and are not replayed.
 * This module does not send email, SMS, or push.
 */

import { DEMO_CENTRE_ID } from "./attendance-handoff.ts";

export type NoticeAudience = "guardian" | "centre" | "name_only";
export type NoticeChannel = "demo" | "account";
export type NoticeStatus = "held" | "skipped" | "eligible" | "waiting" | "retry" | "suppressed";

export type NoticePerson = {
  userId: string;
  audience: "guardian" | "centre";
};

export function isDemoAttendance(input: { daycareId: string; isTest?: boolean | number | null; daycareName?: string | null }): boolean {
  if (input.daycareId === DEMO_CENTRE_ID) return true;
  if (input.isTest === true || input.isTest === 1) return true;
  return String(input.daycareName || "").trim().toUpperCase().startsWith("DEMO");
}

/** Linked parent account, plus active owners and managers. Pickup names are not recipients. */
export function noticeRecipients(input: {
  guardianUserId: string;
  centreUserIds: readonly { userId: string; role: string }[];
  actorId: string;
}): NoticePerson[] {
  const out: NoticePerson[] = [];
  const seen = new Set<string>();
  const guardian = input.guardianUserId.trim();
  if (guardian) {
    out.push({ userId: guardian, audience: "guardian" });
    seen.add(`guardian:${guardian}`);
  }
  for (const member of input.centreUserIds) {
    const role = member.role.trim().toLowerCase();
    if (role !== "owner" && role !== "manager") continue;
    const userId = member.userId.trim();
    if (!userId || userId === input.actorId) continue;
    const key = `centre:${userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ userId, audience: "centre" });
  }
  return out;
}

export function noticeGrantsPickup(): false {
  return false;
}

export type ChannelGate = {
  /** FEATURE_UNIFIED_ALERTS and FEATURE_UNIFIED_ALERTS_LIVE. */
  transportLive: boolean;
  emailVerified: boolean;
  pushArmed: boolean;
  /** Absent preference keeps the account default: email on, push off. */
  emailWanted: boolean | null;
  pushWanted: boolean | null;
};

export type Eligibility =
  | { status: "waiting"; reason: "transport_off" | "email_unverified" | "push_unarmed" }
  | { status: "suppressed"; reason: "pref_off" }
  | { status: "eligible"; reason: "in_app" };

/** Decides whether a real account notice may leave the building. Never sends. */
export function eligibilityFor(gate: ChannelGate): Eligibility {
  const email = gate.emailWanted !== false;
  const push = gate.pushWanted === true;
  if (!email && !push) return { status: "suppressed", reason: "pref_off" };
  if (!gate.transportLive) return { status: "waiting", reason: "transport_off" };
  if (email && !gate.emailVerified) return { status: "waiting", reason: "email_unverified" };
  if (push && !gate.pushArmed) return { status: "waiting", reason: "push_unarmed" };
  return { status: "eligible", reason: "in_app" };
}

export function canReadNotice(userId: string, recipientUserId: string | null): boolean {
  return Boolean(userId) && userId === recipientUserId;
}

/** Held demo rows are never promoted into a live send. */
export function refuseHeldReplay(row: { channel: string; status: string }): { ok: false; reason: "held_not_live" } | { ok: true } {
  if (row.channel === "demo" || row.status === "held") return { ok: false, reason: "held_not_live" };
  return { ok: true };
}
