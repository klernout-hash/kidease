import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("THIS WEEK acceptance: age+start+place gate, hollow-free rails, Top7, vacancy, request, compare, 23927", () => {
  const helpers = src("src/lib/now-loops.ts");
  const search = src("src/routes/search.tsx");
  const home = src("src/routes/index.tsx");
  const chips = src("src/components/explore-category-chips.tsx");
  const cats = src("src/lib/explore-categories.ts");
  const listing = src("src/routes/daycare.$slug.tsx");
  const compare = src("src/routes/compare.tsx");
  const card = src("src/components/daycare-card.tsx");
  const shell = src("src/components/shell.tsx");
  const copy = src("src/lib/copy.ts");
  const flags = src("src/lib/flags.ts");
  const stats = JSON.parse(src("src/lib/data/catalog-stats.json"));
  const readiness = src("src/lib/listing-readiness.ts");
  const care = src("src/lib/care-type.ts");

  assert.equal(stats.masterRows, 23927);

  assert.match(helpers, /searchFiltersReady/);
  assert.match(helpers, /hasPlaceForSearch/);
  assert.match(helpers, /isLiveLookingCard/);
  assert.match(helpers, /honestVacancy/);
  assert.match(helpers, /homeRailItems/);
  assert.match(helpers, /WINNIPEG_LIVE_LOOKING_RAIL_MIN = 0\.8/);
  assert.match(search, /located/);
  assert.match(search, /splitSearchResults/);
  assert.match(search, /search_filters_applied/);
  assert.match(search, /search_results_shown/);
  assert.match(search, /ExploreCategoryChips/);
  assert.match(search, /listingMatchesExploreFilter/);
  assert.match(search, /n_age_unknown/);
  assert.match(search, /showSearchEmpty/);
  assert.doesNotMatch(search, /ExploreRails/);
  assert.doesNotMatch(search, /FacilityTypeRails/);

  assert.match(home, /homeRailItems/);
  assert.match(chips, /visibleExploreCategories/);
  assert.match(cats, /listingAgeUnknown/);
  assert.match(care, /hasConfirmedAges/);
  assert.match(readiness, /agesKnown === false/);
  assert.match(readiness, /Boolean\(d\.feeConfirmed\) \|\| hasListedFees\(d\)/);

  assert.match(listing, /requestTour/);
  assert.match(listing, /claimCta/);
  assert.match(listing, /unclaimedRequestNote/);
  assert.match(copy, /no director reply/);
  assert.match(src("src/components/request-tour.tsx"), /listing_request_submitted/);
  assert.match(src("src/components/request-spot.tsx"), /listing_request_submitted/);
  assert.match(src("src/routes/provider.tsx"), /provider_request_opened/);
  assert.match(src("src/components/daycare-lead-inbox.tsx"), /providerRequestsEmpty/);

  assert.match(card, /CompareChip/);
  assert.match(listing, /CompareChip/);
  assert.match(shell, /to: "\/compare"/);
  assert.match(compare, /compareFeesCwelcc/);
  assert.match(compare, /compareVacancy/);
  assert.match(compare, /comparePhoto/);
  assert.match(compare, /license/);

  assert.match(src("src/components/director-pro-strip.tsx"), /proWhyViews/);
  assert.match(src("src/components/director-pro-strip.tsx"), /proWhyRequests/);
  assert.match(copy, /Pro is useful once families are requesting/);

  assert.match(flags, /FEATURE_INAPP_CHAT: false/);
  assert.match(flags, /FEATURE_PUSH: false/);
  assert.match(flags, /FEATURE_SMS: false/);
  assert.match(flags, /FEATURE_VIDEO: false/);
  assert.doesNotMatch(helpers, /FEATURE_INAPP_CHAT/);
});
