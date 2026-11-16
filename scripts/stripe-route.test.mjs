import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  centreUsesTestStripe,
  payerUsesTestStripe,
  paymentStripeMode,
  qaLiveChargeBlocked,
  stripeCredentialsForMode,
} from "../src/lib/stripe-route.ts";

const env = {
  STRIPE_SECRET_KEY: "sk_live_real",
  STRIPE_PUBLISHABLE_KEY: "pk_live_real",
  STRIPE_SECRET_KEY_TEST: "sk_test_qa",
  STRIPE_PUBLISHABLE_KEY_TEST: "pk_test_qa",
};

test("a real parent at a public centre uses the live keys only when the live switch is on", () => {
  assert.equal(payerUsesTestStripe({ email: "parent@example.com", isTest: 0 }), false);
  assert.equal(centreUsesTestStripe({ visibility: "public", isTest: 0, slug: "elm-street-daycare" }), false);
  const held = paymentStripeMode({ payerQa: false, centreQa: false, liveEnabled: false });
  assert.equal(held, "live");
  assert.equal(paymentStripeMode({ payerQa: true, centreQa: false, liveEnabled: false }), "test");
  assert.equal(paymentStripeMode({ payerQa: false, centreQa: true, liveEnabled: false }), "test");
  const qaKeys = stripeCredentialsForMode("test", env);
  assert.equal(qaKeys.ok, true);
  if (qaKeys.ok) assert.equal(qaKeys.secret, "sk_test_qa");
  const mode = paymentStripeMode({ payerQa: false, centreQa: false, liveEnabled: true });
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
  const mode = paymentStripeMode({ payerQa: true, centreQa: false, liveEnabled: true });
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
    liveEnabled: true,
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

test("centre charges pass the process environment into the helper", () => {
  const source = readFileSync(new URL("../src/lib/server/connect-payments.ts", import.meta.url), "utf8");
  assert.match(source, /stripeCredentialsForMode\(qa \? "test" : mode, process\.env\)/);
});

test("with no env argument the helper reads the process environment", () => {
  const names = ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_SECRET_KEY_TEST", "STRIPE_PUBLISHABLE_KEY_TEST"];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  process.env.STRIPE_SECRET_KEY = "sk_live_unused";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_live_unused";
  process.env.STRIPE_SECRET_KEY_TEST = "sk_test_from_env";
  process.env.STRIPE_PUBLISHABLE_KEY_TEST = "pk_test_from_env";
  try {
    const keys = stripeCredentialsForMode("test");
    assert.equal(keys.ok, true);
    if (keys.ok) {
      assert.equal(keys.secret, "sk_test_from_env");
      assert.equal(keys.publishable, "pk_test_from_env");
    }
  } finally {
    for (const name of names) {
      const value = previous.get(name);
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("an is_test centre or QA account can never be handed a live secret", () => {
  assert.equal(qaLiveChargeBlocked("sk_live_real", true), true);
  assert.equal(qaLiveChargeBlocked("sk_test_qa", true), false);
  assert.equal(qaLiveChargeBlocked("sk_live_real", false), false);
  const billing = readFileSync(new URL("../src/lib/server/billing.ts", import.meta.url), "utf8");
  const checkout = readFileSync(new URL("../src/lib/server/stripe-checkout.ts", import.meta.url), "utf8");
  assert.match(billing, /if \(qa && !qaSecret\) throw new Error\("missing_test_key"\)/);
  assert.match(billing, /secret: qaSecret/);
  assert.match(checkout, /QA charges cannot use live Stripe/);
});
