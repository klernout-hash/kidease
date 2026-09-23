import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * High-stakes step-up window after a password or email-OTP confirm.
 * Approve / Live, Un-Live / decline, licence document or review, screening
 * review, contracts, password/email, and public review moderation use this.
 * A longer desk grace does not satisfy these actions.
 */
export const REAUTH_WINDOW_MS = 10 * 60 * 1000;
export const REAUTH_WINDOW_MINUTES = REAUTH_WINDOW_MS / 60_000;

/**
 * Grace after one successful Admin password or email-OTP confirm for low-risk
 * mutations that already require step-up (Straighten photo / listing photo
 * reprocess, optional notes, non-trust field edits).
 *
 * Inside this window those actions skip the password dialog. When it expires,
 * the next protected action re-prompts once and a successful confirm renews
 * the window. High-stakes actions keep {@link REAUTH_WINDOW_MS}.
 *
 * Default is 20 minutes. Override with env `ADMIN_REAUTH_GRACE_MS` (positive
 * milliseconds). Empty, zero, negative, or non-numeric values keep this
 * default. Explicit values are clamped to {@link REAUTH_WINDOW_MS}..{@link ADMIN_REAUTH_GRACE_MAX_MS}
 * so grace is never stricter than high-stakes and never a day-long bypass.
 */
export const ADMIN_REAUTH_GRACE_DEFAULT_MS = 20 * 60 * 1000;
export const ADMIN_REAUTH_GRACE_MINUTES = ADMIN_REAUTH_GRACE_DEFAULT_MS / 60_000;
/** Upper bound for `ADMIN_REAUTH_GRACE_MS`. */
export const ADMIN_REAUTH_GRACE_MAX_MS = 60 * 60 * 1000;

export const ADMIN_IDLE_TTL_MS = 30 * 60 * 1000;

export const REAUTH_REQUIRED_MESSAGE = "Confirm it's you to continue.";
export const REAUTH_COOKIE = "__Host-kidease.reauth";
export const SHARED_REAUTH_COOKIE = "__Secure-kidease.reauth";
export const ADMIN_IDLE_COOKIE = "__Host-kidease.admin.seen";
export const SHARED_ADMIN_IDLE_COOKIE = "__Secure-kidease.admin.seen";

export function isReauthRequiredMessage(message?: string | null): boolean {
  const raw = String(message || "").trim();
  return raw === REAUTH_REQUIRED_MESSAGE || raw.toLowerCase().includes("confirm it's you");
}

export function signReauthCookie(userId: string, exp: number, secret: string): string {
  const body = `${userId}.${exp}`;
  const sig = createHmac("sha256", secret).update(`reauth:${body}`).digest("hex");
  return `${body}.${sig}`;
}

export function parseReauthCookie(
  raw: string | null | undefined,
  secret: string,
): { userId: string; exp: number } | null {
  if (!raw || !secret) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = createHmac("sha256", secret).update(`reauth:${userId}.${exp}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { userId, exp };
}

export function isRecentReauth(
  userId: string,
  raw: string | null | undefined,
  secret: string,
): boolean {
  const parsed = parseReauthCookie(raw, secret);
  return Boolean(parsed && parsed.userId === userId && parsed.exp > Date.now());
}

export function reauthRemainingMs(raw: string | null | undefined, secret: string, nowMs = Date.now()): number {
  const parsed = parseReauthCookie(raw, secret);
  if (!parsed) return 0;
  return Math.max(0, parsed.exp - nowMs);
}

/** `high` keeps the short step-up window. `grace` is the desk-edit window. */
export type StepUpClass = "high" | "grace";

/**
 * Actions that already prompt, plus trust-critical Admin mutations.
 * Unknown future actions should be treated as `high` (secure by default).
 */
export const STEP_UP_ACTIONS = {
  approve_live: "high",
  unlive_decline: "high",
  license_document: "high",
  license_review: "high",
  screening_review: "high",
  contract_send: "high",
  contract_void: "high",
  password_change: "high",
  email_change: "high",
  listing_review: "high",
  reviewer_grant: "high",
  straighten_photo: "grace",
  optional_note: "grace",
  non_trust_field: "grace",
} as const;

export type StepUpAction = keyof typeof STEP_UP_ACTIONS;

export function stepUpClass(action: StepUpAction): StepUpClass {
  return STEP_UP_ACTIONS[action];
}

/** Cookie payload version. Middle field is confirm time, not expiry. */
export const REAUTH_STAMP_VERSION = "v2";

const STEP_UP_SKEW_MS = 60_000;

export function adminReauthGraceMs(raw?: string | null): number {
  const text = String(raw ?? "").trim();
  if (!text) return ADMIN_REAUTH_GRACE_DEFAULT_MS;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return ADMIN_REAUTH_GRACE_DEFAULT_MS;
  return Math.max(REAUTH_WINDOW_MS, Math.min(Math.floor(n), ADMIN_REAUTH_GRACE_MAX_MS));
}

export function stepUpWindowMs(klass: StepUpClass, graceMs = ADMIN_REAUTH_GRACE_DEFAULT_MS): number {
  return klass === "high" ? REAUTH_WINDOW_MS : graceMs;
}

/**
 * True when a confirm at `confirmedAtMs` still covers this class.
 * Exactly at the window boundary the action must confirm again.
 * Legacy expiry cookies (`legacyExpMs`) cover either class only until `exp`.
 */
export function stepUpAllows(input: {
  class: StepUpClass;
  confirmedAtMs: number | null;
  nowMs?: number;
  graceMs?: number;
  legacyExpMs?: number | null;
}): boolean {
  const now = input.nowMs ?? Date.now();
  const grace = input.graceMs ?? ADMIN_REAUTH_GRACE_DEFAULT_MS;
  if (input.confirmedAtMs != null && Number.isFinite(input.confirmedAtMs)) {
    if (input.confirmedAtMs <= 0 || input.confirmedAtMs > now + STEP_UP_SKEW_MS) return false;
    return now < input.confirmedAtMs + stepUpWindowMs(input.class, grace);
  }
  if (input.legacyExpMs != null && Number.isFinite(input.legacyExpMs)) {
    return input.legacyExpMs > now;
  }
  return false;
}

export type ReauthProof =
  | { kind: "stamp"; userId: string; confirmedAt: number }
  | { kind: "legacy"; userId: string; exp: number };

function signaturesMatch(sig: string, expected: string): boolean {
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Stamp cookie: confirm time, so high-stakes and grace can use different windows. */
export function signReauthStamp(userId: string, confirmedAt: number, secret: string): string {
  const at = Math.floor(confirmedAt);
  const body = `${REAUTH_STAMP_VERSION}.${userId}.${at}`;
  const sig = createHmac("sha256", secret).update(`reauth:${body}`).digest("hex");
  return `${body}.${sig}`;
}

export function parseReauthProof(raw: string | null | undefined, secret: string): ReauthProof | null {
  if (!raw || !secret) return null;
  const parts = raw.split(".");
  if (parts.length === 4 && parts[0] === REAUTH_STAMP_VERSION) {
    const [, userId, atRaw, sig] = parts;
    const confirmedAt = Number(atRaw);
    if (!userId || !Number.isFinite(confirmedAt) || confirmedAt <= 0) return null;
    const expected = createHmac("sha256", secret)
      .update(`reauth:${REAUTH_STAMP_VERSION}.${userId}.${confirmedAt}`)
      .digest("hex");
    if (!signaturesMatch(sig, expected)) return null;
    return { kind: "stamp", userId, confirmedAt };
  }
  const legacy = parseReauthCookie(raw, secret);
  if (!legacy) return null;
  return { kind: "legacy", userId: legacy.userId, exp: legacy.exp };
}

export function reauthProofAllows(
  proof: ReauthProof | null,
  userId: string,
  klass: StepUpClass,
  nowMs = Date.now(),
  graceMs = ADMIN_REAUTH_GRACE_DEFAULT_MS,
): boolean {
  if (!proof || proof.userId !== userId) return false;
  if (proof.kind === "stamp") {
    return stepUpAllows({ class: klass, confirmedAtMs: proof.confirmedAt, nowMs, graceMs });
  }
  return stepUpAllows({ class: klass, confirmedAtMs: null, legacyExpMs: proof.exp, nowMs, graceMs });
}
