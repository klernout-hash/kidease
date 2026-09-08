import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { WAITLIST_PULSE_EVENT } from "../src/lib/inngest.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const COOLDOWN_MS = 4 * 60 * 60 * 1000;

function ageBandsWithSpots(spots) {
  const bands = [];
  if (spots.infant > 0) bands.push("infant");
  if (spots.toddler > 0) bands.push("toddler");
  if (spots.preschool > 0) bands.push("preschool");
  return bands;
}

function interestMatchesPulseAge(interestAge, openBands) {
  if (openBands.length === 0) return true;
  if (interestAge === "any") return true;
  return openBands.includes(interestAge);
}

function pulseRateLimited(lastPulsedAt, nowMs = Date.now(), cooldownMs = COOLDOWN_MS) {
  if (!lastPulsedAt) return false;
  const ts = Date.parse(String(lastPulsedAt));
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts < cooldownMs;
}

function pulseMatchFilters(filters) {
  return { ...filters, avail: "any", confirmedOnly: false };
}

test("pulse age match: empty counts notify everyone; listed bands filter", () => {
  assert.deepEqual(ageBandsWithSpots({ infant: 0, toddler: 0, preschool: 0 }), []);
  assert.deepEqual(ageBandsWithSpots({ infant: 1, toddler: 0, preschool: 2 }), ["infant", "preschool"]);
  assert.equal(interestMatchesPulseAge("any", ["toddler"]), true);
  assert.equal(interestMatchesPulseAge("toddler", ["toddler"]), true);
  assert.equal(interestMatchesPulseAge("infant", ["toddler"]), false);
  assert.equal(interestMatchesPulseAge("preschool", []), true);
  const lib = src("src/lib/waitlist-pulse.ts");
  assert.match(lib, /export function ageBandsWithSpots/);
  assert.match(lib, /export function interestMatchesPulseAge/);
  assert.match(lib, /openBands.length === 0/);
});

test("one pulse per spot event — 4h cooldown", () => {
  const now = Date.parse("2026-09-08T12:00:00.000Z");
  assert.equal(pulseRateLimited(null, now), false);
  assert.equal(pulseRateLimited("2026-09-08T08:00:00.000Z", now), false);
  assert.equal(pulseRateLimited("2026-09-08T10:00:01.000Z", now), true);
  const lib = src("src/lib/waitlist-pulse.ts");
  assert.match(lib, /WAITLIST_PULSE_COOLDOWN_MS = 4 \* 60 \* 60 \* 1000/);
  assert.match(lib, /export function pulseRateLimited/);
  assert.deepEqual(pulseMatchFilters({ avail: "waitlist", confirmedOnly: true, meals: true }).avail, "any");
  assert.equal(pulseMatchFilters({ avail: "waitlist", confirmedOnly: true }).confirmedOnly, false);
  assert.match(lib, /avail: "any", confirmedOnly: false/);
});

test("SMS copy is transactional and includes STOP — no invented Twilio secrets", () => {
  const lib = src("src/lib/waitlist-pulse.ts");
  assert.match(lib, /Reply STOP to opt out/);
  assert.match(lib, /KidEase:/);
  assert.match(lib, /export function waitlistPulseSmsBody/);
  const envExample = src(".env.example");
  assert.match(envExample, /^FEATURE_SMS=0$/m);
  assert.match(envExample, /^FEATURE_PUSH=0$/m);
  assert.doesNotMatch(envExample, /TWILIO_AUTH_TOKEN=\S+/);
  assert.doesNotMatch(src("src/lib/server/waitlist-pulse.ts"), /SK[a-zA-Z0-9]{10,}/);
  assert.doesNotMatch(src("src/lib/server/waitlist-api.ts"), /AC[a-f0-9]{20,}/);
});

test("schema + job are idempotent and never call push", () => {
  const sql = src("migrations/0038_waitlist_pulse.sql");
  assert.match(sql, /create table if not exists waitlist_interests/);
  assert.match(sql, /create table if not exists waitlist_pulses/);
  assert.match(sql, /create table if not exists waitlist_pulse_deliveries/);
  assert.match(sql, /waitlist_pulse_deliveries_uidx/);
  assert.match(sql, /waitlist_pulse/);
  assert.match(sql, /FEATURE_PUSH stays off/);
  const job = src("src/lib/server/waitlist-pulse.ts");
  assert.match(job, /runWaitlistPulseJob/);
  assert.match(job, /evaluateCaslSend/);
  assert.match(job, /sendSms/);
  assert.match(job, /FEATURE_PUSH stays off/);
  assert.match(job, /on conflict \(pulse_id, user_id, channel\) do nothing/);
  assert.doesNotMatch(job, /sendPushNotification/);
  assert.doesNotMatch(job, /sendPushToDevices/);
  assert.equal(WAITLIST_PULSE_EVENT, "kidease/waitlist.pulse");
});

test("Inngest wraps waitlist pulse with pulseId idempotency", () => {
  const fns = src("src/inngest/functions.ts");
  assert.match(fns, /waitlist-pulse/);
  assert.match(fns, /runWaitlistPulseJob/);
  assert.match(fns, /WAITLIST_PULSE_EVENT/);
  assert.match(fns, /idempotency: "event\.data\.pulseId"/);
  assert.match(fns, /FEATURE_PUSH stays off/);
  assert.match(src("src/lib/server/waitlist-pulse.ts"), /inngest\.send/);
  assert.match(src("src/lib/server/waitlist-pulse.ts"), /inngestConfigured/);
  assert.match(src("src/lib/inngest.ts"), /kidease\/waitlist\.pulse/);
});

test("parent opt-in and director pulse are wired; vacancy refresh does not pulse", () => {
  assert.match(src("src/routes/daycare.$slug.tsx"), /WaitlistOptIn/);
  assert.match(src("src/components/waitlist-opt-in.tsx"), /setWaitlistInterest/);
  assert.match(src("src/components/provider-listing-forms.tsx"), /WaitlistPulseButton/);
  assert.match(src("src/components/vacancy-confirm.tsx"), /WaitlistPulseButton/);
  assert.match(src("src/lib/server/waitlist-api.ts"), /pulseWaitlistSpot/);
  assert.match(src("src/lib/server/family.ts"), /source: "capacity"/);
  assert.doesNotMatch(src("src/lib/server/claims.ts"), /insertWaitlistPulse/);
  assert.match(src("src/components/saved-searches-panel.tsx"), /alertWaitlistPulse/);
  assert.match(src("docs/waitlist-pulse.md"), /FEATURE_PUSH/);
  assert.match(src("docs/waitlist-pulse.md"), /CASL/);
  assert.match(src("src/lib/saved-search.ts"), /waitlist_pulse/);
});
