/**
 * Recipient-only email, text, and phone-alert plan.
 *
 * Nothing in this file sends. Senders do not call it, so customers stay off
 * and existing queues are not read. A later send still needs a named
 * allow-list, this plan, and a separate preview approval.
 *
 * Rollback: leave allowSend false. There is no queue table to replay.
 */

export type NotifyChannel = "email" | "sms" | "push";

export type RecipientPlan =
  | {
      deliver: false;
      reason: "gate_off" | "customer_suppressed" | "replay" | "duplicate" | "role" | "locale";
    }
  | { deliver: true; channel: NotifyChannel; dedupeKey: string };

export function planRecipientOnly(input: {
  /** Must be passed true on purpose. The default is off. */
  allowSend?: boolean;
  channel: NotifyChannel;
  recipient: string;
  allowlist: readonly string[];
  createdAtMs: number;
  /** Anything older than this is an existing queue item and is skipped. */
  notBeforeMs: number;
  dedupeKey: string;
  seenKeys: readonly string[];
  role: string;
  locale: string;
}): RecipientPlan {
  if (input.allowSend !== true) return { deliver: false, reason: "gate_off" };
  const recipient = input.recipient.trim().toLowerCase();
  const allow = new Set(input.allowlist.map((row) => row.trim().toLowerCase()).filter(Boolean));
  if (!recipient || !allow.has(recipient)) return { deliver: false, reason: "customer_suppressed" };
  if (!(input.createdAtMs >= input.notBeforeMs)) return { deliver: false, reason: "replay" };
  const key = input.dedupeKey.trim();
  if (!key || input.seenKeys.includes(key)) return { deliver: false, reason: "duplicate" };
  if (input.role !== "parent" && input.role !== "provider") return { deliver: false, reason: "role" };
  if (input.locale !== "en" && input.locale !== "fr") return { deliver: false, reason: "locale" };
  return { deliver: true, channel: input.channel, dedupeKey: key };
}
