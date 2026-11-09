/**
 * Claim review steps. A code is proof only after it was actually sent to a
 * confirmed centre contact. Catalogue emails are not confirmed contacts.
 * A matching code, a licence file, or a fee does not verify the listing.
 */

import { claimCodeDestinationAllowed, claimSendAllowed, type ClaimChannel } from "./claim-contact.ts";

export const CLAIM_CODE_TTL_MS = 30 * 60 * 1000;
export const CLAIM_CODE_MAX_ATTEMPTS = 5;

export type ClaimDeliveryReason =
  | "no_verified_contact"
  | "channel_held"
  | "rate_limited"
  | "destination_blocked"
  | "not_sent";

export type ClaimDeliveryPlan =
  | { action: "send"; channel: ClaimChannel; destination: string }
  | { action: "manual"; reason: ClaimDeliveryReason };

export function planClaimDelivery(input: {
  verifiedEmail?: string | null;
  verifiedPhone?: string | null;
  emailChannelOn: boolean;
  smsChannelOn: boolean;
  production: boolean;
  sends: number;
  sentAt: number | null;
  now: number;
}): ClaimDeliveryPlan {
  const email = String(input.verifiedEmail || "").trim();
  const phone = String(input.verifiedPhone || "").trim();
  const channel: ClaimChannel | null = email ? "email" : phone ? "sms" : null;
  if (!channel) return { action: "manual", reason: "no_verified_contact" };
  const destination = channel === "email" ? email : phone;
  if (channel === "email" && !input.emailChannelOn) return { action: "manual", reason: "channel_held" };
  if (channel === "sms" && !input.smsChannelOn) return { action: "manual", reason: "channel_held" };
  if (!claimSendAllowed(input.sends, input.sentAt, input.now).allowed) {
    return { action: "manual", reason: "rate_limited" };
  }
  if (
    !claimCodeDestinationAllowed({
      production: input.production,
      channel,
      destination,
    })
  ) {
    return { action: "manual", reason: "destination_blocked" };
  }
  return { action: "send", channel, destination };
}

export type ClaimCodeJudgement =
  | { ok: true; matched: boolean }
  | { ok: false; reason: "mismatch" | "expired" | "locked" | "not_sent" };

/**
 * `required` is true only after a send was recorded. A guess does not
 * upgrade a claim that never had a code delivered.
 */
export function judgeClaimCode(input: {
  required: boolean;
  stored: string;
  entered: string;
  sentAt: number | null;
  now: number;
  attempts: number;
}): ClaimCodeJudgement {
  if (!input.required) return { ok: true, matched: false };
  if (input.attempts >= CLAIM_CODE_MAX_ATTEMPTS) return { ok: false, reason: "locked" };
  if (input.sentAt == null || input.now - input.sentAt > CLAIM_CODE_TTL_MS) {
    return { ok: false, reason: input.sentAt == null ? "not_sent" : "expired" };
  }
  const stored = input.stored.trim().toUpperCase();
  const entered = input.entered.trim().toUpperCase();
  if (!stored || stored !== entered) return { ok: false, reason: "mismatch" };
  return { ok: true, matched: true };
}

/** Fees stay on the claim. They do not grant listing edit rights. */
export function claimFeesAllowed(status: string | null | undefined): boolean {
  return status === "waiting";
}
