import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { syncMasterCatalogue } from "../src/lib/catalog-master-sync.ts";
import { catalogRowsForSeed } from "../src/lib/catalog-seed.ts";
import { decideListingLoader } from "../src/lib/listing-not-found.ts";
import { hiddenReviewPlaceFromRow } from "../src/lib/hidden-review.ts";
import { isRemovedListing, REMOVED_LISTING_FAULT } from "../src/lib/listing-removed.ts";
import { hideListingFromPublicPage, isPublicListing, PUBLIC_LISTING_SQL } from "../src/lib/listing-visibility.ts";
import { publicSitemapSlugs } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const removed = {
  id: "mx-09f81152743c",
  slug: "rupinder-singh-1152743c",
  name: "Rupinder Singh",
  licenseNumber: "MB|home-rupinder-singh",
  city: "Winnipeg",
  province: "MB",
};

test("Rupinder Singh is blocked by id, slug, and registry facility id", () => {
  assert.equal(isRemovedListing({ id: "mx-09f81152743c" }), true);
  assert.equal(isRemovedListing({ slug: "rupinder-singh-1152743c" }), true);
  assert.equal(isRemovedListing({ facilityId: "MB|home-rupinder-singh" }), true);
  assert.equal(isRemovedListing({ licenseNumber: "MB|home-rupinder-singh" }), true);
  assert.equal(isRemovedListing({ id: "mb-1", slug: "other-centre" }), false);
  assert.equal(isPublicListing(removed), false);
  assert.equal(hideListingFromPublicPage(removed, { admin: true }), true);
  assert.equal(publicSitemapSlugs([removed]).length, 0);
  assert.match(PUBLIC_LISTING_SQL, /mx-09f81152743c/);
  assert.match(PUBLIC_LISTING_SQL, /rupinder-singh-1152743c/);
  assert.match(PUBLIC_LISTING_SQL, /MB\|home-rupinder-singh/);
});

test("the listing URL is a 404, not a city redirect", () => {
  assert.equal(hiddenReviewPlaceFromRow({
    city: "Winnipeg",
    province: "MB",
    importFault: REMOVED_LISTING_FAULT,
    mergedInto: null,
  }), null);
  const decision = decideListingLoader("rupinder-singh-1152743c", null, null);
  assert.equal(decision.type, "not-found");
});

test("registry import does not bring the facility back", () => {
  const csv = [
    "facility_id,name,city,province,postal_code,licence_number",
    "MB|home-rupinder-singh,Rupinder Singh,Winnipeg,MB,R3W 0A4,MB|home-rupinder-singh",
    "MB|other-home,Other Home,Winnipeg,MB,R3C 0A1,MB-2",
  ].join("\n");
  const plan = syncMasterCatalogue([], csv);
  assert.equal(plan.rows.some((row) => row.id === "mx-09f81152743c"), false);
  assert.equal(plan.rows.some((row) => row.slug === "rupinder-singh-1152743c"), false);
  assert.equal(plan.rows.length, 1);
  const seeded = catalogRowsForSeed([
    removed,
    { id: "mb-2", slug: "other-home", name: "Other Home", province: "MB" },
  ]);
  assert.equal(seeded.some((row) => row.id === "mx-09f81152743c"), false);
  assert.equal(seeded.length, 1);
});

test("migration retires the row and keeps a rollback", () => {
  const sql = readFileSync(join(root, "migrations/0098_hide_rupinder_singh_address.sql"), "utf8");
  assert.match(sql, /privacy_removed/);
  assert.match(sql, /listing_active = 0/);
  assert.match(sql, /claim_status = 'superseded'/);
  assert.match(sql, /mx-09f81152743c/);
  assert.match(sql, /MB\|home-rupinder-singh/);
  assert.match(sql, /72 Rutledge Crescent/);
  assert.match(sql, /R3W 0A4/);
  assert.doesNotMatch(sql, /merged_into =/);
});
