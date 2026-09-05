import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GHOST_LISTING } from "../src/lib/ghost-listing.ts";
import {
  isAdminOnlyListing,
  isPublicListing,
  listingVisibilityOf,
  publicListings,
} from "../src/lib/listing-visibility.ts";
import { turnstileMode } from "../src/lib/turnstile-mode.ts";

test("ghost claim lab is admin-only by slug, licence, id, and title", () => {
  assert.equal(isAdminOnlyListing(GHOST_LISTING), true);
  assert.equal(isAdminOnlyListing({ slug: "test-ghost-claim-lab" }), true);
  assert.equal(isAdminOnlyListing({ licenseNumber: "TEST-GHOST-0001" }), true);
  assert.equal(isAdminOnlyListing({ id: "ke-test-ghost-001" }), true);
  assert.equal(isAdminOnlyListing({ name: "TEST Ghost Claim Lab" }), true);
  assert.equal(isPublicListing(GHOST_LISTING), false);
  assert.equal(listingVisibilityOf(GHOST_LISTING), "admin_only");
});

test("durable visibility / is_test flags hide listings without hardcoding slug", () => {
  assert.equal(isAdminOnlyListing({ slug: "any-centre", visibility: "admin_only" }), true);
  assert.equal(isAdminOnlyListing({ slug: "any-centre", isTest: true }), true);
  assert.equal(isAdminOnlyListing({ slug: "any-centre", isTest: 1 }), true);
  assert.equal(isPublicListing({ slug: "bonnie-bairns-childcare-services-1", name: "Bonnie Bairns" }), true);
  assert.equal(listingVisibilityOf({ slug: "bonnie-bairns-childcare-services-1" }), "public");
});

test("publicListings drops the QA ghost from homepage / search / map payloads", () => {
  const rows = publicListings([
    { id: "bc-1", slug: "bonnie-bairns-childcare-services-1", name: "Bonnie Bairns" },
    GHOST_LISTING,
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slug, "bonnie-bairns-childcare-services-1");
});

test("Turnstile enforces only in Vercel production when both keys are set", () => {
  assert.equal(turnstileMode({ siteKey: "", secretKey: "", production: true }), "off");
  assert.equal(turnstileMode({ siteKey: "site", secretKey: "", production: true }), "off");
  assert.equal(turnstileMode({ siteKey: "site", secretKey: "secret", production: false }), "optional");
  assert.equal(turnstileMode({ siteKey: "site", secretKey: "secret", production: true }), "enforce");
});

test("nearby SQL excludes admin-only and test rows so map pins stay clean", () => {
  const nearby = readFileSync(new URL("../src/lib/server/nearby.ts", import.meta.url), "utf8");
  assert.match(nearby, /coalesce\(visibility, 'public'\) = 'public'/);
  assert.match(nearby, /coalesce\(is_test, 0\) = 0/);
});

test("catalogue extra file marks the ghost admin_only", () => {
  const extra = JSON.parse(
    readFileSync(new URL("../src/lib/data/centres-extra-1.json", import.meta.url), "utf8"),
  );
  assert.equal(extra[0].slug, "test-ghost-claim-lab");
  assert.equal(extra[0].visibility, "admin_only");
  assert.equal(extra[0].isTest, true);
});

test("request-guard 404s the same QA slugs the catalogue hides", () => {
  const guard = readFileSync(new URL("./request-guard.mjs", import.meta.url), "utf8");
  assert.match(guard, /HIDDEN_LISTING_SLUGS/);
  assert.match(guard, /test-ghost-claim-lab/);
  assert.match(guard, /ke-test-ghost-001/);
  assert.match(guard, /action: "not_found"/);
  const middleware = readFileSync(
    new URL("../server/middleware/request-guard.ts", import.meta.url),
    "utf8",
  );
  assert.match(middleware, /decision\.action === "not_found"/);
});
