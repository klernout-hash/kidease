import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  dailyLogsEnabled,
  enrolmentEsignEnabled,
  familyVaultEnabled,
  pickupContactsEnabled,
  reviewRepliesEnabled,
  taxReceiptsEnabled,
  tourCalendarEnabled,
  unifiedInboxEnabled,
  voiceCallsEnabled,
} from "../src/lib/features.ts";
import { mealLogReady, napLogReady, mealLogLine, napLogLine } from "../src/lib/daily-care.ts";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";
import {
  enrolmentSignLinks,
  eventsFromTours,
  formatPickupContacts,
  isCanadaProvince,
  isOrphanInboxId,
  mergeUnifiedInbox,
  monthCells,
  parsePickupContacts,
  tourReminderPlan,
} from "../src/lib/desk-features.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const FLAGS = [
  ["FEATURE_REVIEW_REPLIES", reviewRepliesEnabled],
  ["FEATURE_ENROLMENT_ESIGN", enrolmentEsignEnabled],
  ["FEATURE_TAX_RECEIPTS", taxReceiptsEnabled],
  ["FEATURE_DAILY_LOGS", dailyLogsEnabled],
  ["FEATURE_TOUR_CALENDAR", tourCalendarEnabled],
  ["FEATURE_FAMILY_VAULT", familyVaultEnabled],
  ["FEATURE_UNIFIED_INBOX", unifiedInboxEnabled],
  ["FEATURE_VOICE", voiceCallsEnabled],
  ["FEATURE_PICKUP_CONTACTS", pickupContactsEnabled],
];

test("desk feature flags default off and stay off in the example env", () => {
  for (const [key, read] of FLAGS) {
    assert.equal(FLAG_DEFAULTS[key], false, key);
    assert.equal(read({}), false, key);
    assert.equal(read({ [key]: "0" }), false, key);
    assert.equal(read({ [key]: "1" }), true, key);
    assert.match(src(".env.example"), new RegExp(`^${key}=0$`, "m"));
    assert.doesNotMatch(src(".env.example"), new RegExp(`^${key}=1$`, "m"));
  }
  const hidden = visibleDeskNav("parent");
  assert.equal(hidden.some((item) => item.id === "documents"), false);
  assert.equal(hidden.some((item) => item.id === "tour-calendar"), false);
  const shown = visibleDeskNav("parent", { familyVault: true, tourCalendar: true });
  assert.equal(shown.some((item) => item.id === "documents"), true);
  assert.equal(shown.some((item) => item.id === "tour-calendar"), true);
});

test("meals, naps, pickup people, and provinces stay factual", () => {
  assert.equal(mealLogReady({ slot: "lunch", note: "Pasta" }), true);
  assert.equal(mealLogReady({ slot: "dinner", note: "Pasta" }), false);
  assert.equal(mealLogReady({ slot: "snack", note: "" }), false);
  assert.match(mealLogLine({ slot: "breakfast", note: "Oatmeal", locale: "fr" }), /Déjeuner/);
  assert.equal(napLogReady({ state: "asleep", minutes: 45 }), true);
  assert.equal(napLogReady({ state: "asleep", minutes: 241 }), false);
  assert.equal(napLogReady({ state: "asleep", minutes: 1.5 }), false);
  assert.match(napLogLine({ state: "skipped", minutes: 0, locale: "en" }), /No nap/);
  const stored = formatPickupContacts([
    { name: "Amina B.", phone: "204-555-0100", relationship: "Grandmother" },
    { name: "", phone: "1", relationship: "x" },
  ]);
  assert.deepEqual(parsePickupContacts(stored), [{ name: "Amina B.", phone: "204-555-0100", relationship: "Grandmother", note: "", restricted: false }]);
  const restricted = formatPickupContacts([{ name: "Sam", phone: "", relationship: "Uncle", note: "Custody order", restricted: true }]);
  assert.equal(parsePickupContacts(restricted)[0]?.restricted, true);
  assert.match(restricted, /Custody order/);
  assert.equal(isCanadaProvince("MB"), true);
  assert.equal(isCanadaProvince("QC"), true);
  assert.equal(isCanadaProvince("NY"), false);
});

test("tour reminder is in-app only and the sign path is a real route", () => {
  const cells = monthCells(2026, 11);
  assert.equal(cells.length % 7, 0);
  assert.equal(cells.filter((cell) => cell.inMonth).length, 30);
  const events = eventsFromTours([
    { id: "tr_1", daycareName: "Maple Room", status: "accepted", preferredTimes: [{ date: "2026-11-20", time: "10:00" }] },
    { id: "tr_2", daycareName: "Closed", status: "declined", preferredTimes: [{ date: "2026-11-21", time: "10:00" }] },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Maple Room");
  const plan = tourReminderPlan("2026-11-20T15:00:00.000Z", new Date("2026-11-01T12:00:00.000Z"));
  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.equal(plan.sendsMail, false);
    assert.equal(plan.sendsSms, false);
    assert.equal(plan.sendsPush, false);
  }
  assert.equal(tourReminderPlan("not-a-date").ok, false);
  assert.deepEqual(enrolmentSignLinks("ct_abc"), {
    signPath: "/sign/ct_abc",
    pdfPath: "/api/contracts/ct_abc/pdf",
  });
  assert.equal(enrolmentSignLinks("../secret"), null);
});

test("unified inbox keeps threads and adds requests that have no thread", () => {
  const merged = mergeUnifiedInbox(
    [
      {
        id: "cv_1",
        daycareId: "d1",
        daycareName: "Parent",
        daycareSlug: "maple",
        photo: "/photos/cottage.jpg",
        lastAt: "2026-11-02T12:00:00.000Z",
        lastBody: "Hello",
        preview: "Hello",
        status: null,
        tourStatus: null,
        phone: null,
        unread: false,
        parentName: "Parent",
        childAgeLabel: null,
        programLabel: null,
        tourDatetime: null,
        tourHold: null,
        listingVerified: false,
        screeningOnFile: false,
        stage: "new_inquiry",
        slaRemainingMs: null,
        slaOverdue: false,
        confirmedDot: false,
        staffNote: null,
        subsidyNote: null,
        scheduleNote: null,
        requestInfoCount: 0,
      },
    ],
    [
      {
        id: "ld_thread",
        conversationId: "cv_1",
        parentName: "Already here",
        message: "skip",
        kind: "info",
        status: "received",
        createdAt: "2026-11-02T13:00:00.000Z",
        daycareId: "d1",
        daycareName: "Maple",
      },
      {
        id: "ld_new",
        conversationId: null,
        parentName: "New Parent",
        message: "We need care in November",
        kind: "waitlist",
        status: "requested",
        createdAt: "2026-11-02T14:00:00.000Z",
        daycareId: "d1",
        daycareName: "Maple",
      },
    ],
    [
      {
        id: "tr_open",
        conversationId: null,
        parentName: "Tour Parent",
        daycareName: "Maple",
        daycareId: "d1",
        status: "pending",
        createdAt: "2026-11-02T15:00:00.000Z",
      },
    ],
  );
  assert.equal(merged.length, 3);
  assert.equal(merged[0].id, "tourreq:tr_open");
  assert.equal(isOrphanInboxId(merged[0].id), true);
  assert.equal(merged.some((row) => row.id === "lead:ld_thread"), false);
  assert.equal(merged.find((row) => row.id === "lead:ld_new")?.parentName, "New Parent");
  assert.equal(merged.find((row) => row.id === "lead:ld_new")?.phone, null);
});

test("flags wrap the live surfaces and do not send", () => {
  assert.match(src("src/routes/sign.$id.tsx"), /enrolmentEsignEnabled/);
  assert.match(src("src/routes/api/contracts.$id.pdf.ts"), /enrolmentEsignEnabled/);
  assert.match(src("src/lib/server/contracts.ts"), /Signing is not open yet/);
  assert.match(src("src/routes/api/docusign.webhook.ts"), /ignored: "off"/);
  assert.match(src("src/routes/api/docusign.poll.ts"), /skipped: "off"/);
  assert.match(src("src/components/tax-receipt-studio.tsx"), /data-ke="tax-receipts"/);
  assert.match(src("src/components/tax-receipt-studio.tsx"), /downloadTaxReceipt/);
  assert.doesNotMatch(src("src/components/tax-receipt-studio.tsx"), /amountPaid|Amount paid/);
  assert.match(src("src/lib/server/daily-care.ts"), /Daily logs are not open yet/);
  assert.match(src("src/lib/server/daily-care.ts"), /logDailyCare/);
  assert.match(src("src/lib/server/daily-care.ts"), /email: false/);
  assert.match(src("src/components/daily-care-desk.tsx"), /MealNapLog/);
  assert.match(src("src/lib/server/reviews.ts"), /Centre replies are not open yet/);
  assert.match(src("src/lib/server/reviews.ts"), /saveParentInAppNotice/);
  assert.doesNotMatch(src("src/lib/server/reviews.ts"), /notifyReviewReply/);
  assert.match(src("src/routes/api/family-documents.ts"), /familyVaultEnabled/);
  assert.match(src("src/routes/api/family-documents.$id.ts"), /familyVaultEnabled/);
  assert.match(src("src/routes/parent.tsx"), /tab === "documents"/);
  assert.match(src("src/routes/parent.tsx"), /tab === "tours"/);
  const reminders = src("src/lib/server/tour-reminders.ts");
  const due = reminders.slice(reminders.indexOf("export async function sendDueTourReminders"));
  assert.match(due, /if \(!tourCalendarEnabled\(\)\) return \{ due: 0, sent: 0 \}/);
  assert.doesNotMatch(due, /sendTransactionalMail/);
  assert.doesNotMatch(due, /notifyConsentedUserSms/);
  assert.match(src("src/lib/server/voice-call.ts"), /VOICE_OFF/);
  assert.match(src("src/routes/api/voice.connect.ts"), /voiceCallsEnabled/);
  assert.match(src("src/routes/api/voice.connect.ts"), /clientDialTwiml\(\[\]\)/);
  assert.match(src("src/routes/api/voice.incoming.ts"), /clientDialTwiml\(\[\]\)/);
  assert.match(src("src/components/child-profile-form.tsx"), /pickup-contacts/);
  assert.match(src("src/components/child-profile-form.tsx"), /allergies/);
  assert.match(src("src/components/centre-inbox.tsx"), /mergeUnifiedInbox/);
  const voice = src("src/lib/server/voice.ts");
  assert.doesNotMatch(voice, /FEATURE_VOICE/);
});
