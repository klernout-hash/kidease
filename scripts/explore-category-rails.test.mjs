import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Explore list is six parent category rails with arrows, not a stacked grid", () => {
  const search = src("src/routes/search.tsx");
  const rails = src("src/components/explore-category-rails.tsx");
  const lib = src("src/lib/explore-category-rails.ts");
  const listing = src("src/components/listing-rail.tsx");
  const copy = src("src/lib/copy.ts");

  assert.match(search, /ExploreCategoryRails/);
  assert.match(search, /railItems/);
  assert.match(search, /exploreBrowseHint/);
  assert.doesNotMatch(search, /searchNeedAgeStart/);
  assert.doesNotMatch(search, /presenceLive/);
  assert.doesNotMatch(search, /licensedNotLiveTitle/);
  assert.doesNotMatch(search, /licensedNotLiveLead/);
  assert.doesNotMatch(search, /wayfindChildProfile/);
  assert.match(search, /ExploreCategoryRails items=\{railItems\}/);
  assert.match(search, /ke-listings/);

  assert.match(rails, /data-ke="explore-category-rails"/);
  assert.match(rails, /railId="near-you"/);
  assert.match(rails, /railId="openings"/);
  assert.match(rails, /openingsRailEmpty/);
  assert.match(rails, /EXPLORE_RAIL_AGES\.map/);

  assert.match(lib, /export function exploreNearYouItems/);
  assert.match(lib, /export function exploreOpeningsItems/);
  assert.match(lib, /honestVacancy\(row\)\.kind === "open"/);
  assert.match(lib, /matchesRailAge/);
  assert.match(lib, /distanceKm/);
  assert.doesNotMatch(lib, /spotsTotal \|\| 4/);

  assert.match(listing, /data-ke="explore-rail-empty"/);
  assert.match(listing, /className="flex items-center gap-2"/);
  assert.doesNotMatch(listing, /hidden sm:flex/);

  assert.match(copy, /exploreBrowseHint: "\{n\} live · browse directory"/);
  assert.match(copy, /openingsRail: "Openings"/);
  assert.match(copy, /Aucune place confirmée près de vous/);
});
