import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Explore filter chrome is three labelled carousels, not wrapped chip grids", () => {
  const search = src("src/routes/search.tsx");
  const chips = src("src/components/explore-category-chips.tsx");
  const carousel = src("src/components/chip-carousel.tsx");
  const filters = src("src/components/explore-filter-chips.tsx");
  const css = src("src/styles.css");
  const copy = src("src/lib/copy.ts");
  const explore = src("src/routes/explore.tsx");

  assert.match(carousel, /overflow-x: auto|ke-chip-carousel/);
  assert.match(carousel, /chipCarouselPrev/);
  assert.match(carousel, /chipCarouselNext/);
  assert.match(carousel, /disabled=\{!canPrev\}/);
  assert.match(carousel, /disabled=\{!canNext\}/);
  assert.match(carousel, /scrollBy/);
  assert.match(css, /\.ke-chip-carousel/);
  assert.match(css, /\.ke-chip-carousel-track/);
  assert.match(css, /width:\s*max-content/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /flex-wrap:\s*nowrap/);
  assert.match(carousel, /w-full min-w-0 max-w-full/);
  assert.match(carousel, /w-0 flex-1/);
  assert.match(carousel, /data-chip-overflow/);

  assert.match(search, /data-search-row="live-filters-map"/);
  assert.match(chips, /data-search-row="categories"/);
  assert.match(search, /data-search-row="fit-place"/);
  assert.match(search, /t\("searchRowScope"\)/);
  assert.match(chips, /t\("searchRowWho"\)/);
  assert.match(search, /t\("searchRowFit"\)/);

  const chrome = search.slice(search.indexOf("<ExploreSearchBar"), search.indexOf("{askLocation"));
  assert.match(chrome, /setLiveOnly\(true\)/);
  assert.match(chrome, /setLiveOnly\(false\)/);
  assert.match(chrome, /t\("filters"\)/);
  assert.match(chrome, /t\("map"\)/);
  assert.match(chrome, /ExploreCategoryChips/);
  assert.match(chrome, /t\("nearMe"\)/);
  assert.match(chrome, /t\("nearWork"\)/);
  assert.match(chrome, /t\("sortOpen"\)/);
  assert.match(chrome, /t\("filterTen"\)/);
  assert.doesNotMatch(chrome, /ExploreFilterChips/);
  assert.doesNotMatch(chrome, /t\("chipAge"\)/);
  assert.doesNotMatch(chrome, /t\("chipFacility"\)/);
  assert.doesNotMatch(chrome, /flex-wrap items-center gap-2 overflow-x-auto/);

  assert.match(search, /hideKeys=\{\["ages"\]\}/);
  assert.match(search, /exploreFacilityTypes/);
  assert.match(search, /writeCategorySearch\(activeCat === cat \? undefined : cat\)/);
  assert.match(filters, /hideKeys/);
  assert.match(chips, /catAllAges/);
  assert.match(chips, /isRailAge/);
  assert.doesNotMatch(chips, /t\("catAll"\)/);

  assert.match(copy, /catAllAges: "All ages"/);
  assert.match(copy, /nearMe: "Near me"/);
  assert.match(copy, /searchRowScope: "Listings and view"/);
  assert.match(copy, /Tous les âges/);
  assert.match(copy, /Près de moi/);

  assert.match(search, /licensedNotLiveLead/);
  assert.match(explore, /redirect\(\{ to: "\/search" \}\)/);
  assert.match(search, /splitSearchResults/);
  assert.match(search, /searchFiltersReady/);
});
