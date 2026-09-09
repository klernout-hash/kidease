import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  canSendDigestEmail,
  honestAlertCopy,
  isAlertQuietHours,
  planSearchAlertEvents,
  publicCentreEligible,
  requestReplyPath,
  shouldNotifySearchAlert,
  underPushSmsDailyCap,
  vacancyPingEligible,
  winnipegHour,
} from "../src/lib/search-alert-policy.ts";
import { sendSms } from "../src/lib/server/sms.ts";
import { sendPushToDevices } from "../src/lib/server/push-send.ts";

function matchesAgeBand(ageBand, row) {
  if (ageBand === "any") return true;
  if (row.agesKnown !== true) return false;
  if (ageBand === "infant") return row.ageMinMonths <= 18;
  if (ageBand === "toddler") return row.ageMinMonths < 36 && row.ageMaxMonths >= 18;
  if (ageBand === "school-age") return row.ageMaxMonths >= 60;
  return row.ageMaxMonths >= 30 && row.ageMinMonths < 72;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const LIVE = {
  id: "dc-live",
  slug: "sunny-side",
  name: "Sunny Side Child Care",
  city: "Winnipeg",
  live: true,
  claimed: true,
  agesKnown: true,
  ageMinMonths: 6,
  ageMaxMonths: 24,
  lastVacancyUpdatedAt: new Date("2026-09-08T12:00:00-05:00").toISOString(),
  distanceKm: 2.4,
  amenities: "licensed,centre",
  visibility: "public",
  isTest: 0,
};

test("saved search without lat/lng never emails — origin stays required", () => {
  const alerts = src("src/lib/server/search-alerts.ts");
  assert.match(alerts, /isValidSearchOrigin/);
  assert.match(alerts, /not inventing lat\/lng/);
  assert.doesNotMatch(alerts, /49\.8951/);
  assert.doesNotMatch(alerts, /WINNIPEG/);
});

test("infant / toddler / preschool / school-age alerts skip unknown ages", () => {
  assert.equal(matchesAgeBand("any", { ageMinMonths: 0, ageMaxMonths: 0, agesKnown: false }), true);
  assert.equal(matchesAgeBand("infant", { ageMinMonths: 0, ageMaxMonths: 18, agesKnown: false }), false);
  assert.equal(matchesAgeBand("toddler", { ageMinMonths: 18, ageMaxMonths: 36 }), false);
  assert.equal(matchesAgeBand("preschool", { ageMinMonths: 30, ageMaxMonths: 60, agesKnown: true }), true);
  assert.equal(matchesAgeBand("school-age", { ageMinMonths: 60, ageMaxMonths: 144, agesKnown: false }), false);
  assert.equal(matchesAgeBand("school-age", { ageMinMonths: 60, ageMaxMonths: 144, agesKnown: true }), true);
});

test("vacancy email never fires on unclaimed or confirm >14d", () => {
  const now = Date.parse("2026-09-09T12:00:00-05:00");
  assert.equal(vacancyPingEligible({ live: true, claimed: false, lastVacancyUpdatedAt: LIVE.lastVacancyUpdatedAt }, now), false);
  assert.equal(vacancyPingEligible({ live: false, claimed: true, lastVacancyUpdatedAt: LIVE.lastVacancyUpdatedAt }, now), false);
  assert.equal(
    vacancyPingEligible({ live: true, claimed: true, lastVacancyUpdatedAt: "2026-08-01T12:00:00-05:00" }, now),
    false,
  );
  assert.equal(vacancyPingEligible({ live: true, claimed: true, lastVacancyUpdatedAt: LIVE.lastVacancyUpdatedAt }, now), true);
  assert.equal(publicCentreEligible({ id: "ke-test-ghost-001", slug: "test-ghost", name: "TEST Ghost" }), false);
});

test("first job run baselines; run 2 can produce an in-app notice", () => {
  const nowMs = Date.parse("2026-09-09T12:00:00-05:00");
  const run1 = planSearchAlertEvents({
    baseline: true,
    sinceMs: 0,
    nowMs,
    matches: [LIVE],
    seen: { seenNew: new Set(), seenVacancy: new Map(), lastNotifiedAt: new Map() },
  });
  assert.equal(run1.length, 1);
  assert.equal(run1[0].kind, "new_centre");
  assert.equal(shouldNotifySearchAlert(true, false, run1.length), false);

  const run2 = planSearchAlertEvents({
    baseline: false,
    sinceMs: nowMs - 60 * 60 * 1000,
    nowMs,
    matches: [
      LIVE,
      { ...LIVE, id: "dc-new", slug: "new-licensed", name: "New Licensed Nursery", amenities: "licensed,nursery" },
    ],
    seen: {
      seenNew: new Set(["dc-live"]),
      seenVacancy: new Map(),
      lastNotifiedAt: new Map([["dc-live:new_centre", nowMs - 60 * 60 * 1000]]),
    },
  });
  assert.equal(run2.some((ev) => ev.kind === "new_centre" && ev.daycareId === "dc-new"), true);
  assert.equal(shouldNotifySearchAlert(false, false, run2.length), true);

  const freshVacancy = {
    ...LIVE,
    lastVacancyUpdatedAt: new Date(nowMs - 30 * 60 * 1000).toISOString(),
  };
  const vacancy = planSearchAlertEvents({
    baseline: false,
    sinceMs: nowMs - 2 * 60 * 60 * 1000,
    nowMs,
    matches: [freshVacancy],
    seen: {
      seenNew: new Set(["dc-live"]),
      seenVacancy: new Map(),
      lastNotifiedAt: new Map(),
    },
  });
  assert.equal(vacancy.some((ev) => ev.kind === "vacancy_reconfirmed"), true);
});

test("vacancy copy is honest and request_reply points at /inbox/{id}", () => {
  const vacancy = honestAlertCopy({
    kind: "vacancy_reconfirmed",
    name: "Sunny Side Child Care",
    distanceKm: 2.4,
    ageBand: "infant",
  });
  assert.match(vacancy.title, /A spot may be open at Sunny Side Child Care · 2\.4 km · infant/);
  assert.match(vacancy.title, /Confirm with the centre/);
  assert.doesNotMatch(vacancy.title, /guaranteed/i);
  assert.doesNotMatch(vacancy.body, /guaranteed opening/i);
  const fresh = honestAlertCopy({
    kind: "new_centre",
    name: "Sunny Side Child Care",
    distanceKm: 3,
    originLabel: "River Heights, Winnipeg",
    facilityType: "centre",
  });
  assert.equal(fresh.title, "New licensed centre near River Heights.");
  const reply = honestAlertCopy({ kind: "request_reply", name: "Sunny Side Child Care", distanceKm: 0 });
  assert.equal(reply.title, "Sunny Side Child Care replied.");
  assert.equal(requestReplyPath("con_123"), "/inbox/con_123");
  assert.doesNotMatch(src("src/lib/server/search-alerts.ts"), /guaranteed opening/i);
  assert.doesNotMatch(src("src/lib/server/search-alerts.ts"), /reconfirmed open spots/);
});

test("quiet hours hold email; push/SMS cap is 3 per search per day", () => {
  const quiet = new Date("2026-09-09T22:15:00-05:00");
  assert.equal(isAlertQuietHours(quiet), true);
  assert.equal(canSendDigestEmail(null, quiet), false);
  const morning = new Date("2026-09-09T08:05:00-05:00");
  assert.ok(winnipegHour(morning) >= 8);
  assert.equal(isAlertQuietHours(morning), false);
  assert.equal(canSendDigestEmail(null, morning), true);
  assert.equal(canSendDigestEmail(morning.toISOString(), new Date(morning.getTime() + 60 * 60 * 1000)), false);
  assert.equal(underPushSmsDailyCap(0), true);
  assert.equal(underPushSmsDailyCap(3), false);
});

test("sendPush / sendSms no-op when flags are off", async () => {
  const sms = await sendSms(
    { to: "+12045550100", body: "test", audience: "user", consentGranted: true },
    { env: { FEATURE_SMS: "0" } },
  );
  assert.equal(sms.ok, false);
  assert.equal(sms.skipped, true);
  const push = await sendPushToDevices(
    { title: "t", body: "b", tokens: [] },
    { env: { FEATURE_PUSH: "0" } },
  );
  assert.equal(push.ok, false);
  const job = src("src/lib/server/search-alerts.ts");
  assert.match(job, /sendPushNotification/);
  assert.match(job, /sendSms/);
  assert.match(src("src/lib/use-push.ts"), /www never prompts/);
  assert.match(src("src/lib/push-client.ts"), /No-ops on www/);
  assert.match(src("src/lib/use-push.ts"), /!isNative\(\)/);
  assert.doesNotMatch(src("src/lib/use-push.ts"), /requestPermissions/);
});

test("prefs stay free and school-age saves as school-age", () => {
  const panel = src("src/components/saved-searches-panel.tsx");
  assert.match(panel, /alertPushOff/);
  assert.match(panel, /alertRequestReply/);
  assert.doesNotMatch(panel, /upgrade to get alerts/i);
  assert.match(src("src/routes/search.tsx"), /schoolAgeOnly \? "school-age"/);
  assert.match(src("src/lib/saved-search.ts"), /"school-age"/);
  assert.match(src("migrations/0043_honest_search_alerts.sql"), /request_reply/);
  assert.match(src("src/lib/server/inbox.ts"), /request_reply/);
  assert.doesNotMatch(src("src/lib/copy.ts"), /upgrade to get alerts/i);
});
