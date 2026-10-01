import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AI_FLAGS, aiFlagDefaultOn } from "../src/lib/ai/flags.ts";
import { aiFeatureVisible } from "../src/lib/ai/flag-gate.ts";
import {
  groundSpotAlert,
  parentFactFits,
  spotAlertModelUser,
  spotAlertQuiet,
  spotAlertSchema,
  spotAlertTemplate,
  SPOT_ALERT_SYSTEM,
  summarizeSpotFits,
} from "../src/lib/ai/spot-alerts.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const spots = { infant: 1, toddler: 0, preschool: 0 };
const facts = {
  name: "Harbour Kids",
  city: "Winnipeg",
  infant: 1,
  toddler: 0,
  preschool: 0,
  matched: 2,
  age: 2,
  start: 1,
  distance: 2,
};

test("spot-alerts stays off when PostHog is off or unreachable", () => {
  assert.equal(aiFlagDefaultOn(AI_FLAGS.spotAlerts, 0), false);
  assert.equal(aiFlagDefaultOn(AI_FLAGS.spotAlerts, 49), false);
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.spotAlerts, bucket: 0, snapshot: { reached: false, flags: {} } }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.spotAlerts,
      bucket: 0,
      snapshot: { reached: true, flags: { "spot-alerts": false } },
    }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.spotAlerts,
      bucket: 99,
      snapshot: { reached: true, flags: { "spot-alerts": true } },
    }),
    true,
  );
});

test("a far start date, the wrong age, or a far search does not fit", () => {
  const now = new Date("2026-10-01T15:00:00.000Z");
  const soon = parentFactFits(
    { userId: "p1", ageBand: "infant", startDate: "2026-10-20", distanceKm: null, radiusKm: 25 },
    spots,
    now,
  );
  assert.equal(soon.fit, true);
  const later = parentFactFits(
    { userId: "p2", ageBand: "infant", startDate: "2027-06-01", distanceKm: null, radiusKm: 25 },
    spots,
    now,
  );
  assert.equal(later.fit, false);
  const wrongAge = parentFactFits(
    { userId: "p3", ageBand: "preschool", startDate: null, distanceKm: null, radiusKm: 25 },
    spots,
    now,
  );
  assert.equal(wrongAge.age, false);
  const far = parentFactFits(
    { userId: "p4", ageBand: "infant", startDate: null, distanceKm: 40, radiusKm: 10 },
    spots,
    now,
  );
  assert.equal(far.distance, false);
  const none = summarizeSpotFits([], { infant: 0, toddler: 0, preschool: 0 }, now);
  assert.equal(none.matched, 0);
});

test("a failed model uses the real counts and does not invent a spot or a fee", () => {
  const fallback = groundSpotAlert(null, facts);
  assert.equal(fallback.source, "fallback");
  assert.equal(fallback.body, spotAlertTemplate(facts));
  assert.match(fallback.body, /1 infant/);
  assert.match(fallback.body, /2 families/);
  const invented = groundSpotAlert({ body: "Harbour Kids posted 9 infant spots for $10 a day." }, facts);
  assert.equal(invented.source, "fallback");
  assert.doesNotMatch(invented.body, /\$10/);
  assert.doesNotMatch(invented.body, /\b9\b/);
  const kept = groundSpotAlert({ body: "Harbour Kids in Winnipeg has 1 infant spot. 2 families fit." }, facts);
  assert.equal(kept.source, "model");
  assert.equal(spotAlertSchema.safeParse({ body: kept.body, fee: "10" }).success, false);
  assert.match(SPOT_ALERT_SYSTEM, /Do not add a fee/);
  assert.doesNotMatch(spotAlertModelUser(facts), /@/);
});

test("nothing goes out after 9 PM Winnipeg", () => {
  assert.equal(spotAlertQuiet(new Date("2026-10-01T02:30:00.000Z")), true);
  assert.equal(spotAlertQuiet(new Date("2026-10-01T15:00:00.000Z")), false);
});

test("the pulse button drafts first and the server does not auto-send", () => {
  const button = read("src/components/waitlist-pulse-button.tsx");
  const server = read("src/lib/server/spot-alerts.ts");
  const gate = read("src/lib/ai/flag-gate.ts");
  assert.match(button, /useAiFeatureFlag\(AI_FLAGS\.spotAlerts\)/);
  assert.match(button, /prepareSpotAlert/);
  assert.match(button, /sendSpotAlert/);
  assert.match(button, /spot_alert_fallback/);
  assert.match(server, /feature: "spot-alerts"/);
  assert.match(server, /spotAlertQuiet/);
  assert.match(server, /evaluateCaslSend/);
  assert.match(server, /email_enabled/);
  assert.doesNotMatch(server, /enqueueWaitlistPulse/);
  assert.match(gate, /AI_FLAGS\.spotAlerts/);
  assert.doesNotMatch(spotAlertModelUser(facts), /child/i);
});
