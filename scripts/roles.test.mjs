import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listingStatusFromClaim,
  listingStatusLabel,
  isWaitingClaim,
} from "../src/lib/listing-status.ts";
import { desksFor, landingPath, nextStoredRole, parseAppRole, primaryDesk } from "../src/lib/desks.ts";
import { stripeChargesLive, INTERNAL_LEDGER_LABEL } from "../src/lib/stripe-live.ts";
import { parseSentryDsn } from "../src/lib/sentry-shared.ts";

test("listing status words are Waiting / Live / Declined only", () => {
  assert.equal(listingStatusLabel("pending"), "Waiting");
  assert.equal(listingStatusLabel("waiting"), "Waiting");
  assert.equal(listingStatusLabel("verified"), "Waiting");
  assert.equal(listingStatusLabel("submitted"), "Waiting");
  assert.equal(listingStatusLabel("approved"), "Live");
  assert.equal(listingStatusLabel("live"), "Live");
  assert.equal(listingStatusLabel("declined"), "Declined");
  assert.equal(listingStatusLabel("rejected"), "Declined");
  assert.equal(listingStatusLabel(null, { live: true }), "Live");
  assert.equal(listingStatusFromClaim("pending"), "waiting");
  assert.equal(isWaitingClaim("pending"), true);
  assert.equal(isWaitingClaim("approved"), false);
});

test("admin role unlocks all three desks; provider also gets parent", () => {
  assert.deepEqual(desksFor({ role: "admin" }), ["admin", "provider", "parent"]);
  assert.deepEqual(desksFor({ role: "provider" }), ["provider", "parent"]);
  assert.deepEqual(desksFor({ role: "parent" }), ["parent"]);
  assert.deepEqual(desksFor({ role: "parent", ownsCentre: true }), ["provider", "parent"]);
  assert.equal(primaryDesk(["parent", "provider"]), "provider");
  assert.equal(landingPath(["admin", "provider", "parent"]), "/admin");
  assert.equal(landingPath(["provider", "parent"]), "/provider");
  assert.equal(landingPath(["parent"]), "/parent");
});

test("setRole never demotes an admin", () => {
  assert.equal(nextStoredRole("admin", "provider"), "admin");
  assert.equal(nextStoredRole("admin", "parent"), "admin");
  assert.equal(nextStoredRole("parent", "provider"), "provider");
  assert.equal(parseAppRole("ADMIN"), "admin");
});

test("only sk_live_ keys count as Stripe live charges", () => {
  assert.equal(stripeChargesLive(""), false);
  assert.equal(stripeChargesLive("sk_test_abc"), false);
  assert.equal(stripeChargesLive("sk_live_abc"), true);
  assert.equal(INTERNAL_LEDGER_LABEL, "Internal ledger (not charged)");
});

test("Sentry DSN parse is optional and never throws", () => {
  assert.equal(parseSentryDsn("not-a-dsn"), null);
  const parsed = parseSentryDsn("https://abc123@o0.ingest.sentry.io/456");
  assert.equal(parsed?.key, "abc123");
  assert.match(parsed?.store ?? "", /\/api\/456\/store\/$/);
});
