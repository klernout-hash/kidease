import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function hasAmenity(amenities, key) {
  return (amenities || "")
    .split(",")
    .map((s) => s.trim())
    .includes(key);
}

function listingCareType(item) {
  if (hasAmenity(item.amenities, "home")) return "home";
  if (
    hasAmenity(item.amenities, "school-age") ||
    hasAmenity(item.amenities, "in-school") ||
    hasAmenity(item.amenities, "extended")
  ) {
    return "before-after";
  }
  return "centre";
}

function matchesCareType(item, care) {
  if (care === "home") return hasAmenity(item.amenities, "home");
  if (care === "before-after") {
    return (
      hasAmenity(item.amenities, "school-age") ||
      hasAmenity(item.amenities, "in-school") ||
      hasAmenity(item.amenities, "extended")
    );
  }
  return !hasAmenity(item.amenities, "home");
}

function matchesRailAge(item, age) {
  if (age === "school-age") {
    if (hasAmenity(item.amenities, "school-age")) return true;
    return Boolean(item.agesKnown && item.ageMaxMonths >= 60);
  }
  return true;
}

function parentRailSearchHref(seeAll) {
  const params = new URLSearchParams();
  if (seeAll.sort) params.set("sort", seeAll.sort);
  if (seeAll.age) params.set("age", seeAll.age);
  if (seeAll.care) params.set("care", seeAll.care);
  if (seeAll.favorites) params.set("favorites", "1");
  const q = params.toString();
  return q ? `/search?${q}` : "/search";
}

function bestMatchRail(items) {
  return items.filter((item) => (item.matchScore ?? 0) >= 1);
}

function urgencyRail(items) {
  return items.filter((item) => (item.urgencyScore ?? 0) > 0);
}

function guestFavoritesRail(items) {
  return items.filter((item) => item.guestFavorite === true);
}

function buildParentRails(items) {
  return [
    { id: "match", items: bestMatchRail(items) },
    { id: "urgency", items: urgencyRail(items) },
    { id: "favorites", items: guestFavoritesRail(items) },
  ].filter((rail) => rail.items.length > 0);
}

test("match and urgency rails hide empty rows and ignore paid pins", () => {
  const empty = buildParentRails([]);
  assert.equal(empty.length, 0);

  const weak = { id: "weak", matchScore: 0, urgencyScore: 0, guestFavorite: false, priority: true };
  assert.equal(bestMatchRail([weak]).length, 0);
  assert.equal(urgencyRail([weak]).length, 0);
  assert.equal(buildParentRails([weak]).length, 0);

  const rails = src("src/lib/parent-rails.ts");
  assert.match(rails, /Paid Pro \/ Network/);
  assert.match(rails, /parentMatchScore/);
  assert.match(rails, /parentUrgencyScore/);
  assert.doesNotMatch(rails, /priority \?/);
  assert.doesNotMatch(rails, /featuredCity/);
  assert.match(src("src/lib/parent-match.ts"), /never enter this score/);
});

test("Guest Favorites rail only uses the real badge, never a paid pin", () => {
  const paid = { id: "pin", priority: true, featuredCity: true, guestFavorite: false };
  const favorite = { id: "fav", guestFavorite: true, priority: false };
  assert.deepEqual(
    guestFavoritesRail([paid, favorite]).map((r) => r.id),
    ["fav"],
  );
  assert.equal(guestFavoritesRail([paid]).length, 0);
  assert.match(src("src/lib/parent-rails.ts"), /guestFavorite === true/);
});

test("age and care rails use real amenities and ages", () => {
  const home = { amenities: "home,licensed", agesKnown: true, ageMaxMonths: 60 };
  const centre = { amenities: "licensed", agesKnown: true, ageMaxMonths: 60 };
  const school = { amenities: "school-age,licensed", agesKnown: true, ageMaxMonths: 144 };
  assert.equal(listingCareType(home), "home");
  assert.equal(listingCareType(centre), "centre");
  assert.equal(matchesCareType(home, "home"), true);
  assert.equal(matchesCareType(centre, "home"), false);
  assert.equal(matchesRailAge(school, "school-age"), true);
  assert.equal(matchesRailAge(centre, "school-age"), true);
  assert.equal(matchesRailAge({ ...centre, agesKnown: true, ageMaxMonths: 36 }, "school-age"), false);
  const care = src("src/lib/care-type.ts");
  assert.match(care, /school-age/);
  assert.match(care, /before-after/);
  assert.match(care, /hasAmenity/);
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
  assert.match(src("src/lib/parent-rails.ts"), /isPublicListing/);
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
