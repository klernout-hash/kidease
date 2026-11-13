import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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
  const copy = (src("src/lib/copy-en.ts") + src("src/lib/copy-fr.ts"));
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
  assert.doesNotMatch(bar, /data-ke="reply-on-kidease"/);
  assert.doesNotMatch(bar, /role="checkbox"/);
  assert.doesNotMatch(bar, /t\("replyOnKidEase"\)/);
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
  assert.match(chips, /localePath\("\/search", locale\)/);
  assert.doesNotMatch(chips, /ChipCarousel/);

  const chrome = search.slice(search.indexOf("<ExploreSearchBar"), search.indexOf("{askLocation"));
  assert.match(chrome, /ExploreFilterBar/);
  assert.match(chrome, /ExploreCategoryChips/);
  assert.doesNotMatch(chrome, /onLiveOnly=\{setLiveOnly\}/);
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
  assert.match(chips, /standardAgeLabel/);
  assert.doesNotMatch(chips, /visibleExploreCategories/);

  assert.match(copy, /catAllAges: "All ages"/);
  assert.match(copy, /nearMe: "Near me"/);
  assert.match(copy, /replyOnKidEase: "Only show centres that reply on KidEase"/);
  assert.match(copy, /scopeAll: "All"/);
  assert.match(copy, /searchRowFilters: "Quick filters"/);
  assert.match(copy, /nearWorkLead:/);
  assert.match(copy, /Tous les âges/);
  assert.match(copy, /Près de moi/);
  assert.match(copy, /replyOnKidEase: "Afficher seulement les centres qui répondent sur KidEase"/);
  assert.match(copy, /scopeAll: "Tout"/);

  assert.match(css, /\.ke-explore-filter-bar/);
  assert.match(css, /\.ke-explore-filter-sticky/);
  assert.match(css, /--ke-header-h/);
  assert.doesNotMatch(search, /ke-explore-filter-sticky relative z-10/);
  const stickyStart = search.indexOf('className="ke-explore-filter-sticky');
  const stickyBlock = search.slice(stickyStart, search.indexOf("PioneerFilterRail", stickyStart));
  assert.match(stickyBlock, /ExploreFilterBar/);
  assert.doesNotMatch(stickyBlock, /CommuteDetourBar/);
  assert.match(search, /<CommuteDetourBar/);
  assert.match(css, /--ke-help-clear/);
  assert.match(css, /\.ke-reply-toggle/);
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

test("each listing card has one accessible details action and its role-gated save control", () => {
  const card = src("src/components/daycare-card.tsx");
  const source = ts.createSourceFile("daycare-card.tsx", card, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const attribute = (node, name) => node.openingElement.attributes.properties
    .find((prop) => ts.isJsxAttribute(prop) && prop.name.getText(source) === name)?.initializer?.text;
  const articles = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "article") {
      const visual = attribute(node, "data-ke") === "visual-card";
      const rail = (attribute(node, "className") || "").split(/\s+/).includes("ke-tile");
      if (visual || rail) articles.push({ node, presentation: visual ? "visual" : "rail" });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(articles.length, 2);
  for (const { node, presentation } of articles) {
    const markup = node.getText(source);
    assert.equal((markup.match(/data-ke="card-view-details"/g) || []).length, 1, presentation);
    assert.equal((markup.match(/t\("viewDetails"\)/g) || []).length, 2, presentation);
    assert.equal((markup.match(/<SaveListingButton\b/g) || []).length, 1, presentation);
    assert.match(markup, /parentActions \? <SaveListingButton/);
    assert.doesNotMatch(markup, /card-book-tour|card-request-info|card-join-waitlist|ClaimListingCta|CompareChip|ShareListingButton/);
  }
  assert.match(card, /to=\{localePath\(`\/daycare\/\$\{slug\}`, locale\)\}/);
  assert.match(card, /label=\{`\$\{t\("viewDetails"\)\} · \$\{name\}`\}/);
  assert.doesNotMatch(card, /search=|hash=/);
  assert.doesNotMatch(card, /className="ke-tile group relative w-full"/);
});
