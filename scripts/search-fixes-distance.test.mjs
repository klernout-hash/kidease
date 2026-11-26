import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";
import { UNMEASURED_DISTANCE_KM, shownCardKm } from "../src/lib/card-distance.ts";
import { parentDistanceLabel } from "../src/lib/distance-label.ts";
import { plausibleListingKm } from "../src/lib/plausible-distance.ts";
import { WINNIPEG } from "../src/lib/geo.ts";
import { displayDistanceFor } from "../src/lib/units.ts";

await register(new URL("./alias-loader.mjs", import.meta.url), import.meta.url);
const { smartMatchScore } = await import("../src/lib/ranking/score.ts");

test("the 1,000,000 km sort sentinel is never shown", () => {
  assert.equal(shownCardKm(UNMEASURED_DISTANCE_KM), null);
  assert.equal(shownCardKm(0), null);
  assert.equal(shownCardKm(Number.NaN), null);
  assert.equal(shownCardKm(2.4), 2.4);
  assert.equal(parentDistanceLabel({ km: UNMEASURED_DISTANCE_KM, away: "km away", show: true }), "");
  assert.equal(plausibleListingKm(UNMEASURED_DISTANCE_KM, "Winnipeg", "R3C 0A1"), false);
});

test("a city-centre stand-in pin never earns Close to home", () => {
  const home = { lat: 49.9, lng: -97.14 };
  const base = { id: "a", ageMinMonths: 0, ageMaxMonths: 60, agesKnown: true };
  const stand = smartMatchScore({ ...base, lat: WINNIPEG.lat, lng: WINNIPEG.lng }, { home, radiusKm: 10 });
  assert.equal(stand.why.some((w) => w.code === "close_home"), false);
  const door = smartMatchScore({ ...base, lat: 49.905, lng: -97.14 }, { home, radiusKm: 10 });
  assert.equal(door.why.some((w) => w.code === "close_home"), true);
});

test("French distances use a decimal comma and an FR template", () => {
  assert.equal(displayDistanceFor(0.5, "km", "fr"), "0,5");
  assert.equal(displayDistanceFor(0.5, "km", "en"), "0.5");
  assert.equal(parentDistanceLabel({ km: 0.5, away: "à {n} km", show: true, locale: "fr" }), "à 0,5 km");
  assert.equal(parentDistanceLabel({ km: 0.5, away: "km away", show: true, locale: "en" }), "0.5 km away");
});
