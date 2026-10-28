import assert from "node:assert/strict";
import test from "node:test";
import { honestCardDistance, plausibleListingKm } from "../src/lib/plausible-distance.ts";
import { commuteDetourLabel } from "../src/lib/commute-isochrone.ts";

test("a far pin in the same city stays hidden, a real trip does not", () => {
  assert.equal(plausibleListingKm(1780, "Iqaluit", "Iqaluit, NU"), false);
  assert.equal(plausibleListingKm(0, "Winnipeg", "Winnipeg"), false);
  assert.equal(plausibleListingKm(0.04, "Winnipeg", "Winnipeg"), false);
  assert.equal(plausibleListingKm(12, "Winnipeg", "Winnipeg, MB"), true);
  assert.equal(plausibleListingKm(120, "Brandon", "Winnipeg"), true);
  assert.equal(plausibleListingKm(Number.NaN, "Winnipeg", "Winnipeg"), false);
  assert.equal(plausibleListingKm(1.1, "Edmonton", "Winnipeg, MB"), false);
});

test("a card hides a fake local distance and a long commute", () => {
  assert.equal(
    honestCardDistance({
      km: 1.1,
      listingCity: "Edmonton",
      originLabel: "Winnipeg, MB",
      originSource: "ip",
    }),
    false,
  );
  assert.equal(
    honestCardDistance({
      km: 1.1,
      listingCity: "Edmonton",
      originLabel: "Edmonton, AB",
      originSource: "gps",
    }),
    true,
  );
  assert.equal(
    honestCardDistance({
      km: 4,
      listingCity: "Winnipeg",
      originLabel: "Winnipeg, MB",
      originSource: "default",
    }),
    true,
  );
  assert.equal(commuteDetourLabel({ minutes: 454, homeToStopKm: 300, homeToWorkKm: 8, locale: "en" }), null);
  assert.equal(commuteDetourLabel({ minutes: 3, homeToStopKm: 1.1, homeToWorkKm: 0.1, locale: "en" }), null);
  assert.equal(commuteDetourLabel({ minutes: 3, homeToStopKm: 1.1, homeToWorkKm: 6, locale: "en" }), "+3 min on your commute");
});
