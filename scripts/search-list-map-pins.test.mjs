import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  numberSearchResults,
  SEARCH_MAP_LIST_LIMIT,
  SEARCH_SPLIT_MIN_PX,
  searchPinNumberForSlug,
  searchPinNumbers,
  searchShowsSplitLayout,
} from "../src/lib/search-pins.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("result cards and map pins share 1-based numbers in list order", () => {
  const items = [
    { slug: "little-oak" },
    { slug: "building-blocks" },
    { slug: "redwood-city" },
  ];
  const numbered = numberSearchResults(items);
  assert.deepEqual(
    numbered.map((row) => ({ slug: row.item.slug, index: row.index })),
    [
      { slug: "little-oak", index: 1 },
      { slug: "building-blocks", index: 2 },
      { slug: "redwood-city", index: 3 },
    ],
  );
  const pins = searchPinNumbers(items);
  assert.equal(pins.get("little-oak"), 1);
  assert.equal(pins.get("building-blocks"), 2);
  assert.equal(pins.get("redwood-city"), 3);
  assert.equal(searchPinNumberForSlug(items, "building-blocks"), 2);
  assert.equal(searchPinNumberForSlug(items, "missing"), null);
});

test("duplicate slugs keep the first card/pin number", () => {
  const items = [{ slug: "oak" }, { slug: "oak" }, { slug: "pine" }];
  const numbered = numberSearchResults(items);
  assert.equal(numbered.length, 2);
  assert.equal(numbered[0].index, 1);
  assert.equal(numbered[1].index, 2);
  assert.equal(searchPinNumbers(items).get("oak"), 1);
  assert.equal(searchPinNumbers(items).get("pine"), 2);
});

test("empty results stay empty — no invented density", () => {
  assert.deepEqual(numberSearchResults([]), []);
  assert.equal(searchPinNumbers([]).size, 0);
});

test("desktop split starts at the website / lg breakpoint; native stays stacked", () => {
  const runtime = src("src/lib/runtime.ts");
  assert.match(runtime, /STOREFRONT_MIN_PX = 1024/);
  assert.equal(SEARCH_SPLIT_MIN_PX, 1024);
  assert.equal(SEARCH_MAP_LIST_LIMIT, 40);
  assert.equal(searchShowsSplitLayout(1440), true);
  assert.equal(searchShowsSplitLayout(1024), true);
  assert.equal(searchShowsSplitLayout(1023), false);
  assert.equal(searchShowsSplitLayout(390), false);
  assert.equal(searchShowsSplitLayout(1440, true), false);
});

test("search page ships list+map together on desktop with numbered pin sync", () => {
  const search = src("src/routes/search.tsx");
  const list = src("src/components/search-results-list.tsx");
  const map = src("src/components/map-view.tsx");
  const css = src("src/styles.css");
  const bar = src("src/components/explore-filter-bar.tsx");
  const copy = src("src/lib/copy.ts");
  const card = src("src/components/daycare-card.tsx");

  assert.match(search, /data-ke="search-split"/);
  assert.match(search, /data-ke="search-split-list"/);
  assert.match(search, /data-ke="search-split-map"/);
  assert.match(search, /ke-search-split/);
  assert.match(search, /SearchResultsList/);
  assert.match(search, /SEARCH_MAP_LIST_LIMIT/);
  assert.match(search, /mapList/);
  assert.match(search, /lg:grid/);
  assert.match(search, /numbered/);
  assert.match(search, /onHover=\{setActive\}/);
  assert.match(search, /highlightResult/);
  assert.match(search, /SEARCH_SPLIT_MIN_PX/);
  assert.match(search, /data-ke="search-distance-presets"/);
  assert.match(search, /setRadiusKm/);
  assert.match(search, /ExploreCategoryRails/);
  assert.match(search, /lg:hidden/);
  assert.match(search, /hidden lg:block/);
  assert.match(search, /data-channel=website/);
  assert.match(search, /ExploreFilterBar/);

  assert.match(list, /data-ke="search-result"/);
  assert.match(list, /data-result-index=\{index\}/);
  assert.match(list, /numberSearchResults/);
  assert.match(list, /onMouseEnter/);
  assert.match(list, /onHover\?\.\(item\.slug\)/);

  assert.match(map, /numbered \? searchPinNumbers\(items\)/);
  assert.match(map, /numberedPinEl/);
  assert.match(map, /ke-num-pin/);
  assert.match(map, /dataset\.resultIndex/);
  assert.match(map, /onHoverRef\.current\?\.\(item\.slug\)/);
  assert.match(map, /numbered && "lg:hidden"/);
  assert.doesNotMatch(map, /#00[a-fA-F0-9]{4}|#22c55e|#16a34a/);

  assert.match(css, /\.ke-search-split/);
  assert.match(css, /@media \(min-width: 1024px\)/);
  assert.match(css, /html\[data-channel="website"\] \.ke-search-split/);
  assert.match(css, /\.ke-num-pin/);
  assert.match(css, /background:\s*#1a3790/);
  assert.doesNotMatch(css, /\.ke-num-pin[\s\S]{0,120}#00/);
  assert.match(css, /\.ke-search-result\.is-active/);

  assert.match(bar, /lg:hidden/);
  assert.match(bar, /data-ke="explore-map-toggle"/);
  assert.match(bar, /t\("nearMe"\)/);
  assert.match(bar, /t\("sortOpen"\)/);
  assert.match(bar, /t\("filterTen"\)/);

  assert.match(copy, /searchResultPin: "Result \{n\}"/);
  assert.match(copy, /searchResultPin: "Résultat \{n\}"/);
  assert.match(copy, /searchShowingOnMap:/);
  assert.match(card, /notOnKidEase/);
  assert.doesNotMatch(search, /Request Info/);
  assert.doesNotMatch(search, /Book a tour/);
  assert.doesNotMatch(search, /Premium/);
});
