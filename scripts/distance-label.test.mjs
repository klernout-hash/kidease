import assert from "node:assert/strict";
import { test } from "node:test";
import { parentDistanceLabel } from "../src/lib/distance-label.ts";

test("distance stays hidden without a location or a real kilometre", () => {
  assert.equal(parentDistanceLabel({ km: 4.2, away: "km away", show: false }), "");
  assert.equal(parentDistanceLabel({ km: Number.NaN, away: "km away", show: true }), "");
  assert.equal(parentDistanceLabel({ km: null, away: "km away", show: true }), "");
  assert.equal(parentDistanceLabel({ km: 0, away: "km away", show: true }), "");
  assert.equal(parentDistanceLabel({ km: 0.04, away: "km away", show: true }), "");
  assert.equal(parentDistanceLabel({ km: 1.24, away: "km away", show: true }), "1.2 km away");
  assert.equal(parentDistanceLabel({ km: 3, away: "km", show: true }), "3 km");
});
