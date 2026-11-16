import { test } from "node:test";
import assert from "node:assert/strict";
import { publicMonthlyFee, looksLikeProvinceCap } from "../src/lib/listing-fee.ts";

test("Ontario $22/day cap turned monthly is not shown as a fee", () => {
  assert.equal(looksLikeProvinceCap(477, "ON"), true);
  assert.equal(publicMonthlyFee(477, { province: "ON" }), null);
  assert.equal(publicMonthlyFee(478.5, { province: "on" }), null);
});

test("a fee the centre saved itself still shows", () => {
  assert.equal(publicMonthlyFee(477, { province: "ON", feeConfidence: "centre" }), 477);
});

test("real Ontario fees outside the cap range still show", () => {
  assert.equal(publicMonthlyFee(1650, { province: "ON" }), 1650);
});

test("other provinces are unchanged", () => {
  assert.equal(publicMonthlyFee(477, { province: "AB" }), 477);
});
