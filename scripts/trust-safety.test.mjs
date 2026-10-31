import assert from "node:assert/strict";
import { test } from "node:test";
import { planSafeDuplicateGroups } from "../src/lib/duplicate-detect.ts";
import {
  identityUploadDecision,
  listingReviewSignals,
  maybeStartStripeIdentity,
  reportDueAt,
  reportSla,
  stripeIdentityGate,
  trustSafetyEnabled,
} from "../src/lib/trust-safety.ts";

test("trust and Stripe Identity default off", () => {
  assert.equal(trustSafetyEnabled({}), false);
  assert.equal(stripeIdentityGate({}).call, false);
  assert.equal(stripeIdentityGate({ FEATURE_STRIPE_IDENTITY: "1" }).reason, "missing_key");
  assert.equal(stripeIdentityGate({ FEATURE_STRIPE_IDENTITY: "1", STRIPE_IDENTITY_RESTRICTED_KEY: "rk_test_x" }).call, true);
});

test("identity uploads refuse child photos and stay off", () => {
  assert.equal(identityUploadDecision({ enabled: false, kind: "government_id", filename: "id.pdf", mime: "application/pdf", bytes: 10 }).ok, false);
  const child = identityUploadDecision({
    enabled: true,
    kind: "government_id",
    filename: "child-face.jpg",
    mime: "image/jpeg",
    bytes: 10,
  });
  assert.equal(child.ok, false);
  if (!child.ok) assert.equal(child.reason, "child");
  const ok = identityUploadDecision({
    enabled: true,
    kind: "business_registration",
    filename: "registration.pdf",
    mime: "application/pdf",
    bytes: 1200,
  });
  assert.equal(ok.ok, true);
});

test("open reports are due in 24 hours", () => {
  const created = new Date("2026-10-31T15:00:00.000Z");
  assert.equal(reportDueAt(created).toISOString(), "2026-11-01T15:00:00.000Z");
  assert.equal(reportSla({ status: "open", createdAt: created.toISOString(), now: new Date("2026-10-31T20:00:00.000Z") }), "open");
  assert.equal(reportSla({ status: "open", createdAt: created.toISOString(), now: new Date("2026-11-01T16:00:00.000Z") }), "over");
  assert.equal(reportSla({ status: "reviewed", createdAt: created.toISOString(), now: new Date("2026-11-02T00:00:00.000Z") }), "done");
});

test("duplicate signals queue a review and do not hide a protected row", () => {
  const rows = listingReviewSignals([
    { id: "keep", name: "Harbour Kids", licenseNumber: "MB-100200", postalCode: "R3C 0A1", createdAt: "2020-01-01T00:00:00.000Z" },
    { id: "copy", name: "Harbour Kids", licenseNumber: "MB100200", postalCode: "R3C 0A1", createdAt: "2024-05-01T00:00:00.000Z" },
    { id: "thin", name: "No Papers", licenseNumber: "", postalCode: "" },
    { id: "d_d85jtifbkh2t", slug: "kids-world-daycare-kh2t", name: "Kids World", licenseNumber: "MB-100200" },
  ]);
  assert.equal(rows.some((row) => row.id === "copy"), true);
  assert.equal(rows.some((row) => row.id === "d_d85jtifbkh2t"), false);
  assert.equal(rows.some((row) => row.id === "thin"), false);
  const plans = planSafeDuplicateGroups([
    { id: "keep", name: "Harbour Kids", licenseNumber: "MB-100200", createdAt: "2020-01-01T00:00:00.000Z" },
    { id: "copy", name: "Harbour Kids", licenseNumber: "MB100200", createdAt: "2024-05-01T00:00:00.000Z" },
  ]);
  assert.equal(plans.plans[0]?.retiredIds.includes("copy"), true);
});

test("Stripe Identity is not called when the flag is off", async () => {
  let called = 0;
  const result = await maybeStartStripeIdentity({}, async () => {
    called += 1;
    return new Response("no");
  });
  assert.equal(result.called, false);
  assert.equal(called, 0);
});
