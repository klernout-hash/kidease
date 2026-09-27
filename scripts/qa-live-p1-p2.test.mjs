import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { featuredHomeAgreement } from "../src/lib/home-live-strip.ts";
import {
  MAP_SCRIPT_WAIT_MS,
  MAP_VIEW_WAIT_MS,
  MAPS_LOAD_BUDGET_MS,
  claimMapsScriptSlot,
  mapsNamespaceReady,
  nextMapsRetryDelayMs,
} from "../src/lib/google-maps.ts";
import { isFailedPhotoUrl, rememberFailedPhoto } from "../src/lib/listing-photo.ts";
import { PROVIDER_ADDONS, PROVIDER_PLANS, planPriceHint } from "../src/lib/provider-plans.ts";
import { formatPlanCad } from "../src/lib/upgrade-plans.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Maps loader waits for Map, retries once, and does not inject a second script", () => {
  assert.equal(MAP_SCRIPT_WAIT_MS, 12_000);
  assert.equal(MAPS_LOAD_BUDGET_MS, 24_000);
  assert.ok(MAP_VIEW_WAIT_MS > MAPS_LOAD_BUDGET_MS);
  assert.equal(nextMapsRetryDelayMs(0), 500);
  assert.equal(nextMapsRetryDelayMs(1), 1_500);
  assert.equal(nextMapsRetryDelayMs(2), null);
  assert.equal(mapsNamespaceReady(null), false);
  assert.equal(mapsNamespaceReady({}), false);
  assert.equal(mapsNamespaceReady({ Map: function Map() {} }), true);
  assert.equal(claimMapsScriptSlot({ getElementById: () => null }), "inject");
  assert.equal(claimMapsScriptSlot({ getElementById: () => ({ id: "kidease-google-maps-js" }) }), "pending");

  const maps = src("src/lib/google-maps.ts");
  assert.match(maps, /importLibrary\("maps"\)/);
  assert.match(maps, /callback=/);
  assert.match(maps, /claimMapsScriptSlot/);
  assert.match(maps, /loading=async/);
  assert.doesNotMatch(maps, /Google Maps script loaded without google\.maps/);
  assert.equal((maps.match(/document\.head\.appendChild\(script\)/g) ?? []).length, 1);
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
