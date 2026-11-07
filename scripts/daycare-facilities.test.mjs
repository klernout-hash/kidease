import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  DAYCARE_FACILITIES,
  centreFacilities,
  facilitySummary,
  filterFacilities,
  roomFacilities,
  toggleFacility,
} from "../src/lib/daycare-facilities.ts";

test("facilities start empty and unknown claims are refused", () => {
  assert.deepEqual(toggleFacility([], "yard", false), []);
  assert.deepEqual(centreFacilities([]), []);
  assert.deepEqual(toggleFacility(["wool"], "allergen-free", true), ["wool"]);
  assert.deepEqual(toggleFacility(["wool"], "camera-at-the-door", true), ["wool"]);
  assert.deepEqual(toggleFacility(["wool", "yard"], "yard", false), ["wool"]);
  assert.deepEqual(toggleFacility([], "toys", true), ["toys"]);
});

test("meals stay off the facility list", () => {
  assert.equal(DAYCARE_FACILITIES.some((item) => item.id === "meals"), false);
  assert.deepEqual(toggleFacility(["meals"], "meals", true), ["meals"]);
  assert.equal(centreFacilities(["meals", "books"]).some((item) => item.id === "meals"), false);
});

test("a room selection is not treated as a centre facility", () => {
  assert.equal(centreFacilities([]).length, 0);
  assert.equal(roomFacilities(["toys"]).length, 1);
  assert.equal(centreFacilities(["books"]).some((item) => item.id === "toys"), false);
  assert.equal(roomFacilities(["yard", "books"]).some((item) => item.id === "yard"), false);
});

test("search and category intersect, and an empty result is empty", () => {
  const both = filterFacilities({ scope: "centre", category: "outdoor", query: "fence" });
  assert.deepEqual(both.map((item) => item.id), ["yard"]);
  const none = filterFacilities({ scope: "centre", category: "rest", query: "parking" });
  assert.equal(none.length, 0);
  const french = filterFacilities({ scope: "centre", category: "all", query: "poussette" });
  assert.deepEqual(french.map((item) => item.id), ["stroller-storage"]);
});

test("summary is the first three selected items and a more count", () => {
  const keys = ["toys", "books", "shade", "heating", "meals"];
  const summary = facilitySummary(keys, "en");
  assert.deepEqual(summary.labels, ["Age-appropriate toys", "Books", "Shade in the yard"]);
  assert.equal(summary.more, 1);
  assert.equal(facilitySummary([], "fr").labels.length, 0);
});

test("saving keeps catalogue ids on the listing amenities list and refuses unsafe claims", () => {
  const listing = readFileSync(new URL("../src/lib/parent-listing.ts", import.meta.url), "utf8");
  const desk = listing.slice(listing.indexOf("export const DESK_AMENITIES"), listing.indexOf("export const PROMO_TEXT_MAX"));
  for (const item of DAYCARE_FACILITIES) {
    assert.match(desk, new RegExp(`"${item.id}"`));
  }
  assert.match(listing, /if \(AMENITY_IDS\.has\(key\)\) keys\.add\(key\)/);
  assert.doesNotMatch(desk, /allergen-free|camera-at-the-door|floorplan|cubicasa/i);
});
