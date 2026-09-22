import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Explore hides empty category rails and keeps #209 single-bar filters", () => {
  const rails = src("src/components/explore-category-rails.tsx");
  const search = src("src/routes/search.tsx");
  const bar = src("src/components/explore-filter-bar.tsx");
  const origin = src("src/lib/default-origin.ts");

  assert.match(rails, /showOpenings/);
  assert.match(rails, /openingsSelected \|\| \(!filtered && openings\.length > 0\)/);
  assert.match(rails, /persist=\{forced\}/);
  assert.match(search, /preferCompleteCards/);
  assert.match(search, /h-\[min\(40dvh,22rem\)\]/);
  assert.doesNotMatch(search, /62dvh/);
  assert.doesNotMatch(search, /lg:h-\[70vh\]/);
  assert.match(bar, /data-ke="explore-map-toggle"/);
  assert.match(bar, /data-search-row="filter-bar"/);
  assert.doesNotMatch(search, /data-search-row="live-filters-map"/);
  assert.match(origin, /WINNIPEG/);
  assert.match(origin, /America\/Winnipeg/);
});

test("Cards quiet overlapping labels and keep a reserved photo aspect", () => {
  const card = src("src/components/daycare-card.tsx");
  const badges = src("src/components/listing-badges.tsx");
  const carousel = src("src/components/photo-carousel.tsx");
  const photo = src("src/components/building-photo.tsx");
  const css = src("src/styles.css");

  assert.match(card, /hollowPhoto/);
  assert.match(card, /photoPending/);
  assert.match(card, /!compact \? \(/);
  assert.match(card, /rounded-\[14px\]/);
  assert.match(badges, /!compact \? <GuestFavoriteBadge/);
  assert.match(carousel, /ListingPhotoFallback/);
  assert.match(carousel, /isRealListingPhoto/);
  assert.match(photo, /data-ke="photo-fallback"/);
  assert.match(photo, /aspectRatio/);
  assert.match(css, /--color-soft: #eef2fb/);
  assert.match(css, /contain-intrinsic-size: var\(--ke-card-w, 11\.25rem\) 16rem;/);
});

test("Listing has one primary CTA, sticky enquire, and a hero that shares the title", () => {
  const listing = src("src/routes/daycare.$slug.tsx");
  const more = src("src/components/listing-more-actions.tsx");
  const copy = src("src/lib/copy.ts");

  assert.match(listing, /data-ke="listing-primary-cta"/);
  assert.match(listing, /data-ke="listing-sticky-cta"/);
  assert.match(listing, /ListingMoreActions/);
  assert.match(listing, /ke-listing-hero/);
  assert.match(src("src/styles.css"), /aspect-ratio: 2 \/ 1/);
  assert.doesNotMatch(listing, /md:aspect-\[2\/1\]/);
  assert.match(listing, /lg:grid-cols-\[minmax\(0,1\.15fr\)_minmax\(16rem,20rem\)\]/);
  assert.match(listing, /claimCtaShort/);
  assert.doesNotMatch(listing, /<CompareChip/);
  assert.match(more, /data-ke="listing-more"/);
  assert.match(copy, /listingMore: "More"/);
  assert.match(copy, /listingMore: "Plus"/);
});

test("Home is search-first above the fold with one primary", () => {
  const home = src("src/routes/index.tsx");
  const hero = home.slice(home.indexOf("from-soft"), home.indexOf("id=\"how\""));
  assert.match(hero, /locationForm/);
  assert.match(hero, /from-soft/);
  assert.match(home, /HomePopularCities/);
  assert.doesNotMatch(hero, /hero-trust-chips/);
  assert.doesNotMatch(hero, /howItWorksCta/);
  assert.doesNotMatch(hero, /requestDeviceLocation/);
  assert.doesNotMatch(hero, /size="lg"/);
});
