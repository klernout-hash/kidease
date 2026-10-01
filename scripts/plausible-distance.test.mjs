import assert from "node:assert/strict";
import test from "node:test";
import { plausibleListingKm } from "../src/lib/plausible-distance.ts";

test("a far pin in the same city stays hidden, a real trip does not", () => {
  assert.equal(plausibleListingKm(1780, "Iqaluit", "Iqaluit, NU"), false);
  assert.equal(plausibleListingKm(0, "Winnipeg", "Winnipeg"), false);
  assert.equal(plausibleListingKm(0.04, "Winnipeg", "Winnipeg"), false);
  assert.equal(plausibleListingKm(12, "Winnipeg", "Winnipeg, MB"), true);
  assert.equal(plausibleListingKm(120, "Brandon", "Winnipeg"), true);
  assert.equal(plausibleListingKm(Number.NaN, "Winnipeg", "Winnipeg"), false);
});
