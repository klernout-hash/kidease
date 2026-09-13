import { DEFAULT_TRANSACTIONAL_MAIL_FROM, transactionalMailFrom } from "./mail-from.ts";

/** Auto-start / remount cooldown. Does not apply to an explicit "Send a new code". */
export const TWO_FACTOR_AUTO_COOLDOWN_MS = 45_000;
/** Soft cap on explicit resend so "Send a new code" cannot be hammered. */
export const TWO_FACTOR_RESEND_COOLDOWN_MS = 15_000;
export const TWO_FACTOR_MAX_ATTEMPTS = 5;

/**
 * Resend-aligned 2FA From. Apex `kyle@kidease.ca` fails SPF (Titan-only `-all`),
 * so Outlook quarantines OTPs. MAIL_FROM on send.kidease.ca still wins;
 * leftover Production MAIL_FROM=kyle@ is ignored. Reply-To stays ADMIN_EMAIL.
 */
export const TWO_FACTOR_DEFAULT_MAIL_FROM = DEFAULT_TRANSACTIONAL_MAIL_FROM;

export function twoFactorMailFrom(mailFrom = process.env.MAIL_FROM): string {
  return transactionalMailFrom(mailFrom);
}

/** Resend `{ id }` only — never log API keys or message bodies. */
export function resendMessageId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const id = (payload as { id?: unknown }).id;
  if (typeof id !== "string") return undefined;
  const trimmed = id.trim();
  return trimmed || undefined;
}

export type TwoFactorChallengeSnapshot = {
  createdAtMs: number;
  expiresAtMs: number;
  attempts: number;
};

export type TwoFactorStartDecision = "mint" | "wait" | "reuse";

/**
 * Decide whether to mint a new 2FA challenge.
 *
 * Auto-start (`force: false`) must not remint while the first email may still
 * be in flight, and must reuse an unexpired challenge after the cooldown.
 * Explicit resend (`force: true`) always mints a replacement code unless the
 * short resend cooldown has not elapsed — never "reuse" / "previous still valid".
 */
export function decideTwoFactorStart(input: {
  force: boolean;
  last: TwoFactorChallengeSnapshot | null;
  nowMs?: number;
}): TwoFactorStartDecision {
  const nowMs = input.nowMs ?? Date.now();
  const last = input.last;
  if (!last) return "mint";
  if (input.force) {
    if (nowMs - last.createdAtMs < TWO_FACTOR_RESEND_COOLDOWN_MS) return "wait";
    return "mint";
  }
  if (nowMs - last.createdAtMs < TWO_FACTOR_AUTO_COOLDOWN_MS) return "wait";
  if (last.expiresAtMs > nowMs && last.attempts < TWO_FACTOR_MAX_ATTEMPTS) return "reuse";
  return "mint";
}

export function twoFactorWaitSeconds(input: {
  force: boolean;
  last: TwoFactorChallengeSnapshot | null;
  nowMs?: number;
}): number {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.last) return 0;
  const cooldownMs = input.force ? TWO_FACTOR_RESEND_COOLDOWN_MS : TWO_FACTOR_AUTO_COOLDOWN_MS;
  const leftMs = cooldownMs - (nowMs - input.last.createdAtMs);
  if (leftMs <= 0) return 0;
  return Math.ceil(leftMs / 1000);
}

export function twoFactorResendWaitCopy(seconds: number): string {
  const n = Math.max(1, Math.ceil(seconds));
  return `Wait ${n}s then resend`;
}

export function friendlyTwoFactorMailError(error: unknown): string {
  const raw = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  if (raw.includes("not configured")) {
    return "Email is not configured, so we could not send a new code.";
  }
  return "We could not send a new code. Try again in a moment.";
}
