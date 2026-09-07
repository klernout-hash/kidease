import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  bestMatchRail,
  buildParentRails,
  guestFavoritesRail,
  parentRailSearchHref,
  urgencyRail,
} from "../src/lib/parent-rails.ts";
import { listingCareType, matchesCareType, matchesRailAge } from "../src/lib/care-type.ts";
import { parentMatchScore } from "../src/lib/parent-match.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const prefs = { ageGroup: "infant", radiusKm: 25, distanceKnown: true, startDate: "2026-09-08" };

function card(id, extra = {}) {
  return {
    id,
    slug: id,
    name: id,
    nameFr: id,
    city: "Winnipeg",
    province: "MB",
    amenities: "licensed",
    hours: "Monday to Friday 8:00–17:00",
    agesKnown: true,
    ageMinMonths: 6,
    ageMaxMonths: 60,
    spotsInfant: 2,
    spotsToddler: 1,
    spotsPreschool: 0,
    lastVacancyUpdatedAt: "2026-09-01T12:00:00.000Z",
    claimStatus: "approved",
    claimed: true,
    live: true,
    licenseStatus: "matched",
    registryMatchState: "matched",
    distanceKm: 2,
    spotsTotal: 3,
    fromPrice: 1200,
    photos: ["/photos/buildings/mb-1.jpg"],
    guestFavorite: false,
    priority: false,
    featuredCity: false,
    ...extra,
  };
}

test("match and urgency rails hide empty rows and ignore paid pins", () => {
  const paid = card("paid", { priority: true, featuredCity: true, distanceKm: 1 });
  const free = card("free", { priority: false, featuredCity: false, distanceKm: 1 });
  assert.equal(parentMatchScore(paid, prefs), parentMatchScore(free, prefs));

  const empty = buildParentRails([], prefs);
  assert.equal(empty.length, 0);

  const weak = card("weak", {
    agesKnown: false,
    lastVacancyUpdatedAt: null,
    claimStatus: "unclaimed",
    claimed: false,
    live: false,
    licenseStatus: "unknown",
    spotsInfant: 0,
    spotsToddler: 0,
    spotsPreschool: 0,
    spotsTotal: 0,
    distanceKnown: false,
    distanceKm: undefined,
  });
  const match = bestMatchRail([weak], { distanceKnown: false });
  assert.equal(match.length, 0);
  assert.equal(urgencyRail([weak], {}).length, 0);
});

test("Guest Favorites rail only uses the real badge, never a paid pin", () => {
  const paid = card("pin", { priority: true, featuredCity: true, guestFavorite: false });
  const favorite = card("fav", { guestFavorite: true, priority: false });
  const rail = guestFavoritesRail([paid, favorite]);
  assert.deepEqual(
    rail.map((r) => r.id),
    ["fav"],
  );
  assert.equal(guestFavoritesRail([paid]).length, 0);
});

test("age and care rails use real amenities and ages", () => {
  const home = card("home", { amenities: "home,licensed" });
  const centre = card("centre", { amenities: "licensed" });
  const school = card("school", { amenities: "school-age,licensed", ageMaxMonths: 144 });
  assert.equal(listingCareType(home), "home");
  assert.equal(listingCareType(centre), "centre");
  assert.equal(matchesCareType(home, "home"), true);
  assert.equal(matchesCareType(centre, "home"), false);
  assert.equal(matchesRailAge(school, "school-age"), true);
  assert.equal(matchesRailAge(centre, "school-age"), true);
  assert.equal(matchesRailAge({ ...centre, agesKnown: true, ageMaxMonths: 36 }, "school-age"), false);
});

test("see-all hrefs carry the honest filter or sort", () => {
  assert.equal(parentRailSearchHref({ sort: "match" }), "/search?sort=match");
  assert.equal(parentRailSearchHref({ sort: "urgency" }), "/search?sort=urgency");
  assert.equal(parentRailSearchHref({ favorites: true }), "/search?favorites=1");
  assert.equal(parentRailSearchHref({ age: "infant" }), "/search?age=infant");
  assert.equal(parentRailSearchHref({ care: "home" }), "/search?care=home");
});

test("parent rails are wired on parent desk, home, and search see-all", () => {
  const rails = src("src/components/parent-desk-rails.tsx");
  assert.match(rails, /railBestMatch/);
  assert.match(rails, /railNeedSoon/);
  assert.match(rails, /railGuestFavorites/);
  assert.match(rails, /railByAge/);
  assert.match(rails, /railByCare/);
  assert.match(rails, /school-age/);
  assert.match(rails, /before-after/);
  assert.doesNotMatch(rails, /priority \?/);
  assert.doesNotMatch(rails, /featuredCity/);

  const parent = src("src/components/parent-desk.tsx");
  assert.match(parent, /ParentDeskRails/);
  assert.match(parent, /explore/);
  assert.match(parent, /withTimeoutFallback/);
  assert.match(parent, /LOADER_SETTLE_MS/);

  const home = src("src/routes/index.tsx");
  assert.match(home, /ParentDeskRails/);
  assert.match(home, /searchDaycares/);
  assert.match(home, /withTimeoutFallback/);

  const search = src("src/routes/search.tsx");
  assert.match(search, /favoritesOnly/);
  assert.match(search, /schoolAgeOnly/);
  assert.match(search, /careType/);
  assert.match(search, /incoming.sort/);

  const rail = src("src/components/listing-rail.tsx");
  assert.match(rail, /seeAllHref/);
  assert.match(rail, /seeAll/);

  const copy = src("src/lib/copy.ts");
  assert.match(copy, /Paid plans never inflate Match/);
  assert.match(copy, /railBestMatch: "Best match for you"/);
  assert.match(copy, /seeAll: "See all"/);
});
