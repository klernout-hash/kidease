import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { classifyFacilityType } from "../src/lib/facility-type.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const EXPLORE_CATEGORIES = [
  "infant",
  "toddler",
  "preschool",
  "school-age",
  "before-after",
  "home",
  "nursery",
];

function hasAmenity(amenities, key) {
  return (amenities || "")
    .split(",")
    .map((s) => s.trim())
    .includes(key);
}

function opensEarly(hours) {
  return /6:\d|7:00|6 a/i.test(hours || "");
}

function staysLate(hours, amenities) {
  return (
    hasAmenity(amenities, "extended") ||
    hasAmenity(amenities, "evenings") ||
    /18:|19:|6 p\.?m|7 p\.?m/i.test(hours || "")
  );
}

function matchesAgeBand(ageBand, row) {
  if (ageBand === "any") return true;
  if (row.agesKnown === false) return false;
  if (ageBand === "infant") return row.ageMinMonths <= 18;
  if (ageBand === "toddler") return row.ageMinMonths < 36 && row.ageMaxMonths >= 18;
  return row.ageMaxMonths >= 30 && row.ageMinMonths < 72;
}

function hasConfirmedAges(d) {
  if (d.agesKnown === false) return false;
  if (d.agesKnown) return true;
  return d.ageMaxMonths > d.ageMinMonths && d.ageMaxMonths > 0;
}
function listingAgeUnknown(d) {
  return !hasConfirmedAges(d);
}
function matchesRailAge(item, age) {
  if (age === "school-age") {
    if (hasAmenity(item.amenities || "", "school-age")) return true;
    return hasConfirmedAges(item) && item.ageMaxMonths >= 60;
  }
  if (!hasConfirmedAges(item)) return false;
  return matchesAgeBand(age, item);
}

function isBeforeAfterProgram(item) {
  const amenities = item.amenities || "";
  return (
    hasAmenity(amenities, "school-age") ||
    hasAmenity(amenities, "in-school") ||
    hasAmenity(amenities, "extended") ||
    opensEarly(item.hours || "") ||
    staysLate(item.hours || "", amenities)
  );
}

function exploreTags(item) {
  const tags = [];
  if (!listingAgeUnknown(item)) {
    for (const age of ["infant", "toddler", "preschool", "school-age"]) {
      if (matchesRailAge(item, age)) tags.push(age);
    }
  }
  if (isBeforeAfterProgram(item)) tags.push("before-after");
  const facility = classifyFacilityType(item).type;
  if (facility === "home") tags.push("home");
  if (facility === "nursery") tags.push("nursery");
  return tags;
}
function visibleExploreCategories(counts, selected) {
  return EXPLORE_CATEGORIES.filter((cat) => counts[cat] > 0 || cat === selected);
}

function matchesCategory(item, cat) {
  if (!cat) return true;
  return exploreTags(item).includes(cat);
}

function isFacilityExploreCategory(cat) {
  return cat === "home" || cat === "nursery" || cat === "before-after";
}

function listingMatchesExploreFilter(item, cat) {
  if (!cat || !isFacilityExploreCategory(cat)) return true;
  return matchesCategory(item, cat);
}

function exploreCategoryToSearchAge(cat) {
  return ["infant", "toddler", "preschool", "school-age"].includes(cat) ? cat : undefined;
}

function resolvedExploreCategory(search) {
  if (EXPLORE_CATEGORIES.includes(search.cat)) return search.cat;
  if (EXPLORE_CATEGORIES.includes(search.age)) return search.age;
  if (search.care === "home" || search.care === "nursery" || search.care === "before-after") {
    return search.care;
  }
  return undefined;
}

function countExploreCategories(items) {
  const counts = {
    infant: 0,
    toddler: 0,
    preschool: 0,
    "school-age": 0,
    "before-after": 0,
    home: 0,
    nursery: 0,
  };
  for (const item of items) {
    for (const tag of exploreTags(item)) counts[tag] += 1;
  }
  return counts;
}

function listing(over = {}) {
  return {
    name: "Licensed centre",
    amenities: "licensed",
    hours: "Monday to Friday 8:00-17:00",
    agesKnown: true,
    ageMinMonths: 12,
    ageMaxMonths: 60,
    ...over,
  };
}

test("exploreTags and matchesCategory cover infant, home, nursery, before-after, unknown ages", () => {
  const infantHome = listing({
    name: "Family home that serves infants",
    amenities: "licensed,home",
    agesKnown: true,
    ageMinMonths: 0,
    ageMaxMonths: 24,
  });
  const infantTags = exploreTags(infantHome);
  assert.ok(infantTags.includes("infant"));
  assert.ok(infantTags.includes("home"));
  assert.equal(matchesCategory(infantHome, "infant"), true);
  assert.equal(matchesCategory(infantHome, "home"), true);
  assert.equal(matchesCategory(infantHome, "nursery"), false);
  assert.equal(matchesCategory(infantHome, undefined), true);

  const nameOnlyHome = listing({
    name: "Kims Home Daycare",
    amenities: "licensed",
    agesKnown: true,
    ageMinMonths: 0,
    ageMaxMonths: 18,
  });
  assert.equal(exploreTags(nameOnlyHome).includes("home"), false);
  assert.equal(matchesCategory(nameOnlyHome, "home"), false);
  assert.equal(matchesCategory(nameOnlyHome, "infant"), true);

  const knownOutsideInfant = listing({
    agesKnown: true,
    ageMinMonths: 30,
    ageMaxMonths: 60,
  });
  assert.equal(matchesCategory(knownOutsideInfant, "infant"), false);
  assert.equal(exploreTags(knownOutsideInfant).includes("infant"), false);

  const unknownAges = listing({
    agesKnown: false,
    ageMinMonths: 0,
    ageMaxMonths: 0,
    amenities: "licensed",
  });
  const unknownTags = exploreTags(unknownAges);
  assert.equal(unknownTags.includes("infant"), false);
  assert.equal(unknownTags.includes("toddler"), false);
  assert.equal(unknownTags.includes("preschool"), false);
  assert.equal(unknownTags.includes("school-age"), false);
  assert.equal(matchesCategory(unknownAges, "infant"), false);
  assert.equal(matchesCategory(unknownAges, undefined), true);

  const leftoverRangeUnknown = listing({
    agesKnown: false,
    ageMinMonths: 0,
    ageMaxMonths: 18,
    amenities: "licensed",
  });
  assert.equal(exploreTags(leftoverRangeUnknown).includes("infant"), false);
  assert.equal(matchesCategory(leftoverRangeUnknown, "infant"), false);

  const unknownHome = listing({
    name: "Tiny Tots",
    amenities: "licensed,home",
    hours: "",
    agesKnown: false,
    ageMinMonths: 0,
    ageMaxMonths: 0,
  });
  assert.deepEqual(exploreTags(unknownHome), ["home"]);
  assert.equal(matchesCategory(unknownHome, "home"), true);
  assert.equal(matchesCategory(unknownHome, "infant"), false);

  const nursery = listing({
    name: "West End Nursery School",
    amenities: "licensed,nursery",
    agesKnown: true,
    ageMinMonths: 30,
    ageMaxMonths: 60,
  });
  assert.ok(exploreTags(nursery).includes("nursery"));
  assert.equal(matchesCategory(nursery, "nursery"), true);
  assert.equal(
    matchesCategory(listing({ name: "Alonsa Nursery School", amenities: "licensed" }), "nursery"),
    false,
  );

  const beforeAfterAmenity = listing({ amenities: "licensed,school-age,extended" });
  assert.ok(exploreTags(beforeAfterAmenity).includes("before-after"));
  assert.ok(exploreTags(beforeAfterAmenity).includes("school-age"));
  assert.equal(matchesCategory(beforeAfterAmenity, "before-after"), true);

  const beforeAfterHours = listing({
    amenities: "licensed",
    hours: "Monday to Friday 7:00-18:00",
    agesKnown: true,
    ageMinMonths: 36,
    ageMaxMonths: 72,
  });
  assert.ok(exploreTags(beforeAfterHours).includes("before-after"));
  assert.equal(matchesCategory(beforeAfterHours, "before-after"), true);

  const schoolAgeByMonths = listing({
    amenities: "licensed",
    agesKnown: true,
    ageMinMonths: 48,
    ageMaxMonths: 72,
  });
  assert.ok(exploreTags(schoolAgeByMonths).includes("school-age"));
  assert.equal(matchesCategory(schoolAgeByMonths, "school-age"), true);

  const centre = listing({ amenities: "licensed,funded,ten-a-day" });
  assert.equal(exploreTags(centre).includes("home"), false);
  assert.equal(exploreTags(centre).includes("nursery"), false);
  assert.equal(matchesCategory(centre, undefined), true);
});

test("age category filter keeps unknown-age rows for the All tail", () => {
  const leftover = listing({
    amenities: "licensed",
    agesKnown: false,
    ageMinMonths: 0,
    ageMaxMonths: 18,
  });
  const home = listing({
    amenities: "licensed,home",
    agesKnown: false,
    ageMinMonths: 0,
    ageMaxMonths: 0,
  });
  const knownToddler = listing({
    amenities: "licensed",
    agesKnown: true,
    ageMinMonths: 18,
    ageMaxMonths: 36,
  });
  assert.equal(listingMatchesExploreFilter(leftover, "toddler"), true);
  assert.equal(listingMatchesExploreFilter(leftover, "infant"), true);
  assert.equal(listingMatchesExploreFilter(home, "home"), true);
  assert.equal(listingMatchesExploreFilter(leftover, "home"), false);
  assert.equal(listingMatchesExploreFilter(knownToddler, "nursery"), false);
  assert.equal(matchesCategory(leftover, "infant"), false);
});

test("age chips 1–4 set the age-first search gate; facility chips do not", () => {
  assert.equal(exploreCategoryToSearchAge("infant"), "infant");
  assert.equal(exploreCategoryToSearchAge("home"), undefined);
  assert.equal(exploreCategoryToSearchAge("nursery"), undefined);
  assert.equal(exploreCategoryToSearchAge("before-after"), undefined);
  assert.equal(resolvedExploreCategory({ cat: "home" }), "home");
  assert.equal(resolvedExploreCategory({ age: "infant" }), "infant");
  assert.equal(resolvedExploreCategory({ care: "nursery" }), "nursery");
  assert.equal(resolvedExploreCategory({ care: "centre" }), undefined);
  assert.equal(resolvedExploreCategory({ cat: "home", age: "infant" }), "home");
});

test("zero-count tags stay off the page empty-state; All still includes unknown ages", () => {
  const rows = [
    listing({ amenities: "licensed,home", agesKnown: true, ageMinMonths: 0, ageMaxMonths: 18 }),
    listing({ amenities: "licensed", agesKnown: false, ageMinMonths: 0, ageMaxMonths: 0 }),
  ];
  const counts = countExploreCategories(rows);
  assert.equal(counts.infant, 1);
  assert.equal(counts.home, 1);
  assert.equal(counts.nursery, 0);
  assert.ok(matchesCategory(rows[1], undefined));
  const visible = visibleExploreCategories(counts);
  assert.ok(visible.includes("infant"));
  assert.ok(visible.includes("home"));
  assert.equal(visible.includes("nursery"), false);
  assert.ok(visibleExploreCategories(counts, "nursery").includes("nursery"));
});

test("search and explore wire one Top 7 chip row and ?cat=", () => {
  const lib = src("src/lib/explore-categories.ts");
  const search = src("src/routes/search.tsx");
  const chips = src("src/components/explore-category-chips.tsx");
  const explore = src("src/routes/explore.tsx");
  const rails = src("src/components/explore-rails.tsx");
  assert.match(lib, /export function exploreTags/);
  assert.match(lib, /export function matchesCategory/);
  assert.match(lib, /matchesRailAge/);
  assert.match(lib, /isBeforeAfterProgram/);
  assert.match(lib, /classifyFacilityType/);
  assert.match(lib, /exploreCategoryToSearchAge/);
  assert.match(lib, /listingMatchesExploreFilter/);
  assert.match(lib, /isFacilityExploreCategory/);
  assert.match(search, /listingMatchesExploreFilter/);
  assert.doesNotMatch(lib, /Tiny Tots/);
  assert.match(search, /ExploreCategoryChips/);
  assert.match(search, /writeCategorySearch/);
  assert.match(search, /searchFiltersReady/);
  assert.match(search, /hideAge/);
  assert.match(search, /start: incoming\.start/);
  assert.match(search, /s\.cat/);
  assert.match(search, /isExploreCategory/);
  assert.match(search, /ke-listings/);
  assert.doesNotMatch(search, /showCentres/);
  assert.doesNotMatch(search, /showNurseries/);
  assert.doesNotMatch(search, /showHomes/);
  assert.doesNotMatch(search, /ExploreRails/);
  assert.doesNotMatch(search, /FacilityTypeRails/);
  assert.match(chips, /data-explore-cat/);
  assert.match(chips, /visibleExploreCategories/);
  assert.match(lib, /listingAgeUnknown/);
  assert.match(chips, /EXPLORE_CATEGORY_COPY/);
  assert.match(src("src/lib/copy.ts"), /catInfants: "Infants"/);
  assert.match(src("src/lib/copy.ts"), /catBeforeAfter: "Before & after"/);
  assert.match(explore, /redirect\(\{ to: "\/search" \}\)/);
  assert.doesNotMatch(rails, /FacilityTypeRails/);
  assert.match(src("src/lib/care-type.ts"), /export function isBeforeAfterProgram/);
  assert.match(src("src/components/daycare-card.tsx"), /facilityTypeSeoKind/);
  assert.match(src("src/lib/parent-rails.ts"), /params\.set\("cat"/);
});
