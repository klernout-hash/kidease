/**
 * Real mail for five Phase 0 notices. Everyone else is dropped.
 * SMS and push never leave. Nothing from before the cutoff is replayed.
 * scripts/qa-send.test.mjs loads this file in Node.
 */

export const QA_SEND_FEATURES = ["ADM-08", "ADM-11", "ADM-19", "ADM-23", "MSG-03"] as const;
export type QaSendFeature = (typeof QA_SEND_FEATURES)[number];

export type QaSendChannel = "email" | "sms" | "push";

export type QaSendReason =
  | "sent"
  | "dropped"
  | "held_channel"
  | "bad_sender"
  | "pre_enable"
  | "enable_time_unset"
  | "duplicate"
  | "empty_allowlist"
  | "bad_feature";

export type QaSendDecision = {
  deliver: boolean;
  reason: QaSendReason;
  feature: QaSendFeature | "";
  channel: QaSendChannel;
};

const APPROVED_FEATURES: readonly string[] = QA_SEND_FEATURES;

export function parseQaAllowlist(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const part of String(raw || "").split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase();
    if (email === "*" || email.includes("@")) seen.add(email);
  }
  return [...seen];
}

export function senderIsKidEaseMailbox(sender: string): boolean {
  const email = sender.trim().toLowerCase();
  if (!email || email.includes("openroadoutlet.ca")) return false;
  const host = email.split("@").pop() || "";
  return host === "kidease.ca";
}

/** Fail closed. An empty allowlist sends nothing. */
export function qaSendDecision(input: {
  feature: string;
  channel: QaSendChannel;
  recipient: string;
  sender: string;
  occurredAt: string | null;
  enabledAt: string | null;
  alreadySent: boolean;
  allowlist: readonly string[];
}): QaSendDecision {
  const feature: QaSendDecision["feature"] = APPROVED_FEATURES.includes(input.feature)
    ? (input.feature as QaSendFeature)
    : "";
  const base = { feature, channel: input.channel };
  if (!feature) return { ...base, deliver: false, reason: "bad_feature" };
  if (input.channel !== "email") return { ...base, deliver: false, reason: "held_channel" };
  if (!senderIsKidEaseMailbox(input.sender)) return { ...base, deliver: false, reason: "bad_sender" };
  if (!input.allowlist.length) return { ...base, deliver: false, reason: "empty_allowlist" };
  const recipient = input.recipient.trim().toLowerCase();
  const open = input.allowlist.some((item) => item.trim() === "*");
  if (!open && !input.allowlist.map((item) => item.toLowerCase()).includes(recipient)) {
    return { ...base, deliver: false, reason: "dropped" };
  }
  if (input.alreadySent) return { ...base, deliver: false, reason: "duplicate" };
  const enabled = input.enabledAt ? Date.parse(input.enabledAt) : NaN;
  if (!Number.isFinite(enabled)) return { ...base, deliver: false, reason: "enable_time_unset" };
  const occurred = input.occurredAt ? Date.parse(input.occurredAt) : NaN;
  if (!Number.isFinite(occurred) || occurred < enabled) return { ...base, deliver: false, reason: "pre_enable" };
  return { ...base, deliver: true, reason: "sent" };
}
