import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { directoryCountsFromRows } from "../src/lib/city-directory.ts";
import { hiddenDuplicateKeeper, isHiddenDuplicateSlug } from "../src/lib/hidden-duplicates.ts";
import { decideListingLoader } from "../src/lib/listing-not-found.ts";
import {
  isPublicListing,
  PUBLIC_LISTING_SQL,
  publicListings,
} from "../src/lib/listing-visibility.ts";
import { normalizeListingSlug } from "../src/lib/listing-slug.ts";
import { isSafeSitemapSlug, publicSitemapSlugs } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const TORONTO_DUPLICATE = "abacus-montessori-learning-centre-9995";
const TORONTO_KEEPER = "abacus-montessori-learning-centre-58614";
const EDMONTON_DUPLICATE = "a-place-to-grow-early-learning-and-care-4946b0c5";
const EDMONTON_KEEPER = "a-place-to-grow-early-learning-and-care-118C77D0";

function catalogueRows() {
  return [
    { slug: "sunny-side-child-care", name: "Sunny Side", city: "Toronto", province: "ON" },
    { slug: TORONTO_DUPLICATE, name: "Abacus copy", city: "Toronto", province: "ON" },
    { slug: TORONTO_KEEPER, name: "Abacus", city: "Toronto", province: "ON" },
    { slug: EDMONTON_DUPLICATE, name: "Grow copy", city: "Edmonton", province: "AB" },
    { slug: EDMONTON_KEEPER, name: "Grow", city: "Edmonton", province: "AB" },
    { slug: "declined-centre", name: "Declined House", city: "Toronto", province: "ON", claimStatus: "declined" },
    { slug: "us-austin-kids", name: "Austin Kids", city: "Austin", province: "TX", factSource: "kidease-us" },
    { slug: "qa-lab-daycare", name: "QA Lab Daycare", city: "Toronto", province: "ON" },
    { slug: "merged-copy", name: "Merged Copy", city: "Edmonton", province: "AB", mergedInto: "keeper" },
    { slug: "paused-centre", name: "Paused House", city: "Toronto", province: "ON", listingActive: 0 },
    {
      slug: "test-ghost-claim-lab",
      name: "Ghost",
      city: "Toronto",
      province: "ON",
      visibility: "admin_only",
      isTest: true,
    },
    { slug: "kids-world-daycare-kh2t", name: "Kids World Daycare", city: "Edmonton", province: "AB" },
  ];
}

test("sitemap listing count matches public search for the same rows", () => {
  const rows = catalogueRows();
  const searchSlugs = [
    ...new Set(
      publicListings(rows)
        .map((row) => normalizeListingSlug(row.slug || ""))
        .filter((slug) => isSafeSitemapSlug(slug))
        .map((slug) => slug.toLowerCase()),
    ),
  ].sort();
  const sitemap = publicSitemapSlugs(rows, 1000).map((slug) => slug.toLowerCase()).sort();
  assert.equal(sitemap.length, searchSlugs.length);
  assert.deepEqual(sitemap, searchSlugs);
  assert.equal(sitemap.includes(TORONTO_DUPLICATE), false);
  assert.equal(sitemap.includes(EDMONTON_DUPLICATE), false);
  assert.equal(sitemap.includes("us-austin-kids"), false);
  assert.equal(sitemap.includes("declined-centre"), false);
  assert.equal(sitemap.includes("qa-lab-daycare"), false);
  assert.equal(sitemap.includes("kids-world-daycare-kh2t"), true);
  assert.equal(isPublicListing({ slug: "kids-world-daycare-kh2t", name: "Kids World Daycare", province: "AB" }), true);
  assert.equal(isHiddenDuplicateSlug("kids-world-daycare-kh2t"), false);
});

test("Toronto and Edmonton hub counts are distinct public centres", () => {
  const counts = directoryCountsFromRows(catalogueRows());
  assert.equal(counts.hubs.toronto, 2);
  assert.equal(counts.hubs.edmonton, 2);
  assert.equal(hiddenDuplicateKeeper(TORONTO_DUPLICATE), TORONTO_KEEPER);
  assert.equal(hiddenDuplicateKeeper(EDMONTON_DUPLICATE), EDMONTON_KEEPER);
  assert.equal(decideListingLoader(TORONTO_DUPLICATE, { slug: TORONTO_DUPLICATE }, null).type, "redirect-keeper");
  assert.equal(decideListingLoader(TORONTO_DUPLICATE, { slug: TORONTO_DUPLICATE }, null).slug, TORONTO_KEEPER);
  assert.equal(decideListingLoader(TORONTO_KEEPER, { slug: TORONTO_KEEPER }, null).type, "render");
});

test("public SQL uses the same visibility gates as search", () => {
  assert.match(PUBLIC_LISTING_SQL, /declined/);
  assert.match(PUBLIC_LISTING_SQL, /superseded/);
  assert.match(PUBLIC_LISTING_SQL, /kidease-us/);
  assert.match(PUBLIC_LISTING_SQL, /abacus-montessori-learning-centre-9995/);
  assert.doesNotMatch(PUBLIC_LISTING_SQL, /'kids-world-daycare-kh2t'/);
  const sql = readFileSync(join(root, "src/lib/server/catalog-neon.ts"), "utf8");
  assert.match(sql, /count\(distinct lower\(btrim\(slug\)\)\)/);
  const middleware = readFileSync(join(root, "server/middleware/sitemap.ts"), "utf8");
  assert.match(middleware, /publicSitemapSlugs/);
  assert.doesNotMatch(middleware, /mergeListingSitemapSlugs/);
});
