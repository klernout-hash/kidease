import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { productEventsEnabled } from "../src/lib/features.ts";
import {
  PRODUCT_EVENTS,
  countBucket,
  productEventsClientEnabled,
  sanitizeProductProperties,
} from "../src/lib/product-events.ts";

test("product events default off and drop personal details", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_PRODUCT_EVENTS, false);
  assert.equal(productEventsEnabled({}), false);
  assert.equal(productEventsClientEnabled({}), false);
  assert.equal(productEventsClientEnabled({ VITE_FEATURE_PRODUCT_EVENTS: "1" }), true);
  assert.equal(sanitizeProductProperties("not_an_event", {}), null);
  const clean = sanitizeProductProperties("signup_completed", {
    method: "email",
    role: "parent",
    email: "parent@example.com",
    child_name: "Ava",
    province: "ON",
    note: "123 Main Street",
  });
  assert.deepEqual(clean, { method: "email", role: "parent", province: "ON" });
  assert.equal(countBucket(0), "0");
  assert.equal(countBucket(4), "1-5");
  assert.equal(countBucket(12), "6+");
  assert.equal(PRODUCT_EVENTS.length, 8);
  for (const name of [
    "signup_started",
    "signup_completed",
    "search_performed",
    "listing_viewed",
    "waitlist_joined",
    "enrolment_requested",
    "invoice_paid",
    "claim_started",
  ]) {
    assert.ok(sanitizeProductProperties(name, { source: "test" }));
  }
});
