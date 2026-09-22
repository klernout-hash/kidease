import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function listing(over = {}) {
  return {
    id: over.id || "x",
    live: false,
    photos: [],
    agesKnown: false,
    ageMinMonths: 0,
    ageMaxMonths: 0,
    infantMonthly: null,
    toddlerMonthly: null,
    preschoolMonthly: null,
    partTimeMonthly: null,
    amenities: "licensed",
    province: "MB",
    feeConfirmed: false,
    distanceKm: 2,
    spotsTotal: 0,
    lastVacancyUpdatedAt: null,
    spotsUpdatedAt: null,
    claimed: false,
    claimStatus: null,
    spotsInfant: 0,
    spotsToddler: 0,
    spotsPreschool: 0,
    availabilityKnown: false,
    ...over,
  };
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
    return hasConfirmedAges(item) && item.ageMaxMonths >= 60;
  }
  if (!hasConfirmedAges(item)) return false;
  if (age === "infant") return item.ageMinMonths <= 18;
  if (age === "toddler") return item.ageMinMonths < 36 && item.ageMaxMonths >= 18;
  return item.ageMaxMonths >= 30 && item.ageMinMonths < 72;
}

function listingFillsSelectedAgeRail(row, age) {
  if (matchesRailAge(row, age)) return true;
  return listingAgeUnknown(row);
}

function exploreRailsToShow(selectedAges) {
  const all = ["infant", "toddler", "preschool", "school-age"];
  return selectedAges.length ? all.filter((age) => selectedAges.includes(age)) : [];
}

test("Explore list is stacked category rails with arrows, not a grid", () => {
  const search = src("src/routes/search.tsx");
  const rails = src("src/components/explore-category-rails.tsx");
  const lib = src("src/lib/explore-category-rails.ts");
  const listingRail = src("src/components/listing-rail.tsx");
  const copy = src("src/lib/copy.ts");

  assert.doesNotMatch(search, /<ExploreCategoryRails/);
  assert.match(search, /railItems/);
  assert.match(search, /visualItems/);
  assert.match(search, /presentation="visual"/);
  assert.match(search, /data-ke="search-result-list"/);
  assert.match(search, /exploreBrowseHint/);
  assert.doesNotMatch(search, /searchNeedAgeStart/);
  assert.doesNotMatch(search, /presenceLive/);
  assert.doesNotMatch(search, /licensedNotLiveTitle/);
  assert.doesNotMatch(search, /licensedNotLiveLead/);
  assert.doesNotMatch(search, /wayfindChildProfile/);
  assert.match(search, /selected=\{selectedAges\}/);

  assert.match(rails, /data-ke="explore-category-rails"/);
  assert.match(rails, /railId="near-you"/);
  assert.match(rails, /railId="openings"/);
  assert.match(rails, /showOpenings/);
  assert.match(rails, /openingsRailEmpty/);
  assert.match(rails, /exploreRailsToShow/);
  assert.match(rails, /exploreAgeRailItemsWithFill/);

  assert.match(lib, /export function exploreNearYouItems/);
  assert.match(lib, /export function exploreOpeningsItems/);
  assert.match(lib, /export function preferCompleteCards/);
  assert.match(lib, /export function exploreCardFillRank/);
  assert.match(lib, /export function exploreAgeRailItemsWithFill/);
  assert.match(lib, /honestVacancy\(row\)\.kind === "open"/);
  assert.match(lib, /matchesRailAge/);
  assert.match(lib, /distanceKm/);
  assert.doesNotMatch(lib, /spotsTotal \|\| 4/);

  assert.match(listingRail, /data-ke="explore-rail-empty"/);
  assert.match(listingRail, /className="flex shrink-0 items-center gap-2"/);
  assert.match(listingRail, /ke-listing-rail-arrows hidden items-center gap-2 sm:flex/);
  assert.match(listingRail, /ke-listing-rail-port/);
  assert.match(listingRail, /persist/);

  assert.match(copy, /exploreBrowseHint: "\{n\} live · browse directory"/);
  assert.match(copy, /openingsRail: "Openings"/);
  assert.match(copy, /Aucune place confirmée près de vous/);
});

test("selected rails stay visible and fill from honest directory cards", () => {
  const lib = src("src/lib/explore-category-rails.ts");
  const rails = src("src/components/explore-category-rails.tsx");
  assert.match(lib, /export function preferCompleteCards/);
  assert.match(lib, /export function exploreCardFillRank/);
  assert.match(lib, /export function listingFillsSelectedAgeRail/);
  assert.match(lib, /isLiveLookingCard/);
  assert.match(lib, /hasRealPhoto/);
  assert.match(lib, /listingAgeUnknown/);
  assert.doesNotMatch(lib, /spotsTotal \|\| 4/);
  assert.match(rails, /persist=\{forced\}/);
  assert.match(rails, /persist=\{openingsSelected\}/);

  const infant = listing({
    id: "infant-1",
    agesKnown: true,
    ageMinMonths: 0,
    ageMaxMonths: 18,
    live: true,
  });
  const unknown = listing({ id: "dir-1", agesKnown: false, distanceKm: 1 });
  const toddlerOnly = listing({
    id: "tod-1",
    agesKnown: true,
    ageMinMonths: 24,
    ageMaxMonths: 40,
  });

  assert.equal(listingFillsSelectedAgeRail(infant, "infant"), true);
  assert.equal(listingFillsSelectedAgeRail(unknown, "infant"), true);
  assert.equal(listingFillsSelectedAgeRail(toddlerOnly, "infant"), false);
  assert.deepEqual(exploreRailsToShow([]), []);
  assert.deepEqual(exploreRailsToShow(["preschool", "infant"]), ["infant", "preschool"]);
});

test("deselecting ages restores Near you only — no ghost age rails", () => {
  const lib = src("src/lib/explore-category-rails.ts");
  const rails = src("src/components/explore-category-rails.tsx");
  const search = src("src/routes/search.tsx");
  assert.match(lib, /selectedAges\.length \? RAIL_AGES\.filter/);
  assert.match(lib, /: \[\]/);
  assert.match(rails, /exploreRailsToShow\(picked\)/);
  assert.match(search, /ages: \[\]/);
  assert.match(search, /writeAgeSearch\(cat && isRailAge\(cat\) \? cat : undefined\)/);
});

test("phone and desktop rail chrome stays first-class", () => {
  const css = src("src/styles.css");
  const search = src("src/routes/search.tsx");
  const listingRail = src("src/components/listing-rail.tsx");
  const chips = src("src/components/explore-category-chips.tsx");

  assert.match(search, /ke-explore-filter-sticky/);
  assert.match(css, /\.ke-explore-filter-sticky/);
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /\.ke-explore-filter-bar \.ke-chip-on/);
  assert.match(css, /--color-primary/);
  assert.match(css, /\.ke-listing-rail-port::after/);
  assert.match(css, /overscroll-behavior-x:\s*contain/);
  assert.match(css, /touch-action:\s*pan-x/);
  assert.match(css, /@media \(min-width: 1280px\)/);
  assert.match(css, /--ke-card-w: 13rem/);
  assert.match(listingRail, /hidden items-center gap-2 sm:flex/);
  assert.match(chips, /data-explore-cat="all"/);
  assert.match(chips, /t\("catAll"\)/);
  assert.match(chips, /to="\/search"/);
  assert.match(chips, /searchFor/);
});
