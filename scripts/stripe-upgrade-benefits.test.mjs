import assert from "node:assert/strict";
import { test } from "node:test";
import { upgradeUnlockedBenefits, DAYCARE_UPGRADE_PLANS, PARENT_UPGRADE_PLANS } from "../src/lib/upgrade-plans.ts";

test("upgradeUnlockedBenefits returns all Pro and Plus tools", () => {
  const pro = DAYCARE_UPGRADE_PLANS.find((plan) => plan.id === "pro").benefits.map((line) => line.en);
  assert.equal(pro.length, 5);
  assert.deepEqual(upgradeUnlockedBenefits({ kind: "plan", item: "pro", locale: "en" }), pro);
  const plus = PARENT_UPGRADE_PLANS.find((plan) => plan.id === "plus").benefits.map((line) => line.en);
  assert.equal(plus.length, 5);
  assert.deepEqual(upgradeUnlockedBenefits({ kind: "plus", item: "plus", locale: "en" }), plus);
});
