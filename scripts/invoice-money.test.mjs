import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autopayDecision,
  autopayEnabled,
  feeEstimate,
  feeEstimatorEnabled,
  instalmentsEnabled,
  savedMethodView,
  savedPaymentsEnabled,
  splitInstalments,
} from "../src/lib/invoice-money.ts";

test("money tools default off and do not store a card number", () => {
  assert.equal(savedPaymentsEnabled({}), false);
  assert.equal(autopayEnabled({}), false);
  assert.equal(feeEstimatorEnabled({}), false);
  assert.equal(instalmentsEnabled({}), false);
  assert.deepEqual(
    savedMethodView({ enabled: true, brand: "visa", last4: "4242", paymentMethodId: "pm_123" }),
    { brand: "visa", last4: "4242", paymentMethodId: "pm_123" },
  );
  assert.equal(savedMethodView({ enabled: true, brand: "visa", last4: "4242", paymentMethodId: "4242424242424242" }).error, "card");
  assert.equal(savedMethodView({ enabled: false, brand: "visa", last4: "4242", paymentMethodId: "pm_123" }).error, "off");
});

test("autopay needs consent and does not replay a paid invoice", () => {
  assert.equal(autopayDecision({ enabled: false, consent: true, paymentMethodId: "pm_1", invoiceStatus: "open" }), "off");
  assert.equal(autopayDecision({ enabled: true, consent: false, paymentMethodId: "pm_1", invoiceStatus: "open" }), "no_consent");
  assert.equal(autopayDecision({ enabled: true, consent: true, paymentMethodId: "pm_1", invoiceStatus: "paid" }), "already_paid");
  assert.equal(autopayDecision({ enabled: true, consent: true, paymentMethodId: "pm_1", invoiceStatus: "open" }), "ready");
});

test("instalments are equal cents with no interest", () => {
  assert.deepEqual(splitInstalments(10000, 3), [3333, 3333, 3334]);
  assert.equal(splitInstalments(10000, 3)?.reduce((sum, part) => sum + part, 0), 10000);
  assert.equal(splitInstalments(100, 1), null);
  assert.equal(splitInstalments(3, 4), null);
});

test("the fee estimate needs a posted fee and says it is an estimate", () => {
  assert.equal(feeEstimate({ province: "MB", householdIncome: 70000, ageBand: "preschool", grossMonthly: 0 }), null);
  const row = feeEstimate({ province: "MB", householdIncome: 70000, ageBand: "preschool", grossMonthly: 800, participating: true });
  assert.equal(row?.kind, "estimate");
  assert.match(row?.disclaimerEn || "", /not a bill/);
  assert.doesNotMatch(JSON.stringify(row), /subscription/i);
});
