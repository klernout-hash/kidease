import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Explore filter chrome is one Airbnb/Maps bar, not three pill rows", () => {
  const search = src("src/routes/search.tsx");
  const bar = src("src/components/explore-filter-bar.tsx");
  const chips = src("src/components/explore-category-chips.tsx");
  const carousel = src("src/components/chip-carousel.tsx");
  const filters = src("src/components/explore-filter-chips.tsx");
  const css = src("src/styles.css");
  const copy = src("src/lib/copy.ts");
  const explore = src("src/routes/explore.tsx");

  assert.match(carousel, /overflow-x: auto|ke-chip-carousel/);
  assert.match(carousel, /chipCarouselPrev/);
  assert.match(carousel, /chipCarouselNext/);
  assert.match(carousel, /disabled=\{overflow \? !canPrev : undefined\}/);
  assert.match(carousel, /disabled=\{overflow \? !canNext : undefined\}/);
  assert.match(carousel, /data-chip-scroll/);
  assert.match(carousel, /scrollBy/);
  assert.match(carousel, /compact/);
  assert.match(css, /\.ke-chip-carousel/);
  assert.match(css, /\.ke-chip-carousel-track/);
  assert.match(css, /width:\s*max-content/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /flex-wrap:\s*nowrap/);
  assert.match(carousel, /w-full min-w-0 max-w-full/);
  assert.match(carousel, /inner\.scrollWidth/);
  assert.match(carousel, /data-chip-overflow/);
  assert.match(carousel, /data-chip-compact/);
  assert.match(search, /data-ke="explore-filters-sheet"/);

  assert.match(bar, /data-search-row="filter-bar"/);
  assert.match(bar, /data-ke="explore-filter-bar"/);
  assert.match(bar, /ke-explore-scope/);
  assert.match(bar, /role="tablist"/);
  assert.match(bar, /t\("live"\)/);
  assert.match(bar, /t\("scopeAll"\)/);
  assert.match(bar, /t\("filters"\)/);
  assert.match(bar, /t\("map"\)/);
  assert.match(bar, /t\("nearMe"\)/);
  assert.match(bar, /t\("sortOpen"\)/);
  assert.match(bar, /t\("filterTen"\)/);
  assert.match(bar, /ke-explore-icon-btn/);
  assert.match(bar, /data-ke="explore-filters-toggle"/);
  assert.match(bar, /SlidersHorizontal/);
  assert.match(bar, /<Map /);
  assert.doesNotMatch(bar, /t\("nearWork"\)/);
  assert.doesNotMatch(bar, /t\("catAllAges"\)/);
  assert.doesNotMatch(bar, /t\("liveOnly"\)/);
  assert.doesNotMatch(bar, /t\("showAll"\)/);
  assert.doesNotMatch(search, /data-search-row="live-filters-map"/);
  assert.doesNotMatch(search, /data-search-row="fit-place"/);
  assert.doesNotMatch(chips, /data-search-row="categories"/);
  assert.doesNotMatch(chips, /catAllAges/);
  assert.match(chips, /t\("catAll"\)/);
  assert.match(chips, /data-explore-cat="all"/);
  assert.match(chips, /to="\/search"/);
  assert.doesNotMatch(chips, /ChipCarousel/);

  const chrome = search.slice(search.indexOf("<ExploreSearchBar"), search.indexOf("{askLocation"));
  assert.match(chrome, /ExploreFilterBar/);
  assert.match(chrome, /ExploreCategoryChips/);
  assert.match(chrome, /onLiveOnly=\{setLiveOnly\}/);
  assert.match(chrome, /t\("nearMe"\)|onNearMe/);
  assert.doesNotMatch(chrome, /t\("nearWork"\)/);
  assert.doesNotMatch(chrome, /ExploreFilterChips/);
  assert.doesNotMatch(chrome, /t\("chipAge"\)/);
  assert.doesNotMatch(chrome, /t\("chipFacility"\)/);
  assert.doesNotMatch(chrome, /flex-wrap items-center gap-2 overflow-x-auto/);
  assert.doesNotMatch(chrome, /<ChipCarousel/);

  assert.match(search, /data-ke="near-work"/);
  assert.match(search, /t\("nearWork"\)/);
  assert.match(search, /t\("nearWorkLead"\)/);
  assert.match(search, /hideKeys=\{\["ages"\]\}/);
  assert.match(search, /exploreFacilityTypes/);
  assert.match(search, /writeCategorySearch\(activeCat === cat \? undefined : cat\)/);
  assert.match(filters, /hideKeys/);
  assert.match(chips, /isRailAge/);
  assert.match(chips, /RAIL_AGES/);
  assert.match(chips, /catInfants|EXPLORE_CATEGORY_COPY/);
  assert.doesNotMatch(chips, /visibleExploreCategories/);

  assert.match(copy, /catAllAges: "All ages"/);
  assert.match(copy, /nearMe: "Near me"/);
  assert.match(copy, /scopeAll: "All"/);
  assert.match(copy, /searchRowFilters: "Quick filters"/);
  assert.match(copy, /nearWorkLead:/);
  assert.match(copy, /Tous les âges/);
  assert.match(copy, /Près de moi/);
  assert.match(copy, /scopeAll: "Tout"/);

  assert.match(css, /\.ke-explore-filter-bar/);
  assert.match(css, /\.ke-explore-filter-sticky/);
  assert.match(css, /\.ke-explore-scope-tab/);
  assert.match(css, /\.ke-explore-icon-btn/);
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(search, /ke-explore-filter-sticky/);

  assert.match(explore, /redirect\(\{ to: "\/search" \}\)/);
  assert.match(search, /splitSearchResults/);
  assert.match(search, /searchFiltersReady/);
  assert.match(search, /data-ke="search-result-list"/);
  assert.match(search, /presentation="visual"/);
  assert.match(search, /t\("exploreBrowseHint"\)/);
  assert.doesNotMatch(search, /searchNeedAgeStart/);
  assert.doesNotMatch(search, /presenceLive/);
  assert.doesNotMatch(search, /licensedNotLiveTitle/);
});

test("listing cards render one Request info CTA, not a stacked ghost layer", () => {
  const card = src("src/components/daycare-card.tsx");
  const visual = card.slice(card.indexOf('presentation === "visual"'), card.indexOf("aspect-[3/2]"));
  const rail = card.slice(card.indexOf("aspect-[3/2]"));
  assert.equal((visual.match(/cardRequestInfo/g) ?? []).length, 1);
  assert.equal((rail.match(/cardRequestInfo/g) ?? []).length, 1);
  assert.match(card, /data-ke="card-request-info"/);
  assert.match(card, /appearance-none/);
  assert.match(card, /\[-moz-appearance:none\]/);
  assert.match(card, /CompareChip/);
  const compareAt = card.indexOf("<CompareChip");
  const compareBlock = card.slice(compareAt, card.indexOf("/>", compareAt) + 2);
  assert.doesNotMatch(compareBlock, /left-2 bottom-2/);
  assert.doesNotMatch(card, /className="ke-tile group relative w-full"/);
});
