/**
 * KidEase's own signup leads for GoHighLevel.
 * Contacts and opportunities only. No workflows, no mail, no text.
 * These leads never belong in a daycare's CRM.
 * scripts/ghl-lead-push.test.mjs loads this file in Node.
 */
import { isProtectedQaIdentity, isStoreReviewerEmail } from "./reviewer-accounts.ts";
import type { EnvMap } from "./runtime-env.ts";

export const GHL_LEAD_PUSH_FLAG = "FEATURE_GHL_LEAD_PUSH";
export const GHL_LINE_TYPE_FLAG = "FEATURE_GHL_LINE_TYPE";
/** Twilio Lookup pricing page, October 2026. Line Type Intelligence. */
export const TWILIO_LINE_TYPE_USD_PER_LOOKUP = 0.008;
export const TWILIO_LINE_TYPE_PRICE_PAGE = "https://www.twilio.com/en-us/user-authentication-identity/pricing/lookup";

export const GHL_PUSH_MAX_ATTEMPTS = 5;
const BACKOFF_MS = [5 * 60_000, 30 * 60_000, 2 * 3_600_000, 8 * 3_600_000];

export const QA_SEED_EMAILS = [
  "reviewer.parent@kidease.ca",
  "reviewer.daycare@kidease.ca",
  "reviewer-parent@kidease.ca",
  "reviewer-provider@kidease.ca",
  "qa-parent-two@kidease.ca",
  "qa-guardian-two@kidease.ca",
  "qa-staff-readonly@kidease.ca",
] as const;

export type GhlLeadTrigger = "parent_signup" | "provider_signup" | "claim_verify";
export type GhlLeadAudience = "parent" | "daycare";
export type LineType = "mobile" | "landline" | "invalid";

export type LeadPushInput = {
  userId: string;
  role: "parent" | "provider";
  trigger: GhlLeadTrigger;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  isTest?: boolean;
  testListing?: boolean;
};

export type StoredLeadPush = {
  userId: string;
  attempts: number;
  result: string;
  contactId: string | null;
  opportunityId: string | null;
  nextAttemptAt: string | null;
  lineType: LineType | null;
};

export function ghlLeadPushEnabled(env?: EnvMap): boolean {
  return String(env?.[GHL_LEAD_PUSH_FLAG] || "").trim() === "1";
}

export function ghlLineTypeEnabled(env?: EnvMap): boolean {
  return String(env?.[GHL_LINE_TYPE_FLAG] || "").trim() === "1";
}

export function audienceForLead(input: { role: "parent" | "provider"; trigger: GhlLeadTrigger }): GhlLeadAudience {
  if (input.trigger === "provider_signup" || input.trigger === "claim_verify" || input.role === "provider") return "daycare";
  return "parent";
}

export function pipelineName(audience: GhlLeadAudience): "Parent Onboard" | "Daycare Sign Up" {
  return audience === "parent" ? "Parent Onboard" : "Daycare Sign Up";
}

export function isQaGhlLead(input: { email?: string | null; name?: string | null; isTest?: boolean; testListing?: boolean }): boolean {
  const email = String(input.email || "").trim().toLowerCase();
  if (isStoreReviewerEmail(email) || (QA_SEED_EMAILS as readonly string[]).includes(email)) return true;
  if (email.endsWith("@kidease.ca")) {
    const local = email.slice(0, email.indexOf("@"));
    if (local.includes("reviewer") || local.startsWith("qa-") || local.includes("+qa") || local.includes("qa+")) return true;
  }
  if (isProtectedQaIdentity(email) || isProtectedQaIdentity(input.name)) return true;
  return input.isTest === true || input.testListing === true;
}

export function classifyLineType(input: { valid?: boolean | null; type?: string | null; errorCode?: number | null }): LineType {
  if (input.valid === false || (input.errorCode != null && input.errorCode !== 0)) return "invalid";
  const type = String(input.type || "").trim().toLowerCase();
  if (type === "mobile") return "mobile";
  if (type === "landline") return "landline";
  return "invalid";
}

export function lineTypeTag(line: LineType | null): "sms:mobile" | "sms:no-sms" | null {
  if (!line) return null;
  return line === "mobile" ? "sms:mobile" : "sms:no-sms";
}

export function leadTags(input: LeadPushInput, line: LineType | null): string[] {
  const tags: string[] = [];
  if (isQaGhlLead(input)) tags.push("qa:test");
  const sms = lineTypeTag(line);
  if (sms) tags.push(sms);
  return tags;
}

export function nextPushDelayMs(attemptsAfterFailure: number): number | null {
  if (attemptsAfterFailure >= GHL_PUSH_MAX_ATTEMPTS) return null;
  const index = Math.max(0, attemptsAfterFailure - 1);
  return BACKOFF_MS[Math.min(index, BACKOFF_MS.length - 1)];
}

export function retryIsDue(row: StoredLeadPush | null, nowIso: string, force: boolean): boolean {
  if (force) return true;
  if (!row) return true;
  if (row.result === "ok" && row.contactId && row.opportunityId) return false;
  if (row.attempts >= GHL_PUSH_MAX_ATTEMPTS) return false;
  if (!row.nextAttemptAt) return true;
  return row.nextAttemptAt <= nowIso;
}

export type SignupCheck = {
  userId: string;
  email: string;
  signedUpAt: string;
};

export type GhlSnapshot = {
  email: string;
  readError?: boolean;
  contactId: string | null;
  opportunityId: string | null;
  welcomeEmailAt: string | null;
};

export type ReconcileGap = {
  userId: string;
  email: string;
  kind: "missing_contact" | "missing_opportunity" | "missing_welcome";
};

const HOUR_MS = 3_600_000;

/** Read-only comparison. It does not say to email or text anyone. */
export function reconcileGhlSignups(
  signups: readonly SignupCheck[],
  snapshots: ReadonlyMap<string, GhlSnapshot>,
  nowIso: string,
): { gaps: ReconcileGap[]; checked: number; readFailed: number } {
  const now = Date.parse(nowIso);
  const gaps: ReconcileGap[] = [];
  let readFailed = 0;
  for (const signup of signups) {
    const snap = snapshots.get(signup.email.trim().toLowerCase());
    if (!snap || snap.readError) {
      readFailed += 1;
      continue;
    }
    if (!snap.contactId) {
      gaps.push({ userId: signup.userId, email: signup.email, kind: "missing_contact" });
      continue;
    }
    if (!snap.opportunityId) {
      gaps.push({ userId: signup.userId, email: signup.email, kind: "missing_opportunity" });
    }
    const signed = Date.parse(signup.signedUpAt);
    if (!Number.isFinite(now) || !Number.isFinite(signed) || now - signed < HOUR_MS) continue;
    const welcome = snap.welcomeEmailAt ? Date.parse(snap.welcomeEmailAt) : NaN;
    const onTime = Number.isFinite(welcome) && welcome >= signed && welcome - signed <= HOUR_MS;
    if (!onTime) gaps.push({ userId: signup.userId, email: signup.email, kind: "missing_welcome" });
  }
  return { gaps, checked: signups.length, readFailed };
}

export type PushContactResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; contactId: string; opportunityId?: string }
  | { ok: false; error: string };

export async function runLeadPush(
  input: LeadPushInput,
  deps: {
    env?: EnvMap;
    now: string;
    force?: boolean;
    loadRow: (userId: string) => Promise<StoredLeadPush | null>;
    saveRow: (row: StoredLeadPush & { email: string; audience: GhlLeadAudience; trigger: GhlLeadTrigger; lineType: LineType | null; lastError: string | null }) => Promise<void>;
    lookupLine?: (phone: string) => Promise<{ valid?: boolean | null; type?: string | null; errorCode?: number | null } | null>;
    pushContact: (payload: { extraTags: string[]; allowReviewer: boolean }) => Promise<PushContactResult>;
  },
): Promise<
  | { tookOver: false; reason: "flag-off" }
  | { tookOver: true; result: "ok" | "retry" | "skipped"; contactId: string | null; opportunityId: string | null; lineType: LineType | null; attempts: number }
> {
  if (!ghlLeadPushEnabled(deps.env)) return { tookOver: false, reason: "flag-off" };
  const email = String(input.email || "").trim().toLowerCase();
  const userId = input.userId.trim();
  if (!userId || !email) {
    return { tookOver: true, result: "skipped", contactId: null, opportunityId: null, lineType: null, attempts: 0 };
  }
  const existing = await deps.loadRow(userId);
  if (!retryIsDue(existing, deps.now, deps.force === true)) {
    return {
      tookOver: true,
      result: existing?.result === "ok" ? "ok" : "retry",
      contactId: existing?.contactId ?? null,
      opportunityId: existing?.opportunityId ?? null,
      lineType: existing?.lineType ?? null,
      attempts: existing?.attempts ?? 0,
    };
  }
  let line = existing?.lineType ?? null;
  const phone = String(input.phone || "").trim();
  if (!line && phone && ghlLineTypeEnabled(deps.env) && deps.lookupLine) {
    const looked = await deps.lookupLine(phone);
    line = looked ? classifyLineType(looked) : "invalid";
  }
  const pushed = await deps.pushContact({ extraTags: leadTags(input, line), allowReviewer: true });
  const attempts = (existing?.attempts ?? 0) + 1;
  const audience = audienceForLead(input);
  if (pushed.ok && !pushed.skipped) {
    await deps.saveRow({
      userId,
      email,
      audience,
      trigger: input.trigger,
      attempts,
      result: "ok",
      contactId: pushed.contactId,
      opportunityId: pushed.opportunityId || existing?.opportunityId || null,
      nextAttemptAt: null,
      lineType: line,
      lastError: null,
    });
    return { tookOver: true, result: "ok", contactId: pushed.contactId, opportunityId: pushed.opportunityId || existing?.opportunityId || null, lineType: line, attempts };
  }
  const delay = nextPushDelayMs(attempts);
  const nextAttemptAt = delay == null ? null : new Date(Date.parse(deps.now) + delay).toISOString();
  const error = pushed.ok ? pushed.reason : pushed.error;
  await deps.saveRow({
    userId,
    email,
    audience,
    trigger: input.trigger,
    attempts,
    result: "retry",
    contactId: existing?.contactId ?? null,
    opportunityId: existing?.opportunityId ?? null,
    nextAttemptAt,
    lineType: line,
    lastError: error,
  });
  return { tookOver: true, result: "retry", contactId: existing?.contactId ?? null, opportunityId: existing?.opportunityId ?? null, lineType: line, attempts };
}
