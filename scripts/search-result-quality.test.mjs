import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compareWithPaidPins } from "../src/lib/provider-entitlements.ts";
import {
  collapseAdjacentDuplicates,
  isPostalCodeName,
  isSummerProgram,
  junkRank,
  withJunkLast,
} from "../src/lib/search-result-quality.ts";
import { DEFAULT_SEARCH_SORT, parseSearchSort } from "../src/lib/search-sort.ts";
import { sponsoredPinsFirst } from "../src/lib/sponsored-flag.ts";
import { spotStartFits } from "../src/lib/spot-alert-match.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("Best match is the default search sort", () => {
  assert.equal(DEFAULT_SEARCH_SORT, "best");
  assert.equal(parseSearchSort(undefined), "best");
  assert.equal(parseSearchSort(""), "best");
  assert.equal(parseSearchSort("distance"), "distance");
  assert.equal(parseSearchSort("nope"), "distance");
  assert.match(src("src/lib/store.ts"), /DEFAULT_SEARCH_SORT/);
  assert.match(src("src/routes/search.tsx"), /DEFAULT_SEARCH_SORT/);
  assert.doesNotMatch(src("src/routes/search.tsx"), /sort: "distance"/);
});

test("paid pins sort first only when the Sponsored flag is on", () => {
  assert.equal(sponsoredPinsFirst({}), false);
  assert.equal(sponsoredPinsFirst({ VITE_FEATURE_SPONSORED_LISTINGS: "true" }), true);
  assert.equal(sponsoredPinsFirst({ FEATURE_SPONSORED_LISTINGS: "true" }), false);
  const plain = { id: "plain", score: 10, priority: false, featuredCity: false };
  const pinned = { id: "pin", score: 1, priority: true, featuredCity: true };
  const byScore = (a, b) => b.score - a.score;
  assert.ok(compareWithPaidPins(plain, pinned, byScore, { enabled: false }) < 0);
  assert.ok(compareWithPaidPins(plain, pinned, byScore, { enabled: true }) > 0);
  assert.match(src("src/lib/server/daycares.ts"), /sponsoredPinsFirst\(\)/);
  assert.match(src("src/lib/server/daycares.ts"), /enabled: pinsOn/);
  assert.match(src("docs/parent-rank.md"), /FEATURE_SPONSORED_LISTINGS/);
});

test("adjacent duplicate listings collapse and distant sites stay", () => {
  const knox = collapseAdjacentDuplicates([
    { id: "hollow", name: "Knox", city: "Winnipeg", lat: 49.89, lng: -97.14, address: "1 Main St" },
    {
      id: "full",
      name: "Knox Daycare",
      city: "Winnipeg",
      lat: 49.8902,
      lng: -97.1401,
      address: "1 Main Street",
      live: true,
      photos: ["a.jpg"],
    },
  ]);
  assert.deepEqual(knox.map((row) => row.id), ["full"]);

  const korner = collapseAdjacentDuplicates([
    { id: "a", name: "Kinder Korner", city: "Calgary", address: "50 Kinder Lane", lat: 51.04, lng: -114.07 },
    { id: "b", name: "Kinder Korner Inc", city: "Calgary", address: "50 Kinder Lane", lat: 51.0401, lng: -114.0701, claimed: true },
  ]);
  assert.deepEqual(korner.map((row) => row.id), ["b"]);

  const chain = collapseAdjacentDuplicates([
    { id: "west", name: "YMCA Child Care", city: "Ottawa", lat: 45.4, lng: -75.7 },
    { id: "east", name: "YMCA Child Care", city: "Ottawa", lat: 45.45, lng: -75.6 },
  ]);
  assert.equal(chain.length, 2);
});

test("postal-code names, coordinating offices, and summer programs sort last", () => {
  assert.equal(isPostalCodeName("T2R"), true);
  assert.equal(isPostalCodeName("T2R 0A1"), true);
  assert.equal(isPostalCodeName("T2R Daycare"), true);
  assert.equal(isPostalCodeName("Riverbend Daycare"), false);
  assert.equal(isSummerProgram({ name: "Summerland Early Learning" }), false);
  assert.equal(isSummerProgram({ name: "Little Saints Summer Program" }), true);
  const rows = [
    { id: "junk-post", name: "T2R", distanceKm: 0.2 },
    { id: "office", name: "Calgary Child Care Coordinating Office", distanceKm: 0.4 },
    { id: "summer", name: "Little Saints Summer Program", distanceKm: 0.1 },
    { id: "real", name: "Riverbend Daycare", distanceKm: 4 },
  ];
  rows.sort(withJunkLast((a, b) => a.distanceKm - b.distanceKm));
  assert.equal(rows[0].id, "real");
  assert.equal(junkRank(rows[0]), 0);
  assert.ok(rows.slice(1).every((row) => junkRank(row) === 1));
  assert.match(src("src/lib/server/daycares.ts"), /collapseAdjacentDuplicates/);
  assert.match(src("src/lib/server/daycares.ts"), /withJunkLast/);
});

test("saved search alerts keep the parent's start date", () => {
  const now = new Date("2026-10-31T18:00:00Z");
  const saved = src("src/lib/saved-search.ts");
  assert.match(saved, /export function parseStartDate/);
  assert.match(saved, /startDate: parseStartDate\(src\.startDate\)/);
  assert.equal(spotStartFits("2026-11-10", now), true);
  assert.equal(spotStartFits("2027-06-01", now), false);
  assert.equal(spotStartFits(null, now), true);
  assert.match(src("src/routes/search.tsx"), /startDate: needBy/);
  assert.match(src("src/lib/server/search-alerts.ts"), /spotStartFits\(filters\.startDate/);
  assert.match(src("src/lib/server/saved-searches.ts"), /start_date/);
});
