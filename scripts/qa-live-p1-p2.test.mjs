import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { featuredHomeAgreement } from "../src/lib/home-live-strip.ts";
import { MAP_LOAD_TIMEOUT, MAP_STYLE_WAIT_MS, MAP_VIEW_WAIT_MS } from "../src/lib/osm-map.ts";
import { isFailedPhotoUrl, rememberFailedPhoto } from "../src/lib/listing-photo.ts";
import { PROVIDER_ADDONS, PROVIDER_PLANS, planPriceHint } from "../src/lib/provider-plans.ts";
import { formatPlanCad } from "../src/lib/upgrade-plans.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("the map waits for OpenFreeMap tiles and does not load Google Maps", () => {
  assert.equal(MAP_STYLE_WAIT_MS, 12_000);
  assert.ok(MAP_VIEW_WAIT_MS > MAP_STYLE_WAIT_MS);
  assert.equal(MAP_LOAD_TIMEOUT, "Map timed out");
  const maps = src("src/lib/osm-map.ts");
  assert.match(maps, /tiles\.openfreemap\.org/);
  assert.match(maps, /preloadOsmMap/);
  assert.doesNotMatch(maps, /maps\.googleapis\.com/);
  assert.doesNotMatch(maps, /document\.head\.appendChild\(script\)/);
  const view = src("src/components/map-view.tsx");
  assert.match(view, /createKidEaseMap/);
  assert.match(view, /setLoadGen/);
  assert.doesNotMatch(view, /loadGoogleMaps/);
});

test("featured chip and section share one count and hide together at zero", () => {
  const empty = featuredHomeAgreement(0);
  assert.equal(empty.showChip, false);
  assert.equal(empty.showSection, false);
  const twelve = featuredHomeAgreement(12);
  assert.equal(twelve.showChip, true);
  assert.equal(twelve.showSection, true);
  assert.equal(twelve.count, 12);

  const home = src("src/routes/index.tsx");
  const daycares = src("src/lib/server/daycares.ts");
  assert.match(home, /featuredHomeAgreement\(publicFeatured\.length\)/);
  assert.match(home, /featuredAgreement\.showChip/);
  assert.match(home, /featuredAgreement\.showSection/);
  assert.match(home, /radiusKm: 25/);
  assert.match(home, /radiusKm,/);
  assert.match(home, /skipLiveLooking/);
  assert.match(home, /homeRailItems/);
  assert.match(daycares, /clampRadiusKm\(Number\(input\.radiusKm\) \|\| 25\)/);
  assert.doesNotMatch(daycares, /radiusKm: 40/);
});

test("Promote reads the Stripe catalogue and does not grant priority weeks", () => {
  const panel = src("src/components/provider-listing-forms.tsx");
  const promos = src("src/lib/server/promos.ts");
  assert.match(panel, /PROVIDER_PLANS/);
  assert.match(panel, /PROVIDER_ADDONS/);
  assert.match(panel, /planPriceHint/);
  assert.match(panel, /formatPlanCad/);
  assert.match(panel, /startProviderCheckout/);
  assert.match(panel, /startProviderAddonCheckout/);
  assert.match(panel, /openStripeCheckout/);
  assert.doesNotMatch(panel, /PROMO_PLANS/);
  assert.doesNotMatch(panel, /promoteListing/);
  assert.match(promos, /Priority weeks are not in the Stripe catalogue/);
  assert.doesNotMatch(promos, /insert into listing_promos/);

  assert.deepEqual(
    PROVIDER_PLANS.map((plan) => planPriceHint(plan, "month", "en")),
    ["CA$0/month", "CA$49/month", "CA$39/site/month"],
  );
  assert.deepEqual(
    PROVIDER_ADDONS.map((addon) => `${addon.id}:${formatPlanCad(addon.amount, "en")}:${addon.cadence}`),
    ["featured_city:CA$29:month", "claim_boost:CA$99:once", "job_post:CA$49:once"],
  );
});

test("a 404 photo is flagged and the next render skips it", () => {
  const url = "/photos/buildings/qa-missing-404.jpg";
  assert.equal(isFailedPhotoUrl(url), false);
  rememberFailedPhoto(url);
  assert.equal(isFailedPhotoUrl(url), true);
  const carousel = src("src/components/photo-carousel.tsx");
  const listing = src("src/components/listing-carousel.tsx");
  assert.match(carousel, /isFailedPhotoUrl/);
  assert.match(listing, /ListingPhotoFallback/);
  assert.doesNotMatch(listing, /storefront-placeholder-480\.webp/);
  const copy = src("src/lib/copy.ts");
  assert.doesNotMatch(copy, /Every listing shows a real photo/);
  assert.doesNotMatch(copy, /Chaque fiche montre une vraie photo du lieu/);
  assert.match(copy, /so you can recognise the location/);
});
