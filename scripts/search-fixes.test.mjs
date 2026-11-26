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

test("guests get no default commute from an old stored work place", async () => {
  const mem = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
  };
  const local = mem();
  const session = mem();
  globalThis.window = { localStorage: local, sessionStorage: session };
  const { readDualAnchorPrefs, writeDualAnchorPrefs, DUAL_ANCHOR_STORAGE_KEY } = await import("../src/lib/dual-anchor.ts");
  local.setItem(
    DUAL_ANCHOR_STORAGE_KEY,
    JSON.stringify({ work: { lat: 50.57, lng: -96.2, label: "Powerview-Pine Falls, MB, Canada" }, mode: "both" }),
  );
  assert.deepEqual(readDualAnchorPrefs(), { work: null, mode: "home" });
  assert.equal(local.getItem(DUAL_ANCHOR_STORAGE_KEY), null);
  writeDualAnchorPrefs({ work: { lat: 49.9, lng: -97.1, label: "Winnipeg, MB" }, mode: "both" });
  assert.equal(readDualAnchorPrefs().work?.label, "Winnipeg, MB");
  delete globalThis.window;
});

test("postal searches keep the postal code in the URL", async () => {
  const { postalSearchLabel } = await import("../src/lib/geo.ts");
  assert.equal(postalSearchLabel("r3c0a1"), "R3C 0A1");
  assert.equal(postalSearchLabel("R3C 0A1"), "R3C 0A1");
  assert.equal(postalSearchLabel("r3c"), "R3C");
  assert.equal(postalSearchLabel("Winnipeg, MB"), null);
  assert.equal(postalSearchLabel("Halifax"), null);
});

test("a tighter radius narrows a city hub search", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/lib/server/daycares.ts", import.meta.url), "utf8");
  assert.match(src, /else if \(data\.radiusKm < DEFAULT_SEARCH_RADIUS_KM\) \{\n\s+cards = cards\.filter\(\(card\) => includeCardInRadius\(card, origin, data\.radiusKm\)\);/);
  const search = readFileSync(new URL("../src/routes/search.tsx", import.meta.url), "utf8");
  assert.match(search, /const postal = postalSearchLabel\(label\);/);
});

test("support filters accept both inclusive and special-needs tags", async () => {
  const { rowListsExtraSupport, rowHasCareDetail } = await import("../src/lib/inclusive-filters.ts");
  assert.equal(rowListsExtraSupport("meals,inclusive"), true);
  assert.equal(rowListsExtraSupport("special-needs"), true);
  assert.equal(rowListsExtraSupport("meals,halal"), false);
  assert.equal(rowHasCareDetail("inclusive", "special-needs"), true);
  assert.equal(rowHasCareDetail("halal,inclusive", "halal"), true);
});

test("one chip per active filter and the badge matches the chips", async () => {
  const { searchActiveFilters, searchSheetFilterCount } = await import("../src/lib/saved-search.ts");
  const input = {
    filters: { avail: "any", inclusive: true },
    pioneer: { inclusive: "1", spoken: "fr,pa" },
    careKeys: ["halal", "special-needs"],
    licence: "centre",
  };
  const chips = searchActiveFilters(input);
  assert.deepEqual(chips.map((c) => c.kind), ["support", "spoken", "spoken", "diet", "licence"]);
  assert.equal(searchSheetFilterCount(input), chips.length);
  assert.equal(searchSheetFilterCount({ filters: {}, careKeys: ["halal"] }), 1);
});
