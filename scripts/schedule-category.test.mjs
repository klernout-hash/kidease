import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalExploreCategory, scheduleFromStoredFees } from "../src/lib/category-keys.ts";

test("French and English before-and-after names are the same filter", () => {
  assert.equal(canonicalExploreCategory("Avant et après"), "before-after");
  assert.equal(canonicalExploreCategory("before-after"), "before-after");
  assert.equal(canonicalExploreCategory("home"), undefined);
});

test("full-time and part-time follow stored fees when no schedule is saved", () => {
  assert.equal(scheduleFromStoredFees({ stored: [], schedule: "full", infantMonthly: 900 }), true);
  assert.equal(scheduleFromStoredFees({ stored: [], schedule: "part", partTimeMonthly: 0, infantMonthly: 900 }), false);
  assert.equal(scheduleFromStoredFees({ stored: [], schedule: "part", partTimeMonthly: 400 }), true);
  assert.equal(scheduleFromStoredFees({ stored: ["part"], schedule: "full", infantMonthly: 900 }), false);
});
