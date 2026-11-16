import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { planApproval } from "../src/lib/approve-live.ts";
import { geocode } from "../src/lib/geo.ts";
import {
  hideListingFromPublicPage,
  isAdminOnlyListing,
  isPublicListing,
  PUBLIC_LISTING_SQL,
} from "../src/lib/listing-visibility.ts";
import { publicSitemapSlugs } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");
const winnipeg = geocode("Winnipeg");

const claims = [{ id: "cl-qa", status: "waiting", createdAt: "2026-11-16T13:21:55.000Z" }];

const realCentre = {
  id: "ab-real",
  daycareId: "ab-real",
  slug: "kids-world-daycare-kh2t",
  name: "Kids World Daycare",
  city: "Edmonton",
  province: "AB",
  lat: 53.5461,
  lng: -113.4938,
  licenseNumber: "70051797",
  licenseStatus: "unverified",
  screeningOnFile: false,
  staffScreeningAttested: false,
  visibility: "public",
  isTest: 0,
  claimStatus: "waiting",
  claimedAt: null,
  listingActive: true,
  ratingX10: 0,
  reviewCount: 0,
};

const qaCentre = {
  id: "d_3plahsnplst5",
  daycareId: "d_3plahsnplst5",
  slug: "kidease-qa-test-centre-do-not-book-lst5",
  name: "KidEase QA Test Centre (do not book)",
  city: "Winnipeg",
  province: "MB",
  lat: winnipeg.lat,
  lng: winnipeg.lng,
  licenseNumber: "TEST-0000",
  licensePhoto: null,
  licenseStatus: "unverified",
  screeningOnFile: false,
  staffScreeningAttested: false,
  visibility: "admin_only",
  isTest: 1,
  claimStatus: "waiting",
  claimedAt: null,
  listingActive: true,
  ratingX10: 0,
  reviewCount: 0,
};

test("a real centre is still refused without screening", () => {
  const plan = planApproval(realCentre, claims);
  assert.equal(plan.ok, false);
  assert.equal(plan.next, null);
  assert.equal(plan.qaGateBypass, false);
  assert.ok(plan.health.failed.includes("screening"));
  assert.ok(plan.health.failed.includes("trust"));
});

test("a QA fixture can be approved without screening and stays off public surfaces", () => {
  const plan = planApproval(qaCentre, claims);
  assert.equal(plan.ok, true);
  assert.equal(plan.qaGateBypass, true);
  assert.equal(plan.next?.claimStatus, "approved");
  assert.equal(isAdminOnlyListing(plan.next), true);
  assert.equal(isPublicListing(plan.next), false);
  assert.equal(hideListingFromPublicPage(plan.next, false), true);
  assert.deepEqual(publicSitemapSlugs([plan.next]), []);
  assert.match(PUBLIC_LISTING_SQL, /coalesce\(is_test, 0\) = 0/);
  assert.match(PUBLIC_LISTING_SQL, /TEST-%/);
  assert.match(PUBLIC_LISTING_SQL, /qa test/);
  assert.match(
    plan.health.checks.find((check) => check.id === "screening")?.detail || "",
    /screening attestation was not required/,
  );
  assert.match(
    plan.health.checks.find((check) => check.id === "trust")?.detail || "",
    /trust eligibility was not required/,
  );

  const approve = src("src/lib/server/approve-centre.ts");
  assert.match(approve, /qa_approve_bypass/);
  assert.match(approve, /writeTrustEvent/);
  assert.match(approve, /visibility = \$\{visibility\}/);
  assert.match(approve, /is_test = \$\{isTest\}/);
  assert.match(src("src/lib/server/family.ts"), /isAdminOnlyListing/);
  assert.match(src("src/lib/server/map-pins.ts"), /PUBLIC_LISTING_SQL/);
  assert.match(src("src/lib/sitemap.ts"), /isPublicListing/);
});
