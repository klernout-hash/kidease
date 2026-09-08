/** Auto-start / remount cooldown. Does not apply to an explicit "Send a new code". */
export const TWO_FACTOR_AUTO_COOLDOWN_MS = 45_000;
export const TWO_FACTOR_MAX_ATTEMPTS = 5;

/**
 * Resend-aligned 2FA From. Apex `kyle@kidease.ca` fails SPF (Titan-only `-all`),
 * so Outlook quarantines OTPs. Override with MAIL_FROM after `send.kidease.ca`
 * SPF + DKIM + bounce MX verify. Reply-To stays ADMIN_EMAIL / kyle@.
 */
export const TWO_FACTOR_DEFAULT_MAIL_FROM = "KidEase <login@send.kidease.ca>";

export function twoFactorMailFrom(mailFrom = process.env.MAIL_FROM): string {
  return (mailFrom || "").trim() || TWO_FACTOR_DEFAULT_MAIL_FROM;
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
 * Explicit resend (`force: true`) always mints so "Send a new code" can send.
 */
export function decideTwoFactorStart(input: {
  force: boolean;
  last: TwoFactorChallengeSnapshot | null;
  nowMs?: number;
}): TwoFactorStartDecision {
  const nowMs = input.nowMs ?? Date.now();
  const last = input.last;
  if (!last) return "mint";
  if (input.force) return "mint";
  if (nowMs - last.createdAtMs < TWO_FACTOR_AUTO_COOLDOWN_MS) return "wait";
  if (last.expiresAtMs > nowMs && last.attempts < TWO_FACTOR_MAX_ATTEMPTS) return "reuse";
  return "mint";
}

export function friendlyTwoFactorMailError(error: unknown): string {
  const raw = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  if (raw.includes("not configured")) {
    return "Email is not configured, so we could not send a new code.";
  }
  if (raw.includes("resend") || raw.includes("sendgrid") || raw.includes("could not send")) {
    return "We could not send a new code. Your previous code is still valid if it has not expired.";
  }
  return "We could not send a new code. Try again, or use the code you already have.";
}
