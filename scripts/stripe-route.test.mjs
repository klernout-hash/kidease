import assert from "node:assert/strict";
import test from "node:test";
import {
  centreUsesTestStripe,
  payerUsesTestStripe,
  paymentStripeMode,
  stripeCredentialsForMode,
} from "../src/lib/stripe-route.ts";

const env = {
  STRIPE_SECRET_KEY: "sk_live_real",
  STRIPE_PUBLISHABLE_KEY: "pk_live_real",
  STRIPE_SECRET_KEY_TEST: "sk_test_qa",
  STRIPE_PUBLISHABLE_KEY_TEST: "pk_test_qa",
};

test("a real parent at a public centre uses the live keys", () => {
  assert.equal(payerUsesTestStripe({ email: "parent@example.com", isTest: 0 }), false);
  assert.equal(centreUsesTestStripe({ visibility: "public", isTest: 0, slug: "elm-street-daycare" }), false);
  const mode = paymentStripeMode({ payerQa: false, centreQa: false });
  assert.equal(mode, "live");
  const keys = stripeCredentialsForMode(mode, env);
  assert.equal(keys.ok, true);
  if (keys.ok) {
    assert.equal(keys.secret, "sk_live_real");
    assert.equal(keys.publishable, "pk_live_real");
  }
});

test("a QA account uses test keys even at a real centre", () => {
  assert.equal(payerUsesTestStripe({ email: "klernout45@gmail.com" }), true);
  assert.equal(payerUsesTestStripe({ email: "reviewer-parent@kidease.ca" }), true);
  assert.equal(payerUsesTestStripe({ email: "kyle+qa-parent2@kidease.ca" }), true);
  assert.equal(payerUsesTestStripe({ email: "kyle@kidease.ca", isTest: 0 }), false);
  assert.equal(payerUsesTestStripe({ email: "parent@example.com", isTest: 1 }), true);
  const mode = paymentStripeMode({ payerQa: true, centreQa: false });
  assert.equal(mode, "test");
  const keys = stripeCredentialsForMode(mode, env);
  assert.equal(keys.ok, true);
  if (keys.ok) {
    assert.equal(keys.secret, "sk_test_qa");
    assert.equal(keys.publishable, "pk_test_qa");
    assert.equal(keys.secret.startsWith("sk_live_"), false);
  }
});

test("a hidden QA centre uses test keys even for a real parent", () => {
  assert.equal(centreUsesTestStripe({ visibility: "admin_only", isTest: 1, slug: "qa-preview-hidden-centre" }), true);
  assert.equal(centreUsesTestStripe({ visibility: "public", isTest: 0, isDemo: 1, slug: "qa-reviewer-demo-centre" }), true);
  assert.equal(centreUsesTestStripe({ visibility: "public", slug: "ke-qa-test-daycare-001", id: "ke-qa-test-daycare-001" }), true);
  const mode = paymentStripeMode({
    payerQa: payerUsesTestStripe({ email: "parent@example.com" }),
    centreQa: centreUsesTestStripe({ visibility: "admin_only", isTest: 1 }),
  });
  assert.equal(mode, "test");
  const keys = stripeCredentialsForMode(mode, env);
  assert.equal(keys.ok, true);
  if (keys.ok) assert.equal(keys.secret.startsWith("sk_test_"), true);
});

test("QA routing refuses the live secret when the test keys are missing", () => {
  const keys = stripeCredentialsForMode("test", {
    STRIPE_SECRET_KEY: "sk_live_real",
    STRIPE_PUBLISHABLE_KEY: "pk_live_real",
  });
  assert.deepEqual(keys, { ok: false, mode: "test", reason: "missing_test_key" });
});
