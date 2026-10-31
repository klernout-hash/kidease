import assert from "node:assert/strict";
import { test } from "node:test";
import { alsoViewed, cleanFeedPreference, homeFeedEnabled, rankHomeFeed } from "../src/lib/home-feed.ts";

const listings = [
  { id: "1", slug: "a", name: "Alpha", city: "Montréal", province: "QC", agesKnown: true, ageMinMonths: 0, ageMaxMonths: 18 },
  { id: "2", slug: "b", name: "Beta", city: "Montreal", province: "QC", agesKnown: false, ageMinMonths: 0, ageMaxMonths: 18 },
  { id: "3", slug: "c", name: "Gamma", city: "Toronto", province: "ON", agesKnown: true, ageMinMonths: 0, ageMaxMonths: 60 },
];

test("the home feed flag defaults off", () => {
  assert.equal(homeFeedEnabled({}), false);
  assert.equal(homeFeedEnabled({ FEATURE_HOME_FEED: "1" }), true);
});

test("ranking uses city and known ages and ignores a start date as an opening", () => {
  const prefs = cleanFeedPreference({ city: "Montreal", province: "qc", childAgeMonths: 12, startDate: "2026-11-01" });
  assert.equal(prefs?.province, "QC");
  const ranked = rankHomeFeed(prefs, listings);
  assert.equal(ranked[0]?.id, "1");
  assert.equal(ranked.some((row) => row.id === "3"), false);
  assert.ok(ranked.find((row) => row.id === "2"));
  assert.equal(ranked.find((row) => row.id === "2")?.score, 25);
  assert.equal(cleanFeedPreference({ city: "", province: "QC" }), null);
});

test("also viewed needs five people in the same city", () => {
  const ids = alsoViewed({
    currentId: "1",
    city: "Montreal",
    views: [
      { listingId: "1", city: "Montreal", viewers: 9 },
      { listingId: "2", city: "Montréal", viewers: 5 },
      { listingId: "3", city: "Montreal", viewers: 4 },
      { listingId: "4", city: "Toronto", viewers: 20 },
    ],
  });
  assert.deepEqual(ids, ["2"]);
});
