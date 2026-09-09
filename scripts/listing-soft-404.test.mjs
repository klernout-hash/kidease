import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { decideRequest, isHiddenListingSlug } from "./request-guard.mjs";
import {
  LISTING_NOT_FOUND_TITLE,
  listingNotFoundHead,
  shouldNotFoundListing,
} from "../src/lib/listing-not-found.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("missing listing SEO is a hard 404, not a Licensed daycare title", () => {
  assert.equal(shouldNotFoundListing(null), true);
  assert.equal(shouldNotFoundListing({}), true);
  assert.equal(shouldNotFoundListing({ slug: "" }), true);
  assert.equal(shouldNotFoundListing({ slug: "sunny-side-child-care" }), false);
  assert.equal(LISTING_NOT_FOUND_TITLE, "Listing not found · KidEase");
  assert.match(listingNotFoundHead().meta[0].title, /Listing not found/);
  assert.doesNotMatch(LISTING_NOT_FOUND_TITLE, /Licensed daycare/);
});

test("daycare loader throws notFound and never falls back to slug titles", () => {
  const route = src("src/routes/daycare.$slug.tsx");
  assert.match(route, /throw notFound\(\)/);
  assert.match(route, /isNotFound/);
  assert.match(route, /notFoundComponent:\s*ListingNotFoundPage/);
  assert.match(route, /listingNotFoundHead/);
  assert.doesNotMatch(route, /listingPageMeta\(\{\s*slug:/);
  assert.doesNotMatch(route, /Licensed daycare/);
  assert.match(src("src/router.tsx"), /defaultNotFoundComponent:\s*DefaultNotFound/);
});

test("request-guard 404s QA ghost slugs including test-ghost", () => {
  assert.equal(isHiddenListingSlug("test-ghost"), true);
  assert.equal(isHiddenListingSlug("test-ghost-claim-lab"), true);
  assert.equal(isHiddenListingSlug("ke-test-ghost-001"), true);
  assert.equal(isHiddenListingSlug("bonnie-bairns-childcare-services-1"), false);
  assert.deepEqual(decideRequest({ host: "www.kidease.ca", pathname: "/daycare/test-ghost" }), {
    action: "not_found",
    status: 404,
  });
  assert.deepEqual(
    decideRequest({ host: "www.kidease.ca", pathname: "/daycare/totally-fake-slug-xyz-99999" }),
    { action: "next" },
  );
});
