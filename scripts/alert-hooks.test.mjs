import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  alertWeekKey,
  claimNeedsDocument,
  documentExpiryDue,
  licenceStatusWorthTelling,
  listingWatchChanged,
  stillLookingDue,
} from "../src/lib/alert-rules.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const facts = {
  infantMonthly: 800,
  toddlerMonthly: 900,
  preschoolMonthly: 1000,
  partTimeMonthly: 0,
  ageMinMonths: 12,
  ageMaxMonths: 48,
  hours: "7:30 to 17:30",
  scheduleKey: "full",
};

test("saved listing alerts fire for price, ages, hours, and schedule", () => {
  assert.equal(listingWatchChanged(facts, facts), false);
  assert.equal(listingWatchChanged(facts, { ...facts, infantMonthly: 850 }), true);
  assert.equal(listingWatchChanged(facts, { ...facts, ageMinMonths: 18 }), true);
  assert.equal(listingWatchChanged(facts, { ...facts, hours: "8:00 to 17:00" }), true);
  assert.equal(listingWatchChanged(facts, { ...facts, scheduleKey: "part" }), true);
});

test("document expiry covers the next 30 days and a short grace period", () => {
  const now = new Date("2026-10-05T15:00:00Z");
  assert.equal(documentExpiryDue("2026-10-20", now), true);
  assert.equal(documentExpiryDue("2026-10-01", now), true);
  assert.equal(documentExpiryDue("2026-09-01", now), false);
  assert.equal(documentExpiryDue("2027-01-01", now), false);
  assert.equal(documentExpiryDue("soon", now), false);
});

test("still looking stops after a no, a recent yes, or no saved watch", () => {
  const now = new Date("2026-10-05T15:00:00Z");
  const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  assert.equal(stillLookingDue({ hasWatch: true, looking: null, confirmedAt: null, nudgedAt: null, now }), true);
  assert.equal(stillLookingDue({ hasWatch: true, looking: false, confirmedAt: null, nudgedAt: null, now }), false);
  assert.equal(stillLookingDue({ hasWatch: false, looking: true, confirmedAt: null, nudgedAt: null, now }), false);
  assert.equal(stillLookingDue({ hasWatch: true, looking: true, confirmedAt: recent, nudgedAt: null, now }), false);
  assert.equal(stillLookingDue({ hasWatch: true, looking: true, confirmedAt: null, nudgedAt: recent, now }), false);
});

test("claim needs a document and licence changes are worth telling", () => {
  assert.equal(claimNeedsDocument("needs_docs"), true);
  assert.equal(claimNeedsDocument("approve"), false);
  assert.equal(licenceStatusWorthTelling("unverified", "matched"), true);
  assert.equal(licenceStatusWorthTelling("matched", "matched"), false);
  const now = new Date("2026-10-05T15:00:00Z");
  assert.match(alertWeekKey(now), /^\d+$/);
  assert.equal(alertWeekKey(now), alertWeekKey(new Date(now.getTime())));
});

test("new alert copy stays plain", () => {
  const text = [
    readFileSync(join(root, "src/lib/alert-rules.ts"), "utf8"),
    readFileSync(join(root, "src/lib/alert-push.ts"), "utf8"),
    readFileSync(join(root, "src/components/listing-owner-reply.tsx"), "utf8"),
  ].join("\n");
  assert.doesNotMatch(text, /—|–|police check|free forever/i);
});
