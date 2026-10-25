import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hasAmenity } from "../src/lib/licensing.ts";
import {
  hideListingFromPublicPage,
  isHiddenTestListing,
  isPublicListing,
  publicListings,
} from "../src/lib/listing-visibility.ts";
import { applyMasterCareType, masterCareKey } from "../src/lib/server/master-care-type.ts";
import { asList, uniqueById } from "../src/lib/utils.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("null catalogue fields do not throw while mapping a listing", () => {
  assert.equal(masterCareKey(null, null, null), "||");
  const kept = applyMasterCareType({
    name: null,
    province: null,
    postalCode: null,
    amenities: null,
    facilityType: "child_care_centre",
  });
  assert.equal(kept.amenities, "");
  assert.equal(hasAmenity(null, "extended"), false);
  assert.deepEqual(publicListings(null), []);
  assert.deepEqual(uniqueById(null), []);
  assert.deepEqual(asList(undefined), []);
});

test("a flagged test account can open a hidden QA listing", () => {
  const qa = {
    id: "d1",
    slug: "qa-test-daycare-listing-zitu",
    name: "QA TEST Daycare Listing",
    visibility: "admin_only",
    isTest: 1,
    province: "MB",
  };
  assert.equal(isHiddenTestListing(qa), true);
  assert.equal(isPublicListing(qa), false);
  assert.equal(hideListingFromPublicPage(qa, false), true);
  assert.equal(hideListingFromPublicPage(qa, { testAccount: true }), false);
  assert.equal(hideListingFromPublicPage(qa, true), false);

  const catalogueException = {
    ...qa,
    slug: "qa-test-daycare-listing-z5hz",
    listingActive: false,
  };
  assert.equal(hideListingFromPublicPage(catalogueException, false), true);
  assert.equal(hideListingFromPublicPage(catalogueException, { testAccount: true }), false);

  const pausedReal = {
    id: "real",
    slug: "sunny-days-centre",
    name: "Sunny Days",
    province: "MB",
    listingActive: false,
  };
  assert.equal(hideListingFromPublicPage(pausedReal, { testAccount: true }), true);
  const gate = readFileSync(join(root, "src/lib/server/public-listing.ts"), "utf8");
  assert.match(gate, /export function profileIsTestAccount/);
  assert.match(gate, /value === true \|\| value === 1 \|\| value === "1"/);
  assert.match(gate, /callerMayUseAdminOnlyListing/);
});

test("test fixtures stay out of the public search memo and the sitemap", () => {
  const search = readFileSync(join(root, "src/lib/server/daycares.ts"), "utf8");
  const memo = search.indexOf("rememberSearch");
  const append = search.indexOf("appendTestAccountFixtures");
  assert.ok(memo > 0 && append > memo);
  assert.match(search, /callerIsTestAccount/);
  const visibility = readFileSync(join(root, "src/lib/listing-visibility.ts"), "utf8");
  assert.match(visibility, /qa-/);
  assert.doesNotMatch(readFileSync(join(root, "src/lib/server/claims.ts"), "utf8"), /callerMayUseAdminOnlyListing/);
});
