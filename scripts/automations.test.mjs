import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  AUTOMATION_CRONS,
  CLAIM_REMINDER_DAILY_CAP_DEFAULT,
  NEW_AUTOMATION_FLAGS,
  TURN_ON_FLAGS,
  automationMode,
  automationQuietNow,
  backupDue,
  backupObjectKey,
  claimDailyCapAllows,
  claimListingLetter,
  claimReminderPlan,
  centreMissingFields,
  dedupeDecision,
  dunningStage,
  emailBlocked,
  invoiceReminderStage,
  isPublicBusinessEmail,
  isWeeklyReminderDay,
  missingInfoLetter,
  onboardingStep,
  opsAlertPlan,
  parentChildProfileMissing,
  pgConnEnv,
  planInvoiceMail,
  restoreListLooksValid,
  reviewRequestDue,
  reviewRequestLetter,
  smsAutomationGate,
  staleSpotAction,
  tourFollowupDue,
  weeklyCapAllows,
} from "../src/lib/automations.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { checkinDispatchPlan } from "../src/lib/open-spots-checkin.ts";
import { isBotUserAgent, sanitizeExceptionMessage, shouldCaptureException } from "../src/lib/posthog-errors.ts";
import { spotOfferMailPlan } from "../src/lib/spot-offers.ts";
import {
  openSpotAlertsEnabled,
  openSpotsCheckinMailEnabled,
  openSpotsCheckinSmsEnabled,
  showPayCtas,
  subscriptionsEnabled,
} from "../src/lib/features.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("new automation flags default off and subscriptions stay off", () => {
  for (const key of NEW_AUTOMATION_FLAGS) {
    assert.equal(FLAG_DEFAULTS[key], false, key);
  }
  assert.equal(FLAG_DEFAULTS.SUBSCRIPTIONS_ENABLED, false);
  assert.equal(FLAG_DEFAULTS.SHOW_PAY_CTAS, false);
  assert.equal(subscriptionsEnabled({}), false);
  assert.equal(showPayCtas({ SUBSCRIPTIONS_ENABLED: "1", SHOW_PAY_CTAS: "1" }), true);
  assert.equal(showPayCtas({}), false);
  assert.doesNotMatch(src(".env.example"), /^SUBSCRIPTIONS_ENABLED=1$/m);
  assert.doesNotMatch(src(".env.example"), /^SHOW_PAY_CTAS=1$/m);
  assert.match(src("docs/automations.md"), /Do not set `SUBSCRIPTIONS_ENABLED`/);
  assert.doesNotMatch(src("src/lib/automations.ts"), /Apple IAP|BillingClient|StoreKit/);
});

test("flag on is dry-run until _LIVE", () => {
  assert.equal(automationMode(false, "1"), "off");
  assert.equal(automationMode(true, undefined), "dry_run");
  assert.equal(automationMode(true, "0"), "dry_run");
  assert.equal(automationMode(true, "1"), "live");
  assert.equal(automationMode(true, "1", true), "dry_run");
});

test("quiet hours are 9pm to 8am Winnipeg when the zone is missing", () => {
  const quiet = new Date("2026-11-01T02:30:00.000Z");
  const morning = new Date("2026-10-31T13:00:00.000Z");
  const seven = new Date("2026-10-31T12:00:00.000Z");
  const evening = new Date("2026-11-01T01:00:00.000Z");
  assert.equal(automationQuietNow(quiet, null), true);
  assert.equal(automationQuietNow(morning, null), false);
  assert.equal(automationQuietNow(seven, "America/Winnipeg"), true);
  assert.equal(automationQuietNow(evening, "America/Winnipeg"), false);
});

test("dedupe, weekly cap, and claim daily cap", () => {
  assert.deepEqual(dedupeDecision(false), { send: true, reason: "ok" });
  assert.deepEqual(dedupeDecision(true), { send: false, reason: "duplicate" });
  assert.equal(weeklyCapAllows(3), true);
  assert.equal(weeklyCapAllows(4), false);
  assert.equal(claimDailyCapAllows(24, CLAIM_REMINDER_DAILY_CAP_DEFAULT), true);
  assert.equal(claimDailyCapAllows(25, 25), false);
});

test("SMS needs the feature flag, stored consent, and a quiet-hour hold", () => {
  assert.equal(smsAutomationGate({ featureSms: false, userGranted: true, addressBlocked: false, quiet: false }).ok, false);
  assert.equal(
    smsAutomationGate({ featureSms: false, userGranted: true, addressBlocked: false, quiet: false }).reason,
    "sms_off",
  );
  assert.equal(
    smsAutomationGate({ featureSms: true, userGranted: false, addressBlocked: false, quiet: false }).reason,
    "no_consent",
  );
  assert.equal(
    smsAutomationGate({ featureSms: true, userGranted: true, addressBlocked: true, quiet: false }).reason,
    "blocked",
  );
  assert.equal(
    smsAutomationGate({ featureSms: true, userGranted: true, addressBlocked: false, quiet: true }).reason,
    "quiet",
  );
  assert.equal(smsAutomationGate({ featureSms: true, userGranted: true, addressBlocked: false, quiet: false }).ok, true);
  assert.equal(openSpotsCheckinSmsEnabled({}), false);
  assert.equal(checkinDispatchPlan(false, true).sms, true);
  assert.equal(checkinDispatchPlan(false, false).skipped, true);
});

test("unsubscribe stops commercial mail and a bounce stops a bill", () => {
  assert.equal(emailBlocked({ suppressed: true, reason: "unsubscribe", commercial: true }), true);
  assert.equal(emailBlocked({ suppressed: true, reason: "unsubscribe", commercial: false }), false);
  assert.equal(emailBlocked({ suppressed: true, reason: "bounce", commercial: false }), true);
  assert.equal(emailBlocked({ suppressed: false, reason: null, commercial: true }), false);
});

test("invoice reminders and dunning stop when paid and do not double-send", () => {
  assert.equal(invoiceReminderStage("2026-11-03", "2026-10-31"), "before_3");
  assert.equal(invoiceReminderStage("2026-10-31", "2026-10-31"), "due");
  assert.equal(invoiceReminderStage("2026-10-28", "2026-10-31"), "overdue_3");
  assert.equal(invoiceReminderStage("2026-10-24", "2026-10-31"), "overdue_7");
  assert.equal(dunningStage("2026-10-31", "2026-10-31"), "fail_0");
  assert.equal(dunningStage("2026-10-28", "2026-10-31"), "fail_3");
  const paid = planInvoiceMail({
    invoiceId: "in_1",
    status: "sent",
    dueAt: "2026-10-31",
    paidAt: "2026-10-30",
    failedAt: null,
    today: "2026-10-31",
    remindersOn: true,
    dunningOn: true,
  });
  assert.equal(paid.kind, "stop");
  const failed = planInvoiceMail({
    invoiceId: "in_2",
    status: "past_due",
    dueAt: "2026-10-31",
    paidAt: null,
    failedAt: "2026-10-31",
    today: "2026-10-31",
    remindersOn: true,
    dunningOn: true,
  });
  assert.equal(failed.kind, "dunning");
  assert.equal(failed.stage, "fail_0");
  const due = planInvoiceMail({
    invoiceId: "in_3",
    status: "sent",
    dueAt: "2026-10-31",
    paidAt: null,
    failedAt: null,
    today: "2026-10-31",
    remindersOn: true,
    dunningOn: true,
  });
  assert.equal(due.kind, "remind");
  assert.equal(due.dedupeKey, "inv:in_3:due");
});

test("missing info names the gap and stops when the profile is complete", () => {
  const missing = centreMissingFields({
    id: "d1",
    province: "ON",
    licenseNumber: "",
    photos: "",
    hours: "",
    phone: "",
    email: "",
    infant: null,
    toddler: null,
    preschool: null,
    partTime: null,
    agesConfirmed: 0,
    ageMinMonths: 0,
    ageMaxMonths: 0,
  });
  assert.deepEqual(missing, ["licence", "photos", "fees", "hours", "contact", "ages"]);
  const letter = missingInfoLetter({ locale: "fr", centreName: "Les Amis", missing: ["photos"] });
  assert.match(letter.text, /photo/i);
  assert.match(letter.text, /Se désabonner/);
  assert.match(letter.html, /focus=photo/);
  assert.equal(parentChildProfileMissing(0), true);
  assert.equal(parentChildProfileMissing(1), false);
});

test("onboarding is day 0, 2, and 7", () => {
  assert.equal(onboardingStep("2026-10-31T15:00:00.000Z", "2026-10-31"), "d0");
  assert.equal(onboardingStep("2026-10-31", "2026-11-02"), "d2");
  assert.equal(onboardingStep("2026-10-31", "2026-11-07"), "d7");
  assert.equal(onboardingStep("2026-10-31", "2026-11-20"), null);
});

test("claim reminders are B2B, capped, and unsubscribe", () => {
  assert.equal(isPublicBusinessEmail("owner@gmail.com"), true);
  assert.equal(isPublicBusinessEmail("kyle@kidease.ca"), false);
  assert.equal(isPublicBusinessEmail("not-an-email"), false);
  const blocked = claimReminderPlan({
    daycareId: "d1",
    claimed: false,
    email: "owner@gmail.com",
    suppressed: false,
    sentCount: 0,
    sentToday: 25,
    dailyCap: 25,
    nowMs: Date.parse("2026-10-31T15:00:00.000Z"),
  });
  assert.equal(blocked.reason, "daily_cap");
  const done = claimReminderPlan({
    daycareId: "d1",
    claimed: true,
    email: "owner@gmail.com",
    suppressed: false,
    sentCount: 0,
    sentToday: 0,
    dailyCap: 25,
    nowMs: Date.now(),
  });
  assert.equal(done.reason, "complete");
  const en = claimListingLetter({ locale: "en", centreName: "Elm", daycareId: "d1" });
  const fr = claimListingLetter({ locale: "fr", centreName: "Orme", daycareId: "d1" });
  assert.match(en.text, /Unsubscribe/);
  assert.match(en.text, /implied consent/i);
  assert.match(fr.text, /Se désabonner/);
  assert.match(fr.text, /implicite/i);
});

test("stale spots remind at day 21 and hide at day 30", () => {
  const now = Date.parse("2026-10-31T15:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;
  assert.equal(staleSpotAction({ spots: 2, updatedAt: new Date(now - 22 * day).toISOString(), nowMs: now }), "remind");
  assert.equal(staleSpotAction({ spots: 2, updatedAt: new Date(now - 31 * day).toISOString(), nowMs: now }), "hide");
  assert.equal(
    staleSpotAction({
      spots: 2,
      updatedAt: new Date(now - 40 * day).toISOString(),
      hiddenAt: new Date(now - day).toISOString(),
      nowMs: now,
    }),
    "none",
  );
  assert.equal(staleSpotAction({ spots: 0, updatedAt: null, nowMs: now }), "none");
});

test("tour follow-up is about 24 hours and the review invite is about 30 days", () => {
  const now = Date.parse("2026-10-31T15:00:00.000Z");
  const hour = 60 * 60 * 1000;
  assert.equal(tourFollowupDue(new Date(now - 25 * hour).toISOString(), now), true);
  assert.equal(tourFollowupDue(new Date(now - 2 * hour).toISOString(), now), false);
  assert.equal(tourFollowupDue(new Date(now - 80 * hour).toISOString(), now), false);
  const day = 24 * hour;
  assert.equal(reviewRequestDue(new Date(now - 31 * day).toISOString(), now), true);
  assert.equal(reviewRequestDue(new Date(now - 10 * day).toISOString(), now), false);
  assert.equal(reviewRequestDue(new Date(now - 40 * day).toISOString(), now), false);
  const letter = reviewRequestLetter({ locale: "en", centreName: "Elm", slug: "elm" });
  assert.match(letter.text, /optional/i);
  assert.match(letter.text, /Every enrolled parent/);
  assert.match(letter.text, /Unsubscribe/);
  assert.doesNotMatch(letter.text, /only if you loved|5 stars|gate/i);
});

test("ops digest, backup plan, and exception filters", () => {
  const morning = new Date("2026-10-31T13:30:00.000Z");
  assert.equal(opsAlertPlan({
    now: morning,
    errorsLastHour: 0,
    jobFailuresLastHour: 0,
    digestSentToday: false,
    criticalSentThisHour: false,
  }).digest, true);
  assert.equal(opsAlertPlan({
    now: morning,
    errorsLastHour: 25,
    jobFailuresLastHour: 0,
    digestSentToday: true,
    criticalSentThisHour: false,
  }).immediate, true);
  assert.equal(opsAlertPlan({
    now: morning,
    errorsLastHour: 25,
    jobFailuresLastHour: 1,
    digestSentToday: true,
    criticalSentThisHour: true,
  }).immediate, false);
  assert.equal(isWeeklyReminderDay(new Date("2026-10-26T18:00:00.000Z")), true);
  assert.equal(backupDue(new Date("2026-01-04T18:00:00.000Z"), false), true);
  assert.equal(backupDue(new Date("2026-10-31T18:00:00.000Z"), false), false);
  assert.equal(backupObjectKey("2026-10-31"), "backups/neon/2026-10-31.dump");
  const secret = "super-secret-pass";
  const bad = pgConnEnv(`not a url ${secret}`);
  assert.equal(bad.ok, false);
  assert.equal(JSON.stringify(bad).includes(secret), false);
  const ok = pgConnEnv(`postgresql://user:${secret}@ep.example.com/kidease?sslmode=require`);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.env.PGDATABASE, "kidease");
  assert.equal(restoreListLooksValid(";\nTABLE DATA public daycares\n"), true);
  assert.equal(restoreListLooksValid("nope"), false);
  assert.equal(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)"), true);
  assert.equal(isBotUserAgent("Mozilla/5.0 (iPhone)"), false);
  assert.equal(shouldCaptureException({ mode: "live", webdriver: true, userAgent: "Mozilla/5.0" }), false);
  assert.equal(shouldCaptureException({ mode: "live", webdriver: false, userAgent: "Googlebot" }), false);
  assert.equal(shouldCaptureException({ mode: "dry_run", webdriver: false, userAgent: "Mozilla/5.0" }), false);
  assert.equal(shouldCaptureException({ mode: "live", webdriver: false, userAgent: "Mozilla/5.0" }), true);
  assert.match(sanitizeExceptionMessage(new Error("boom postgres://user:secret@host/db email a@b.co")), /\[database\]/);
  assert.doesNotMatch(sanitizeExceptionMessage(new Error("postgres://user:secret@host/db")), /secret@host/);
});

test("existing open-spot and offer mail stay behind their flags", () => {
  assert.equal(openSpotsCheckinMailEnabled({}), false);
  assert.equal(openSpotAlertsEnabled({}), false);
  assert.equal(spotOfferMailPlan(false).sendEmail, false);
  assert.equal(spotOfferMailPlan(true).sendEmail, true);
  assert.equal(TURN_ON_FLAGS.length, 4);
  const offers = src("src/lib/server/spot-offers.ts");
  const checkin = src("src/lib/server/open-spots-checkin.ts");
  const alerts = src("src/lib/server/search-alerts.ts");
  assert.match(offers, /spotOfferMailPlan\(spotOfferMailEnabled\(\)\)/);
  assert.match(checkin, /openSpotsCheckinMailEnabled/);
  assert.match(checkin, /readConsent/);
  assert.match(alerts, /openSpotAlertsEnabled/);
});

test("crons, dedupe table, and help on the admin screen", () => {
  const vercel = src("vercel.json");
  for (const row of AUTOMATION_CRONS) {
    assert.match(vercel, new RegExp(row.path.replace("?", "\\?")));
    assert.match(vercel, new RegExp(row.vercel.replace(/[*]/g, "\\*")));
  }
  const fns = src("src/inngest/functions.ts");
  assert.match(fns, /invoice-reminders-daily/);
  assert.match(fns, /neon-backup-weekly/);
  assert.match(src("migrations/0108_automations.sql"), /primary key \(automation, dedupe_key, channel\)/);
  assert.match(src("src/lib/server/automation-mail.ts"), /on conflict \(automation, dedupe_key, channel\) do nothing/);
  assert.match(src("src/routes/api/automations.ts"), /cronAuthorized/);
  assert.match(src("src/components/admin-automations-page.tsx"), /Help|Aide/);
  assert.match(src("src/routes/admin-automations.tsx"), /beforeLoadAdminDesk/);
  assert.doesNotMatch(src("src/routes/api/automations.ts"), /SUBSCRIPTIONS_ENABLED\s*=\s*1/);
});
