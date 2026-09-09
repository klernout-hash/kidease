import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("/search chrome is three control rows and keeps existing filter math", () => {
  const search = src("src/routes/search.tsx");
  const bar = src("src/components/explore-search-bar.tsx");
  const chips = src("src/components/explore-category-chips.tsx");
  const copy = src("src/lib/copy.ts");
  const explore = src("src/routes/explore.tsx");
  const home = src("src/routes/index.tsx");

  assert.equal((search.match(/data-search-row=/g) ?? []).length, 1);
  assert.match(bar, /data-search-row="where-when-name"/);
  assert.match(chips, /data-search-row="categories"/);
  assert.match(search, /data-search-row="live-filters-map"/);
  assert.match(search, /data-search-h1/);
  assert.match(search, /data-listing-count/);

  assert.doesNotMatch(search, /SearchAgeGate/);
  assert.doesNotMatch(search, /searchAgeGateTitle/);
  assert.doesNotMatch(search, /Who needs care/);
  assert.doesNotMatch(search, /ExploreHint/);
  assert.doesNotMatch(search, /\{t\("explore"\)\}/);
  assert.match(search, /splitSearchResults/);
  assert.match(search, /searchFiltersReady/);
  assert.match(search, /DualAnchorBar/);
  assert.match(search, /nearWork/);
  assert.match(search, /headingKey="otherCities"/);
  assert.match(search, /const city = \(whereLabel \|\| origin\.label\)\.split/);
  assert.doesNotMatch(search, /workOrigin \? workOrigin : origin/);

  assert.match(bar, /SEARCH_STARTS/);
  assert.match(bar, /onStartChange/);
  assert.match(copy, /searchWhenHint: "Add dates"/);
  assert.match(copy, /searchNeedAgeStart: "Add age and dates to match openings\."/);
  assert.match(copy, /otherCities: "Other cities"/);
  assert.match(copy, /nearWork: "Near work"/);
  assert.match(explore, /redirect\(\{ to: "\/search" \}\)/);
  assert.doesNotMatch(home, /SearchAgeGate/);
  assert.match(home, /onStartChange/);
});
