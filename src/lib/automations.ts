/**
 * KidEase automation pack. Pure decisions: flags, quiet hours, CASL, dedupe,
 * rate limits, and each scheduler. No database and no secrets.
 * scripts/automations.test.mjs loads this file in Node.
 *
 * Every new automation defaults off. Turning the flag on starts dry-run
 * (logs the intended send). A matching FEATURE_*_LIVE=1 is required to send,
 * hide spots, export a backup, or page Kyle.
 */

import { CASL_SENDER, decideCaslSend, normalizeCaslEmail } from "./casl.ts";
import { envFlagOn, type EnvMap } from "./flags.ts";
import { dayKeyInTimeZone, isValidTimeZone, quietHourInZone } from "./family-time.ts";

export { dayKeyInTimeZone } from "./family-time.ts";
import { feeProgramBadgeKey, officialLicenceNumber } from "./licensing.ts";

export const AUTOMATION_ORIGIN = "https://www.kidease.ca";
export const OPS_ALERT_EMAIL = "kyle@kidease.ca";
export const AUTOMATION_FALLBACK_TZ = "America/Winnipeg";
export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 8;

export const AUTOMATION_WEEKLY_CAP = 4;
export const CLAIM_REMINDER_DAILY_CAP_DEFAULT = 25;
export const CLAIM_REMINDER_MAX = 3;
export const CLAIM_REMINDER_GAP_DAYS = 14;
export const STALE_SPOT_REMIND_DAYS = 21;
export const STALE_SPOT_HIDE_DAYS = 30;
export const TOUR_FOLLOWUP_AFTER_MS = 24 * 60 * 60 * 1000;
export const TOUR_FOLLOWUP_UNTIL_MS = 72 * 60 * 60 * 1000;
export const REVIEW_AFTER_DAYS = 30;
export const REVIEW_UNTIL_DAYS = 37;
export const OPS_CRITICAL_ERROR_COUNT = 25;
export const OPS_DIGEST_HOUR = 8;
export const ONBOARD_GRACE_DAYS = 1;

export const NEW_AUTOMATION_FLAGS = [
  "FEATURE_POSTHOG_ERRORS",
  "FEATURE_OPS_ALERTS",
  "FEATURE_CRON_HEARTBEATS",
  "FEATURE_INVOICE_REMINDERS",
  "FEATURE_PAYMENT_DUNNING",
  "FEATURE_MISSING_INFO_REMINDERS",
  "FEATURE_DAYCARE_ONBOARDING",
  "FEATURE_CLAIM_LISTING_REMINDERS",
  "FEATURE_STALE_OPEN_SPOTS",
  "FEATURE_POST_TOUR_FOLLOWUP",
  "FEATURE_ENROLMENT_REVIEW",
  "FEATURE_NEON_BACKUP",
] as const;

export type NewAutomationFlag = (typeof NEW_AUTOMATION_FLAGS)[number];

/** Flags that already exist. This pack does not change their defaults. */
export const TURN_ON_FLAGS = [
  {
    key: "FEATURE_OPEN_SPOTS_CHECKIN_MAIL",
    sends: "email",
    note: "Weekly open-spots email to claimed daycares. No SMS.",
  },
  {
    key: "FEATURE_OPEN_SPOTS_CHECKIN_SMS",
    sends: "sms",
    note: "Weekly open-spots text. Also needs FEATURE_SMS, stored CASL consent, and Twilio. Quiet hours apply in the send path.",
  },
  {
    key: "FEATURE_SPOT_OFFER_MAIL",
    sends: "email",
    note: "Email when a daycare offers a spot. The offer still shows in the parent account while this is off.",
  },
  {
    key: "FEATURE_OPEN_SPOT_ALERTS",
    sends: "email",
    note: "Email when a saved search matches a newly posted open spot. Needs CASL. In-app notices stay on.",
  },
] as const;

export const COMMERCIAL_AUTOMATIONS = [
  "missing_info_centre",
  "missing_info_parent",
  "daycare_onboarding",
  "claim_listing",
  "stale_spot_reminder",
  "tour_followup",
  "enrolment_review",
] as const;

export type CommercialAutomation = (typeof COMMERCIAL_AUTOMATIONS)[number];

export const INVOICE_REMINDER_STAGES = ["before_3", "due", "overdue_3", "overdue_7"] as const;
export type InvoiceReminderStage = (typeof INVOICE_REMINDER_STAGES)[number];

export const DUNNING_STAGES = ["fail_0", "fail_3", "fail_7"] as const;
export type DunningStage = (typeof DUNNING_STAGES)[number];

export const ONBOARD_STEPS = ["d0", "d2", "d7"] as const;
export type OnboardStep = (typeof ONBOARD_STEPS)[number];

export const MISSING_FIELDS = ["licence", "photos", "fees", "hours", "contact", "ages"] as const;
export type MissingField = (typeof MISSING_FIELDS)[number];

export type AutomationMode = "off" | "dry_run" | "live";
export type AutomationLocale = "en" | "fr";

export type SendSkip =
  | "off"
  | "duplicate"
  | "quiet"
  | "weekly_cap"
  | "daily_cap"
  | "suppressed"
  | "allowlist"
  | "no_consent"
  | "blocked"
  | "sms_off"
  | "complete"
  | "not_due";

const PROVINCE_TIME_ZONE: Record<string, string> = {
  BC: "America/Vancouver",
  AB: "America/Edmonton",
  SK: "America/Regina",
  MB: "America/Winnipeg",
  ON: "America/Toronto",
  QC: "America/Toronto",
  NB: "America/Moncton",
  NS: "America/Halifax",
  PE: "America/Halifax",
  NL: "America/St_Johns",
  YT: "America/Whitehorse",
  NT: "America/Yellowknife",
  NU: "America/Iqaluit",
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function automationLiveEnv(flag: string): string {
  return `${flag}_LIVE`;
}

/**
 * Flag off → nothing runs.
 * Flag on, without FEATURE_*_LIVE → dry-run (log the intended send).
 * Both on → live. A request dry-run always wins over live.
 */
export function automationMode(flagOn: boolean, liveRaw: string | undefined | null, requestDryRun = false): AutomationMode {
  if (!flagOn) return "off";
  if (requestDryRun) return "dry_run";
  if (envFlagOn(liveRaw)) return "live";
  return "dry_run";
}

export function automationModeFromEnv(flag: NewAutomationFlag, env: EnvMap, requestDryRun = false): AutomationMode {
  const on = envFlagOn(env[flag]);
  return automationMode(on, env[automationLiveEnv(flag)], requestDryRun);
}

export function parseAllowlist(raw: string | undefined | null): string[] | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const list = text
    .split(/[,;\s]+/)
    .map((part) => normalizeCaslEmail(part))
    .filter(Boolean);
  return list.length ? list : null;
}

export function recipientAllowed(email: string, allowlist: string[] | null): boolean {
  if (!allowlist) return true;
  const normalized = normalizeCaslEmail(email);
  if (!normalized) return false;
  return allowlist.includes(normalized);
}

export function automationZone(zone?: string | null, province?: string | null): string {
  const trimmed = String(zone || "").trim();
  if (isValidTimeZone(trimmed)) return trimmed;
  const fromProvince = PROVINCE_TIME_ZONE[String(province || "").trim().toUpperCase()];
  if (fromProvince && isValidTimeZone(fromProvince)) return fromProvince;
  return AUTOMATION_FALLBACK_TZ;
}

/** 9pm–8am in the recipient's zone. Unknown zone uses Winnipeg so we do not send at night. */
export function automationQuietNow(now: Date, zone?: string | null, province?: string | null): boolean {
  return quietHourInZone(now, automationZone(zone, province));
}

export function automationLocale(raw: unknown): AutomationLocale {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  return value === "fr" || value.startsWith("fr-") ? "fr" : "en";
}

export function isCommercialAutomation(automation: string): boolean {
  return (COMMERCIAL_AUTOMATIONS as readonly string[]).includes(automation);
}

export function dedupeDecision(alreadySent: boolean): { send: boolean; reason: "ok" | "duplicate" } {
  if (alreadySent) return { send: false, reason: "duplicate" };
  return { send: true, reason: "ok" };
}

export function weeklyCapAllows(sentInWindow: number, cap = AUTOMATION_WEEKLY_CAP): boolean {
  if (!Number.isFinite(sentInWindow) || sentInWindow < 0) return true;
  return sentInWindow < cap;
}

export function claimDailyCapAllows(sentToday: number, cap = CLAIM_REMINDER_DAILY_CAP_DEFAULT): boolean {
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : CLAIM_REMINDER_DAILY_CAP_DEFAULT;
  return sentToday < limit;
}

export function parseDailyCap(raw: string | undefined | null): number {
  const n = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(n) || n < 1) return CLAIM_REMINDER_DAILY_CAP_DEFAULT;
  return Math.min(500, n);
}

export type SmsGate =
  | { ok: true }
  | { ok: false; reason: "sms_off" | "no_consent" | "blocked" | "quiet" };

/** SMS leaves only with FEATURE_SMS, stored CASL consent, and outside quiet hours. */
export function smsAutomationGate(input: {
  featureSms: boolean;
  userGranted: boolean;
  addressBlocked: boolean;
  quiet: boolean;
}): SmsGate {
  if (!input.featureSms) return { ok: false, reason: "sms_off" };
  if (input.quiet) return { ok: false, reason: "quiet" };
  const decision = decideCaslSend({
    userGranted: input.userGranted,
    addressBlocked: input.addressBlocked,
  });
  if (!decision.ok) {
    return { ok: false, reason: decision.reason.includes("opted out") ? "blocked" : "no_consent" };
  }
  return { ok: true };
}

export type EmailBlockReason = "bounce" | "complaint" | "unsubscribe" | "manual" | null;

/** Bounces and complaints stop every mail. Unsubscribe stops commercial mail, not a bill. */
export function emailBlocked(input: {
  suppressed: boolean;
  reason: EmailBlockReason;
  commercial: boolean;
}): boolean {
  if (!input.suppressed) return false;
  if (input.reason === "bounce" || input.reason === "complaint") return true;
  return input.commercial;
}

export function calendarDay(value: string | null | undefined): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || "").trim());
  return match ? match[1] : null;
}

export function daysBetweenDates(fromDay: string, toDay: string): number | null {
  const start = Date.parse(`${fromDay}T00:00:00Z`);
  const end = Date.parse(`${toDay}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / DAY_MS);
}

export function weekKey(now: Date, zone = AUTOMATION_FALLBACK_TZ): string {
  const day = dayKeyInTimeZone(now, automationZone(zone));
  const noon = new Date(`${day}T12:00:00Z`);
  const weekday = noon.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  noon.setUTCDate(noon.getUTCDate() + mondayOffset);
  return noon.toISOString().slice(0, 10);
}

const PAID = new Set(["paid", "void", "refunded", "draft", "uncollectible", "canceled", "cancelled"]);
const FAILED = new Set(["past_due", "payment_failed", "failed"]);
const OPENABLE = new Set(["sent", "open", "unpaid", "past_due", "payment_failed", "failed"]);

export function invoiceClosed(status: string | null | undefined, paidAt: string | null | undefined): boolean {
  if (paidAt && String(paidAt).trim()) return true;
  return PAID.has(String(status || "").trim().toLowerCase());
}

export function invoiceReminderStage(
  due: string | null | undefined,
  today: string,
): InvoiceReminderStage | null {
  const dueDay = calendarDay(due);
  if (!dueDay) return null;
  const delta = daysBetweenDates(today, dueDay);
  if (delta === 3) return "before_3";
  if (delta === 0) return "due";
  if (delta === -3) return "overdue_3";
  if (delta === -7) return "overdue_7";
  return null;
}

export function dunningStage(
  failedOn: string | null | undefined,
  today: string,
): DunningStage | null {
  const day = calendarDay(failedOn);
  if (!day) return null;
  const age = daysBetweenDates(day, today);
  if (age === 0) return "fail_0";
  if (age === 3) return "fail_3";
  if (age === 7) return "fail_7";
  return null;
}

export type InvoicePlan =
  | { kind: "stop"; reason: "paid" | "not_due" | "draft" }
  | { kind: "remind"; stage: InvoiceReminderStage; dedupeKey: string }
  | { kind: "dunning"; stage: DunningStage; dedupeKey: string };

/**
 * Reminders: 3 days before, due date, 3 and 7 days overdue.
 * Dunning: the day a payment fails, then 3 and 7 days later.
 * A failed status uses dunning only, so the parent does not get two mails.
 * Stops when the bill is paid, void, or still a draft.
 */
export function planInvoiceMail(input: {
  invoiceId: string;
  status: string | null | undefined;
  dueAt: string | null | undefined;
  paidAt: string | null | undefined;
  failedAt: string | null | undefined;
  today: string;
  remindersOn: boolean;
  dunningOn: boolean;
}): InvoicePlan {
  if (invoiceClosed(input.status, input.paidAt)) return { kind: "stop", reason: "paid" };
  const status = String(input.status || "").trim().toLowerCase();
  if (!OPENABLE.has(status)) return { kind: "stop", reason: "draft" };
  if (input.dunningOn && FAILED.has(status)) {
    const stage = dunningStage(input.failedAt || input.dueAt, input.today);
    if (!stage) return { kind: "stop", reason: "not_due" };
    return { kind: "dunning", stage, dedupeKey: `dun:${input.invoiceId}:${stage}` };
  }
  if (!input.remindersOn) return { kind: "stop", reason: "not_due" };
  const stage = invoiceReminderStage(input.dueAt, input.today);
  if (!stage) return { kind: "stop", reason: "not_due" };
  return { kind: "remind", stage, dedupeKey: `inv:${input.invoiceId}:${stage}` };
}

export function listingPhotoMissing(photos: string | null | undefined): boolean {
  const parts = String(photos || "")
    .split(/[,|\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return true;
  return !parts.some((src) => {
    const value = src.toLowerCase();
    if (!value || value.includes("placeholder") || value.includes("-logo")) return false;
    if (value.includes("/photos/wpg/")) return false;
    return true;
  });
}

export function hoursMissing(hours: string | null | undefined): boolean {
  const value = String(hours || "").trim();
  if (!value || value === "—" || value === "-") return true;
  if (/^hours not/i.test(value) || /^see (the )?centre/i.test(value) || /^tbd$/i.test(value)) return true;
  return value.length < 4;
}

export function feesMissing(input: {
  province?: string | null;
  infant?: number | null;
  toddler?: number | null;
  preschool?: number | null;
  partTime?: number | null;
}): boolean {
  if (feeProgramBadgeKey(String(input.province || ""))) return false;
  return ![input.infant, input.toddler, input.preschool, input.partTime].some(
    (amount) => amount != null && Number(amount) > 0,
  );
}

export function agesMissing(input: {
  agesConfirmed?: boolean | number | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
}): boolean {
  if (input.agesConfirmed === true || input.agesConfirmed === 1) return false;
  const min = Number(input.ageMinMonths) || 0;
  const max = Number(input.ageMaxMonths) || 0;
  return !(max > min && max > 0);
}

export function contactMissing(phone?: string | null, email?: string | null): boolean {
  return !String(phone || "").trim() && !normalizeCaslEmail(email);
}

export function centreMissingFields(input: {
  id: string;
  province?: string | null;
  licenseNumber?: string | null;
  photos?: string | null;
  hours?: string | null;
  phone?: string | null;
  email?: string | null;
  infant?: number | null;
  toddler?: number | null;
  preschool?: number | null;
  partTime?: number | null;
  agesConfirmed?: boolean | number | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
}): MissingField[] {
  const missing: MissingField[] = [];
  if (!officialLicenceNumber(input.licenseNumber, input.id)) missing.push("licence");
  if (listingPhotoMissing(input.photos)) missing.push("photos");
  if (feesMissing(input)) missing.push("fees");
  if (hoursMissing(input.hours)) missing.push("hours");
  if (contactMissing(input.phone, input.email)) missing.push("contact");
  if (agesMissing(input)) missing.push("ages");
  return missing;
}

export function parentChildProfileMissing(completeChildren: number): boolean {
  return completeChildren < 1;
}

const ONBOARD_DAY: Record<OnboardStep, number> = { d0: 0, d2: 2, d7: 7 };

export function onboardingStep(claimedAt: string | null | undefined, today: string): OnboardStep | null {
  const claimed = calendarDay(claimedAt);
  if (!claimed) return null;
  const age = daysBetweenDates(claimed, today);
  if (age == null || age < 0 || age > 7 + ONBOARD_GRACE_DAYS) return null;
  const steps: OnboardStep[] = ["d7", "d2", "d0"];
  for (const step of steps) {
    const target = ONBOARD_DAY[step];
    if (age >= target && age <= target + ONBOARD_GRACE_DAYS) return step;
  }
  return null;
}

const BLOCKED_EMAIL_HOSTS = new Set(["example.com", "example.org", "example.net", "test.com", "localhost"]);

/** Published centre email. Not a KidEase mailbox and not a placeholder host. */
export function isPublicBusinessEmail(raw: string | null | undefined): boolean {
  const email = normalizeCaslEmail(raw);
  if (!email) return false;
  const host = email.split("@")[1] || "";
  if (!host || BLOCKED_EMAIL_HOSTS.has(host)) return false;
  if (host === "kidease.ca" || host.endsWith(".kidease.ca")) return false;
  return true;
}

export function claimReminderPlan(input: {
  daycareId: string;
  claimed: boolean;
  email: string | null | undefined;
  suppressed: boolean;
  sentCount: number;
  sentToday: number;
  dailyCap: number;
  nowMs: number;
  lastSentMs?: number | null;
}): { send: boolean; reason: SendSkip | "ok"; dedupeKey: string } {
  const dedupeKey = `claim:${input.daycareId}:${Math.floor(input.nowMs / (CLAIM_REMINDER_GAP_DAYS * DAY_MS))}`;
  if (input.claimed) return { send: false, reason: "complete", dedupeKey };
  if (!isPublicBusinessEmail(input.email)) return { send: false, reason: "not_due", dedupeKey };
  if (input.suppressed) return { send: false, reason: "suppressed", dedupeKey };
  if (input.sentCount >= CLAIM_REMINDER_MAX) return { send: false, reason: "complete", dedupeKey };
  if (!claimDailyCapAllows(input.sentToday, input.dailyCap)) return { send: false, reason: "daily_cap", dedupeKey };
  if (input.lastSentMs != null && input.nowMs - input.lastSentMs < CLAIM_REMINDER_GAP_DAYS * DAY_MS) {
    return { send: false, reason: "duplicate", dedupeKey };
  }
  return { send: true, reason: "ok", dedupeKey };
}

export type StaleSpotAction = "none" | "remind" | "hide";

export function staleSpotAction(input: {
  spots: number;
  updatedAt: string | null | undefined;
  hiddenAt?: string | null;
  nowMs: number;
}): StaleSpotAction {
  if (input.spots <= 0) return "none";
  if (input.hiddenAt) return "none";
  const stamp = input.updatedAt ? Date.parse(input.updatedAt) : NaN;
  if (!Number.isFinite(stamp)) return "hide";
  const days = (input.nowMs - stamp) / DAY_MS;
  if (days >= STALE_SPOT_HIDE_DAYS) return "hide";
  if (days >= STALE_SPOT_REMIND_DAYS) return "remind";
  return "none";
}

export function tourFollowupDue(tourAt: string | null | undefined, nowMs: number): boolean {
  const stamp = tourAt ? Date.parse(tourAt) : NaN;
  if (!Number.isFinite(stamp)) return false;
  const age = nowMs - stamp;
  return age >= TOUR_FOLLOWUP_AFTER_MS && age < TOUR_FOLLOWUP_UNTIL_MS;
}

export function reviewRequestDue(enrolledAt: string | null | undefined, nowMs: number): boolean {
  const stamp = enrolledAt ? Date.parse(enrolledAt) : NaN;
  if (!Number.isFinite(stamp)) return false;
  const days = (nowMs - stamp) / DAY_MS;
  return days >= REVIEW_AFTER_DAYS && days < REVIEW_UNTIL_DAYS;
}

export function opsAlertPlan(input: {
  now: Date;
  errorsLastHour: number;
  jobFailuresLastHour: number;
  digestSentToday: boolean;
  criticalSentThisHour: boolean;
}): { immediate: boolean; digest: boolean } {
  const hour = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: AUTOMATION_FALLBACK_TZ,
      hour: "numeric",
      hourCycle: "h23",
    }).format(input.now),
  );
  const digest = hour === OPS_DIGEST_HOUR && !input.digestSentToday;
  const critical =
    !input.criticalSentThisHour &&
    (input.jobFailuresLastHour > 0 || input.errorsLastHour >= OPS_CRITICAL_ERROR_COUNT);
  return { immediate: critical, digest };
}

export function isWeeklyReminderDay(now: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: AUTOMATION_FALLBACK_TZ,
    weekday: "short",
  }).format(now);
  return weekday === "Mon";
}

/** Sunday in Winnipeg. force=1 runs any day (ops). */
export function backupDue(now: Date, force = false): boolean {
  if (force) return true;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: AUTOMATION_FALLBACK_TZ,
    weekday: "short",
  }).format(now);
  return weekday === "Sun";
}

export function backupObjectKey(day: string): string {
  return `backups/neon/${day}.dump`;
}

export function pgConnEnv(databaseUrl: string | undefined | null):
  | { ok: true; env: Record<string, string> }
  | { ok: false; error: "missing" | "not_postgres" } {
  const raw = String(databaseUrl || "").trim();
  if (!raw) return { ok: false, error: "missing" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "not_postgres" };
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return { ok: false, error: "not_postgres" };
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!url.hostname || !database) return { ok: false, error: "not_postgres" };
  const ssl = url.searchParams.get("sslmode");
  return {
    ok: true,
    env: {
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGUSER: decodeURIComponent(url.username || ""),
      PGPASSWORD: decodeURIComponent(url.password || ""),
      PGDATABASE: database,
      ...(ssl ? { PGSSLMODE: ssl } : { PGSSLMODE: "require" }),
    },
  };
}

export function restoreListLooksValid(listText: string): boolean {
  const text = String(listText || "");
  if (text.length < 20) return false;
  return /TOC|TABLE|DATABASE|SCHEMA/i.test(text);
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function caslMailFooter(locale: AutomationLocale, basis: string): { text: string; html: string } {
  const unsub = `${AUTOMATION_ORIGIN}${CASL_SENDER.unsubscribePath}`;
  if (locale === "fr") {
    const text = `\n\n${basis}\nKidEase · ${CASL_SENDER.city}\n${CASL_SENDER.email}\nSe désabonner : ${unsub}\n`;
    const html = `<p style="margin:24px 0 0;font-size:12px;color:#5c6578;">${esc(basis)}<br>KidEase · ${esc(CASL_SENDER.city)} · <a href="${esc(unsub)}">Se désabonner</a></p>`;
    return { text, html };
  }
  const text = `\n\n${basis}\nKidEase · ${CASL_SENDER.city}\n${CASL_SENDER.email}\nUnsubscribe: ${unsub}\n`;
  const html = `<p style="margin:24px 0 0;font-size:12px;color:#5c6578;">${esc(basis)}<br>KidEase · ${esc(CASL_SENDER.city)} · <a href="${esc(unsub)}">Unsubscribe</a></p>`;
  return { text, html };
}

export function localePrefix(locale: AutomationLocale): string {
  return locale === "fr" ? "/fr" : "";
}

export function providerFixHref(locale: AutomationLocale, field: MissingField | "vacancy"): string {
  const desk = field === "licence" ? "licence" : "listings";
  const focus = field === "contact" ? "" : field === "licence" ? "license" : field === "photos" ? "photo" : field;
  const params = new URLSearchParams({ desk });
  if (focus) params.set("focus", focus);
  return `${AUTOMATION_ORIGIN}${localePrefix(locale)}/provider?${params.toString()}`;
}

export function parentChildHref(locale: AutomationLocale): string {
  return `${AUTOMATION_ORIGIN}${localePrefix(locale)}/parent?tab=children`;
}

export function claimHref(locale: AutomationLocale, daycareId: string): string {
  return `${AUTOMATION_ORIGIN}${localePrefix(locale)}/claim?id=${encodeURIComponent(daycareId)}`;
}

export function payHref(locale: AutomationLocale): string {
  return `${AUTOMATION_ORIGIN}${localePrefix(locale)}/parent?tab=payments`;
}

export function reviewHref(locale: AutomationLocale, slug: string): string {
  return `${AUTOMATION_ORIGIN}${localePrefix(locale)}/daycare/${encodeURIComponent(slug)}`;
}

const FIELD_COPY: Record<MissingField, { en: string; fr: string }> = {
  licence: {
    en: "Add your provincial licence number",
    fr: "Ajoutez votre numéro de permis provincial",
  },
  photos: {
    en: "Add a photo of your centre",
    fr: "Ajoutez une photo de votre centre",
  },
  fees: {
    en: "Add your monthly fees",
    fr: "Ajoutez vos frais mensuels",
  },
  hours: {
    en: "Add your hours",
    fr: "Ajoutez vos heures",
  },
  contact: {
    en: "Add a phone number or email",
    fr: "Ajoutez un téléphone ou un courriel",
  },
  ages: {
    en: "Add the ages you care for",
    fr: "Ajoutez les âges que vous accueillez",
  },
};

export function missingInfoLetter(input: {
  locale: AutomationLocale;
  centreName: string;
  missing: MissingField[];
}): { subject: string; text: string; html: string } {
  const fr = input.locale === "fr";
  const lines = input.missing.map((field) => {
    const label = FIELD_COPY[field][fr ? "fr" : "en"];
    const href = providerFixHref(input.locale, field);
    return { label, href };
  });
  const subject = fr ? `Il manque des infos sur ${input.centreName}` : `A few details are missing for ${input.centreName}`;
  const lead = fr
    ? `Des parents cherchent ${input.centreName} sur KidEase. Ajoutez seulement ce qui manque :`
    : `Parents look up ${input.centreName} on KidEase. Add only what is missing:`;
  const textBody = [lead, ...lines.map((line) => `- ${line.label}: ${line.href}`)].join("\n");
  const htmlBody = `<p>${esc(lead)}</p><ul>${lines
    .map((line) => `<li><a href="${esc(line.href)}">${esc(line.label)}</a></li>`)
    .join("")}</ul>`;
  const basis = fr
    ? "Vous recevez ce courriel parce que votre centre est revendiqué sur KidEase."
    : "You are getting this because your centre is claimed on KidEase.";
  const footer = caslMailFooter(input.locale, basis);
  return { subject, text: textBody + footer.text, html: htmlBody + footer.html };
}

export function parentProfileLetter(locale: AutomationLocale): { subject: string; text: string; html: string } {
  const href = parentChildHref(locale);
  if (locale === "fr") {
    const subject = "Ajoutez le profil de votre enfant";
    const text = `KidEase peut garder le prénom et la date de naissance de votre enfant pour les demandes de place. Ce n’est pas exigé pour chercher. Ajoutez-le ici : ${href}`;
    const html = `<p>KidEase peut garder le prénom et la date de naissance de votre enfant pour les demandes de place. Ce n’est pas exigé pour chercher.</p><p><a href="${esc(href)}">Ajouter le profil</a></p>`;
    const footer = caslMailFooter(locale, "Vous recevez ce courriel parce que vous avez un compte parent KidEase.");
    return { subject, text: text + footer.text, html: html + footer.html };
  }
  const subject = "Add your child’s profile";
  const text = `KidEase can keep your child’s first name and birthdate for spot requests. You do not need it to search. Add it here: ${href}`;
  const html = `<p>KidEase can keep your child’s first name and birthdate for spot requests. You do not need it to search.</p><p><a href="${esc(href)}">Add the profile</a></p>`;
  const footer = caslMailFooter(locale, "You are getting this because you have a KidEase parent account.");
  return { subject, text: text + footer.text, html: html + footer.html };
}

export function onboardingLetter(input: {
  locale: AutomationLocale;
  centreName: string;
  step: OnboardStep;
}): { subject: string; text: string; html: string } {
  const listings = providerFixHref(input.locale, "hours");
  const spots = providerFixHref(input.locale, "vacancy");
  const fr = input.locale === "fr";
  const copy = {
    d0: fr
      ? {
          subject: `${input.centreName} est sur KidEase`,
          text: `Votre revendication est enregistrée. Ouvrez le bureau du centre et vérifiez le nom, le téléphone et les heures. ${listings}`,
        }
      : {
          subject: `${input.centreName} is on KidEase`,
          text: `Your claim is saved. Open the centre desk and check the name, phone, and hours. ${listings}`,
        },
    d2: fr
      ? {
          subject: "Les parents comparent les heures et les frais",
          text: `Ajoutez les heures, les frais et une photo si ce n’est pas déjà fait. ${listings}`,
        }
      : {
          subject: "Parents compare hours and fees",
          text: `Add hours, fees, and a photo if they are not there yet. ${listings}`,
        },
    d7: fr
      ? {
          subject: "Dites si vous avez une place",
          text: `Si vous avez une place ouverte, mettez le nombre à jour. Sinon, laissez-le vide. ${spots}`,
        }
      : {
          subject: "Say if you have a spot",
          text: `If you have an open spot, update the number. If not, leave it empty. ${spots}`,
        },
  }[input.step];
  const footer = caslMailFooter(
    input.locale,
    fr
      ? "Vous recevez ce courriel parce que vous venez de revendiquer un centre sur KidEase."
      : "You are getting this because you just claimed a centre on KidEase.",
  );
  return {
    subject: copy.subject,
    text: copy.text + footer.text,
    html: `<p>${esc(copy.text)}</p>${footer.html}`,
  };
}

export function claimListingLetter(input: {
  locale: AutomationLocale;
  centreName: string;
  daycareId: string;
}): { subject: string; text: string; html: string } {
  const href = claimHref(input.locale, input.daycareId);
  if (input.locale === "fr") {
    const subject = `Revendiquez ${input.centreName} sur KidEase`;
    const text = `KidEase est un répertoire de garderies au Canada. Votre centre y figure déjà. Revendiquez la fiche gratuite pour répondre aux parents. ${href}`;
    const basis =
      "Vous recevez ce courriel parce que cette adresse est publiée comme contact d’affaires du centre. Consentement implicite entre entreprises (LCRN).";
    const footer = caslMailFooter("fr", basis);
    return { subject, text: text + footer.text, html: `<p>${esc(text)}</p>${footer.html}` };
  }
  const subject = `Claim ${input.centreName} on KidEase`;
  const text = `KidEase is a daycare directory in Canada. Your centre is already listed. Claim the free listing to answer parents. ${href}`;
  const basis =
    "You are getting this because this address is published as the centre’s business contact. Implied consent for a business message (CASL).";
  const footer = caslMailFooter("en", basis);
  return { subject, text: text + footer.text, html: `<p>${esc(text)}</p>${footer.html}` };
}

export function staleSpotLetter(input: {
  locale: AutomationLocale;
  centreName: string;
}): { subject: string; text: string; html: string } {
  const href = providerFixHref(input.locale, "vacancy");
  if (input.locale === "fr") {
    const subject = `Mettez à jour les places de ${input.centreName}`;
    const text = `Les places ouvertes n’ont pas été mises à jour depuis 21 jours. Les parents ne voient plus ce nombre comme actuel. Mettez-le à jour dans les 9 jours, sinon KidEase le masque. ${href}`;
    const footer = caslMailFooter("fr", "Vous recevez ce courriel parce que votre centre est revendiqué sur KidEase.");
    return { subject, text: text + footer.text, html: `<p>${esc(text)}</p>${footer.html}` };
  }
  const subject = `Update open spots at ${input.centreName}`;
  const text = `Open spots have not been updated for 21 days. Parents no longer treat that number as current. Update it in the next 9 days, or KidEase will hide it. ${href}`;
  const footer = caslMailFooter("en", "You are getting this because your centre is claimed on KidEase.");
  return { subject, text: text + footer.text, html: `<p>${esc(text)}</p>${footer.html}` };
}

export function invoiceLetter(input: {
  locale: AutomationLocale;
  centreName: string;
  number: string;
  stage: InvoiceReminderStage | DunningStage;
  kind: "remind" | "dunning";
}): { subject: string; text: string; html: string } {
  const href = payHref(input.locale);
  const fr = input.locale === "fr";
  const subject = fr
    ? input.kind === "dunning"
      ? `Paiement échoué pour la facture ${input.number}`
      : input.stage === "before_3"
        ? `Facture ${input.number} due dans 3 jours`
        : input.stage === "due"
          ? `Facture ${input.number} due aujourd’hui`
          : input.stage === "overdue_3"
            ? `Facture ${input.number} en retard de 3 jours`
            : `Facture ${input.number} en retard de 7 jours`
    : input.kind === "dunning"
      ? `Payment failed for bill ${input.number}`
      : input.stage === "before_3"
        ? `Bill ${input.number} is due in 3 days`
        : input.stage === "due"
          ? `Bill ${input.number} is due today`
          : input.stage === "overdue_3"
            ? `Bill ${input.number} is 3 days late`
            : `Bill ${input.number} is 7 days late`;
  const text = fr
    ? `Votre facture ${input.number} pour ${input.centreName} est sur KidEase. Payez-la dans votre compte. Nous arrêtons ces rappels quand elle est payée. ${href}`
    : `Your bill ${input.number} for ${input.centreName} is on KidEase. Pay it in your account. These reminders stop when it is paid. ${href}`;
  const basis = fr
    ? "Ce message concerne une facture déjà ouverte. KidEase · Winnipeg, Manitoba."
    : "This message is about a bill that is already open. KidEase · Winnipeg, Manitoba.";
  const footer = caslMailFooter(input.locale, basis);
  return { subject, text: text + footer.text, html: `<p>${esc(text)}</p>${footer.html}` };
}

export function tourFollowupLetter(input: {
  locale: AutomationLocale;
  centreName: string;
  slug: string;
}): { subject: string; text: string; html: string } {
  const href = reviewHref(input.locale, input.slug);
  if (input.locale === "fr") {
    const subject = `Comment s’est passée la visite à ${input.centreName}?`;
    const text = `Votre visite était hier. Si vous voulez une place, répondez au centre dans KidEase. ${href}`;
    const footer = caslMailFooter("fr", "Vous recevez ce courriel parce que vous avez réservé une visite sur KidEase.");
    return { subject, text: text + footer.text, html: `<p>${esc(text)}</p>${footer.html}` };
  }
  const subject = `How was the tour at ${input.centreName}?`;
  const text = `Your tour was yesterday. If you want a spot, reply to the centre in KidEase. ${href}`;
  const footer = caslMailFooter("en", "You are getting this because you booked a tour on KidEase.");
  return { subject, text: text + footer.text, html: `<p>${esc(text)}</p>${footer.html}` };
}

export function reviewRequestLetter(input: {
  locale: AutomationLocale;
  centreName: string;
  slug: string;
}): { subject: string; text: string; html: string } {
  const href = reviewHref(input.locale, input.slug);
  if (input.locale === "fr") {
    const subject = `Un avis sur ${input.centreName}?`;
    const text = `Vous êtes inscrit à ${input.centreName} depuis environ un mois. Un avis aide d’autres parents. Il n’est pas exigé. KidEase le lit avant de l’afficher. Tous les parents inscrits reçoivent la même invitation. ${href}`;
    const footer = caslMailFooter("fr", "Vous recevez ce courriel parce que vous êtes inscrit à ce centre sur KidEase.");
    return { subject, text: text + footer.text, html: `<p>${esc(text)}</p>${footer.html}` };
  }
  const subject = `A review of ${input.centreName}?`;
  const text = `You have been enrolled at ${input.centreName} for about a month. A review helps other parents. It is optional. KidEase reads it before it shows. Every enrolled parent gets the same invite. ${href}`;
  const footer = caslMailFooter("en", "You are getting this because you are enrolled at this centre on KidEase.");
  return { subject, text: text + footer.text, html: `<p>${esc(text)}</p>${footer.html}` };
}

export function opsDigestLetter(input: {
  errorsLastDay: number;
  failures: string[];
  critical: boolean;
}): { subject: string; text: string; html: string } {
  const subject = input.critical ? "KidEase alert: a job failed or errors spiked" : "KidEase daily automation digest";
  const failureLine = input.failures.length ? input.failures.join(", ") : "none";
  const text = [
    input.critical
      ? "This is an immediate alert. A cron failed in the last hour, or server errors crossed the line."
      : "Daily note for KidEase automations.",
    `Server errors in the window: ${input.errorsLastDay}.`,
    `Failed jobs: ${failureLine}.`,
    "Browser errors, when that flag is live, are in PostHog. This mail does not include parent names.",
    "Flags stay off until you set FEATURE_*_LIVE=1.",
  ].join("\n");
  return { subject, text, html: `<p>${esc(text).replace(/\n/g, "<br>")}</p>` };
}

export function cronHeartbeatEnv(job: string): string {
  return `BETTERSTACK_HEARTBEAT_${job.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

export const AUTOMATION_CRONS = [
  { job: "ops-alerts", path: "/api/automations?job=ops-alerts", vercel: "5 * * * *", inngest: "TZ=America/Winnipeg 5 * * * *" },
  { job: "invoice-reminders", path: "/api/automations?job=invoice-reminders", vercel: "30 13 * * *", inngest: "TZ=America/Winnipeg 30 8 * * *" },
  { job: "listing-reminders", path: "/api/automations?job=listing-reminders", vercel: "45 14 * * *", inngest: "TZ=America/Winnipeg 45 9 * * *" },
  { job: "stale-open-spots", path: "/api/automations?job=stale-open-spots", vercel: "15 15 * * *", inngest: "TZ=America/Winnipeg 15 10 * * *" },
  { job: "tour-followups", path: "/api/automations?job=tour-followups", vercel: "25 * * * *", inngest: "TZ=America/Winnipeg 25 * * * *" },
  { job: "neon-backup", path: "/api/automations?job=neon-backup", vercel: "30 8 * * 0", inngest: "TZ=America/Winnipeg 30 2 * * 0" },
] as const;

export type AutomationCronJob = (typeof AUTOMATION_CRONS)[number]["job"];

export function isAutomationCronJob(value: string): value is AutomationCronJob {
  return AUTOMATION_CRONS.some((row) => row.job === value);
}
