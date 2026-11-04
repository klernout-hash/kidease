import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { zonedLocalToUtc } from "../src/lib/tour-calendar.ts";
import {
  approvalDecision,
  daycarePortfolioView,
  portfolioComplete,
  portfolioGaps,
  portfolioSharedWithDaycare,
  scrubPickupList,
} from "../src/lib/child-portfolio.ts";
import { portfolioCopy } from "../src/lib/child-portfolio-copy.ts";
import {
  anyGuardianBlocked,
  canSeeCustodyRecord,
  coparentMailPlan,
  decideEmailAccept,
  familyNotice,
  guardianCentreAccess,
  guardianNotifyIds,
  inviteCreatesPending,
} from "../src/lib/coparent-custody.ts";
import { custodyCopy } from "../src/lib/custody-copy.ts";
import {
  closedForChild,
  dueReminders,
  knownCareZone,
  reminderChannels,
  zonedDay,
} from "../src/lib/care-reminders.ts";
import { careReminderCopy } from "../src/lib/care-reminder-copy.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { careRemindersEnabled, childPortfolioGateEnabled, coparentEmailEnabled } from "../src/lib/features.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const complete = {
  name: "Amina",
  birthdate: "2022-05-04",
  allergies: "None",
  medicalNotes: "",
  emergencyName: "Sam Lee",
  emergencyPhone: "204-555-0101",
  pickupPeople: "Sam Lee",
  immunizationStatus: "record",
  immunizationNote: "",
  doctorName: "Dr. Singh",
  doctorPhone: "204-555-0199",
  homeAddress: "100 Main Street",
  province: "ON",
};

test("portfolio and co-parent and reminder flags stay off", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_CHILD_PORTFOLIO_GATE, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_COPARENT_EMAIL, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_CARE_REMINDERS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_PUSH, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_SMS, false);
  assert.equal(FLAG_DEFAULTS.SHOW_PAY_CTAS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_PROVIDER_SUBSCRIPTIONS, false);
  assert.equal(FLAG_DEFAULTS.SUBSCRIPTIONS_ENABLED, false);
  assert.equal(childPortfolioGateEnabled({}), false);
  assert.equal(coparentEmailEnabled({}), false);
  assert.equal(careRemindersEnabled({}), false);
  assert.match(src(".env.example"), /^FEATURE_CHILD_PORTFOLIO_GATE=0$/m);
  assert.match(src(".env.example"), /^FEATURE_COPARENT_EMAIL=0$/m);
  assert.match(src(".env.example"), /^FEATURE_CARE_REMINDERS=0$/m);
  assert.doesNotMatch(src("src/lib/server/care-reminders.ts"), /FEATURE_CALL_PUSH|sendSms/);
  assert.doesNotMatch(src("src/lib/server/coparent.ts"), /sendTransactionalMail|sendSms/);
});

test("a daycare cannot approve until the child file is complete", () => {
  assert.equal(approvalDecision({ enabled: false, nextStatus: "accepted", child: {} }).ok, true);
  const blocked = approvalDecision({ enabled: true, nextStatus: "accepted", child: { name: "Amina" }, now: new Date("2026-11-04") });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.ok(blocked.gaps.includes("birthdate"));
  assert.equal(portfolioComplete(complete, new Date("2026-11-04")), true);
  const sk = portfolioGaps({ ...complete, province: "SK", doctorName: "", doctorPhone: "", homeAddress: "" }, new Date("2026-11-04"));
  assert.deepEqual(sk, []);
  const on = portfolioGaps({ ...complete, province: "ON", homeAddress: "" }, new Date("2026-11-04"));
  assert.deepEqual(on, ["address"]);
  assert.equal(portfolioSharedWithDaycare("requested"), true);
  assert.equal(portfolioSharedWithDaycare("declined"), false);
  const view = daycarePortfolioView({ ...complete, province: "SK" });
  assert.equal(view.homeAddress, "");
  assert.equal(view.doctorName, "");
  assert.equal("likes" in view, false);
  assert.equal(scrubPickupList("Sam Lee\nRiley", ["Riley"]), "Sam Lee");
  assert.match(portfolioCopy("fr").actionTitle, /Action requise/);
  assert.match(portfolioCopy("en").incomplete, /Portfolio incomplete/);
});

test("co-parent invites stay pending until that person accepts", () => {
  assert.equal(inviteCreatesPending({ status: "pending", memberUserId: null }), true);
  assert.equal(inviteCreatesPending({ status: "active", memberUserId: "other" }), false);
  const link = {
    id: "cp_1",
    ownerUserId: "owner",
    memberUserId: null,
    access: "full",
    status: "pending",
    inviteToken: "a".repeat(24),
    inviteEmail: "other@example.com",
    expiresAt: "2026-11-11T00:00:00.000Z",
  };
  assert.equal(
    decideEmailAccept({
      actorId: "other",
      actorEmail: "other@example.com",
      link,
      actorHasOpenFamily: false,
      pairBlocked: false,
      now: new Date("2026-11-05T00:00:00.000Z"),
    }).ok,
    true,
  );
  assert.equal(
    decideEmailAccept({
      actorId: "other",
      actorEmail: "wrong@example.com",
      link,
      actorHasOpenFamily: false,
      pairBlocked: false,
      now: new Date("2026-11-05T00:00:00.000Z"),
    }).error,
    "email",
  );
  assert.equal(
    decideEmailAccept({
      actorId: "other",
      actorEmail: "other@example.com",
      link,
      actorHasOpenFamily: false,
      pairBlocked: false,
      now: new Date("2026-11-12T00:00:00.000Z"),
    }).error,
    "expired",
  );
  assert.equal(
    decideEmailAccept({
      actorId: "other",
      actorEmail: "other@example.com",
      link,
      actorHasOpenFamily: false,
      pairBlocked: true,
      now: new Date("2026-11-05T00:00:00.000Z"),
    }).error,
    "blocked",
  );
  assert.equal(coparentMailPlan({ enabled: true, env: { NODE_ENV: "test", VERCEL_ENV: "production" } }), "skip_test");
  assert.equal(coparentMailPlan({ enabled: true, env: { VERCEL_ENV: "preview" } }), "skip_preview");
  assert.equal(coparentMailPlan({ enabled: true, env: { NODE_ENV: "production", VERCEL_ENV: "production" } }), "send");
  assert.equal(coparentMailPlan({ enabled: false, env: { VERCEL_ENV: "production" } }), "skip_flag");
  assert.deepEqual(guardianCentreAccess({ verified: false, restriction: null }), {
    portfolio: false,
    pickup: false,
    messaging: true,
  });
  assert.equal(guardianCentreAccess({ verified: true, restriction: "restrict" }).pickup, false);
  assert.equal(guardianCentreAccess({ verified: true, restriction: "restrict" }).messaging, true);
  assert.equal(guardianCentreAccess({ verified: true, restriction: "block" }).messaging, false);
  assert.equal(guardianCentreAccess({ verified: true, restriction: null }).portfolio, true);
  assert.deepEqual(guardianNotifyIds("owner", "member"), ["owner", "member"]);
  assert.equal(canSeeCustodyRecord({ viewerIsAdmin: false, viewerDaycareIds: ["day-a"], recordDaycareId: "day-b" }), false);
  assert.equal(canSeeCustodyRecord({ viewerIsAdmin: true, viewerDaycareIds: [], recordDaycareId: "day-b" }), true);
  assert.equal(
    anyGuardianBlocked({
      guardianIds: ["member"],
      daycareId: "day-a",
      centreUserIds: ["staff"],
      blocks: [{ blockerUserId: "member", blockedUserId: null, daycareId: "day-a" }],
    }),
    true,
  );
  assert.match(familyNotice("fr", "linked").subject, /famille/);
  assert.match(custodyCopy("en").mustAccept, /until they accept/);
  assert.match(custodyCopy("fr").lead, /propre compte/);
  assert.match(src("migrations/0174_child_portfolio_coparent.sql"), /coparent_audit/);
  assert.match(src("migrations/down/0174_child_portfolio_coparent.sql"), /drop table if exists coparent_audit/);
  assert.doesNotMatch(src("migrations/0174_child_portfolio_coparent.sql"), /delete from children/i);
});

test("drop-off reminders follow the family clock and skip a closed day", () => {
  const winter = zonedLocalToUtc("2026-01-15", "08:00", "America/Toronto");
  const summer = zonedLocalToUtc("2026-07-15", "08:00", "America/Toronto");
  assert.equal(winter?.toISOString(), "2026-01-15T13:00:00.000Z");
  assert.equal(summer?.toISOString(), "2026-07-15T12:00:00.000Z");
  const reginaWinter = zonedLocalToUtc("2026-01-15", "08:00", "America/Regina");
  const reginaSummer = zonedLocalToUtc("2026-07-15", "08:00", "America/Regina");
  assert.equal(reginaWinter?.toISOString().slice(11, 16), reginaSummer?.toISOString().slice(11, 16));
  assert.equal(knownCareZone(""), null);
  assert.equal(knownCareZone("America/Regina"), "America/Regina");
  const reminder = {
    userId: "parent-a",
    childId: "child-1",
    masterOn: true,
    sameEveryDay: true,
    leadMinutes: 30,
    days: [{ weekday: -1, dropoff: "08:00", pickup: "16:00", dropoffOn: true, pickupOn: false }],
  };
  const due = dueReminders({
    now: new Date("2026-01-15T12:30:00.000Z"),
    zone: "America/Toronto",
    reminder,
    closed: false,
    sentKeys: [],
  });
  assert.equal(due.length, 1);
  assert.equal(due[0].kind, "dropoff");
  assert.equal(due[0].localTime, "08:00");
  const otherParent = dueReminders({
    now: new Date("2026-01-15T12:30:00.000Z"),
    zone: "America/Toronto",
    reminder: { ...reminder, userId: "parent-b", masterOn: false },
    closed: false,
    sentKeys: [],
  });
  assert.equal(otherParent.length, 0);
  assert.equal(
    dueReminders({
      now: new Date("2026-01-15T12:30:00.000Z"),
      zone: "America/Toronto",
      reminder,
      closed: true,
      sentKeys: [],
    }).length,
    0,
  );
  assert.equal(closedForChild({ enrolledDaycareIds: ["day-a"], closedDaycareIds: ["day-a"] }), true);
  assert.equal(closedForChild({ enrolledDaycareIds: ["day-a", "day-b"], closedDaycareIds: ["day-a"] }), false);
  assert.equal(closedForChild({ enrolledDaycareIds: [], closedDaycareIds: ["day-a"] }), false);
  assert.deepEqual(reminderChannels(false), { inApp: true, push: false, sms: false });
  assert.equal(reminderChannels(true).push, true);
  assert.equal(reminderChannels(true).sms, false);
  const day = zonedDay(new Date("2026-01-15T15:00:00.000Z"), "America/Toronto");
  assert.equal(day?.date, "2026-01-15");
  assert.equal(day?.weekday, 4);
  assert.match(careReminderCopy("fr").yours, /autre parent/);
  assert.match(careReminderCopy("en").noSms, /No text/);
  assert.match(src("migrations/0175_care_reminders.sql"), /care_reminders/);
  assert.match(src("migrations/down/0175_care_reminders.sql"), /drop table if exists care_reminders/);
  assert.match(src("src/lib/server/care-reminders.ts"), /sendPushNotification/);
  assert.doesNotMatch(src("src/lib/server/care-reminders.ts"), /sendSms|FEATURE_CALL_PUSH/);
});
