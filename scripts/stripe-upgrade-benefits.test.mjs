import assert from "node:assert/strict";
import { test } from "node:test";
import { DAYCARE_UPGRADE_PLANS, PARENT_UPGRADE_PLANS } from "../src/lib/upgrade-plans.ts";
import { FREE_COMPARE_MAX, PLUS_COMPARE_MAX, compareLimit } from "../src/lib/compare.ts";

test("Plus and Pro list five real tools on /plans", () => {
  const plus = PARENT_UPGRADE_PLANS.find((plan) => plan.id === "plus").benefits.map((line) => line.en);
  const pro = DAYCARE_UPGRADE_PLANS.find((plan) => plan.id === "pro").benefits.map((line) => line.en);
  assert.deepEqual(plus, [
    "Parent \u2194 centre video tour, when video is on",
    "Compare up to 10 centres side by side",
    "Tour checklist saved on each child",
    "Daily care notes on the parent desk",
    "Four child profiles on one account",
  ]);
  assert.deepEqual(pro, [
    "Unlimited messages and tours",
    "One featured city in search",
    "90 days of views and requests",
    "Lead pipeline on the desk",
    "Staff roster and screening",
  ]);
  assert.equal(FREE_COMPARE_MAX, 5);
  assert.equal(PLUS_COMPARE_MAX, 10);
  assert.equal(compareLimit(false), 5);
  assert.equal(compareLimit(true), 10);
});
