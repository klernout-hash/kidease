import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GHOST_LISTING } from "../src/lib/ghost-listing.ts";
import {
  isAdminOnlyListing,
  isPublicListing,
  listingVisibilityForOwners,
  listingVisibilityOf,
  listingVisibilityWrite,
  looksLikeTestFixture,
  providerDeskShowsListing,
  PUBLIC_LISTING_SQL,
  publicListings,
  QA_FIXTURE_NAME_RE,
  QA_FIXTURE_SLUG_RE,
  staffQueueRows,
} from "../src/lib/listing-visibility.ts";
import { allowSeedTestListings, catalogRowsForSeed } from "../src/lib/catalog-seed.ts";
import { turnstileMode } from "../src/lib/turnstile-mode.ts";

test("invited staff still see Ghost Claim Lab on the daycare desk", () => {
  assert.equal(
    providerDeskShowsListing(GHOST_LISTING, { owner: false, member: true }),
    true,
  );
  assert.equal(
    providerDeskShowsListing(GHOST_LISTING, { owner: true, member: true }),
    false,
  );
  assert.equal(
    providerDeskShowsListing(GHOST_LISTING, { owner: false, member: false }),
    false,
  );
  assert.equal(
    providerDeskShowsListing({ slug: "bonnie-bairns", name: "Bonnie Bairns" }, { owner: true, member: false }),
    true,
  );
});

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

test("TEST / ghost leftover rows are admin-only even when flags are missing", () => {
  assert.equal(looksLikeTestFixture({ name: "TEST Ghost Claim Lab" }), true);
  assert.equal(isAdminOnlyListing({ name: "TEST Extra Claim Lab" }), true);
  assert.equal(isAdminOnlyListing({ name: "Winnipeg Ghost Listing" }), true);
  assert.equal(isAdminOnlyListing({ id: "ke-test-copy-002" }), true);
  assert.equal(isAdminOnlyListing({ slug: "test-ghost" }), true);
  assert.equal(isAdminOnlyListing({ slug: "test-ghost-claim-lab-2" }), true);
  assert.equal(isAdminOnlyListing({ licenseNumber: "TEST-COPY-9" }), true);
  assert.equal(isAdminOnlyListing({ name: "TEST-Ghost copy" }), true);
  assert.equal(isAdminOnlyListing({ slug: "winnipeg-ghost-listing" }), true);
  assert.equal(isAdminOnlyListing({ address: "100 KidEase Test Lane" }), true);
  assert.equal(isAdminOnlyListing({ name: "QA TEST Daycare Listing" }), true);
  assert.equal(looksLikeTestFixture({ name: "QA TEST Daycare Listing" }), true);
  assert.equal(isPublicListing({ name: "Teston Child Care", slug: "teston-child-care" }), true);
  assert.equal(isPublicListing({ name: "Testing Academy Daycare", slug: "testing-academy" }), true);
  assert.equal(isPublicListing({ name: "Joan Kids World", slug: "joan-kids-world" }), true);
});

test("Title Case Test Test / qa- smoke slugs stay non-public even with public flags", () => {
  for (const slug of ["test-test-p23f", "test-test-nozo", "test-test-p2tk"]) {
    assert.equal(looksLikeTestFixture({ name: "Test Test", slug }), true);
    assert.equal(isPublicListing({ name: "Test Test", slug, visibility: "public", isTest: 0 }), false);
    assert.equal(isAdminOnlyListing({ slug, visibility: "public", isTest: 0 }), true);
    assert.equal(QA_FIXTURE_SLUG_RE.test(slug), true);
  }
  assert.equal(QA_FIXTURE_NAME_RE.test("Test Test"), true);
  assert.equal(QA_FIXTURE_NAME_RE.test("test"), true);
  assert.equal(QA_FIXTURE_NAME_RE.test("TEST-Ghost copy"), true);
  assert.equal(QA_FIXTURE_NAME_RE.test("Teston Child Care"), false);
  assert.equal(looksLikeTestFixture({ name: "qa-smoke centre", slug: "qa-smoke-centre" }), true);
  assert.equal(isPublicListing({ name: "QA Lab Daycare", slug: "qa-lab-daycare" }), false);
  assert.deepEqual(listingVisibilityWrite({ name: "Test Test", slug: "test-test-p23f" }), {
    visibility: "admin_only",
    isTest: 1,
  });
  assert.deepEqual(listingVisibilityWrite({ name: "Bonnie Bairns", slug: "bonnie-bairns" }), {
    visibility: "public",
    isTest: 0,
  });
});

test("production and Vercel Production never seed fixtures", () => {
  assert.equal(allowSeedTestListings({}), true);
  assert.equal(allowSeedTestListings({ VERCEL_ENV: "preview", NODE_ENV: "production" }), true);
  assert.equal(allowSeedTestListings({ VERCEL_ENV: "production" }), false);
  assert.equal(allowSeedTestListings({ NODE_ENV: "production" }), false);
  assert.equal(allowSeedTestListings({ NODE_ENV: "production", ALLOW_TEST_LISTINGS: "1" }), true);
  assert.equal(allowSeedTestListings({ VERCEL_ENV: "preview", ALLOW_TEST_LISTINGS: "0" }), false);
  const rows = catalogRowsForSeed([GHOST_LISTING, { slug: "bonnie", name: "Bonnie" }], {
    VERCEL_ENV: "production",
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slug, "bonnie");
});

test("Peninsula Oak is the same QA flag as Show QA fixtures, and Kids World stays public", () => {
  const oak = {
    id: "bc-3572",
    slug: "peninsula-montessori-academy-oak-3572",
    name: "Peninsula Montessori Academy Oak",
    licenseNumber: "3572",
    visibility: "public",
    isTest: 0,
  };
  assert.equal(looksLikeTestFixture(oak), true);
  assert.equal(isAdminOnlyListing(oak), true);
  assert.equal(isPublicListing(oak), false);
  assert.deepEqual(listingVisibilityWrite(oak), { visibility: "admin_only", isTest: 1 });
  assert.deepEqual(listingVisibilityForOwners(oak, ["kyle@kidease.ca"]), {
    visibility: "admin_only",
    isTest: 1,
  });
  assert.deepEqual(
    staffQueueRows([oak, { slug: "kids-world-daycare-kh2t", name: "Kids World Daycare" }], false).map((row) => row.slug),
    ["kids-world-daycare-kh2t"],
  );
  assert.equal(staffQueueRows([oak], true).length, 1);

  const kids = {
    id: "ab-kh2t",
    slug: "kids-world-daycare-kh2t",
    name: "Kids World Daycare",
    licenseNumber: "70051797",
  };
  assert.equal(isPublicListing(kids), true);
  assert.deepEqual(listingVisibilityForOwners(kids, ["kyle@kidease.ca"]), {
    visibility: "public",
    isTest: 0,
  });
  assert.deepEqual(listingVisibilityForOwners(
    { slug: "harbour-kids", name: "Harbour Kids", licenseNumber: "NS44821" },
    ["joan@example.com"],
  ), { visibility: "public", isTest: 0 });
  assert.deepEqual(listingVisibilityForOwners(
    { slug: "harbour-kids", name: "Harbour Kids", licenseNumber: "NS44821" },
    ["Kyle@KidEase.ca"],
  ), { visibility: "admin_only", isTest: 1 });

  assert.match(PUBLIC_LISTING_SQL, /peninsula-montessori-academy-oak-3572/);
  assert.match(PUBLIC_LISTING_SQL, /bc-3572/);
  const migration = readFileSync(new URL("../migrations/0055_hide_operator_qa_fixtures.sql", import.meta.url), "utf8");
  assert.match(migration, /kyle@kidease\.ca/);
  assert.match(migration, /is_test = 1/);
  assert.match(migration, /visibility = 'admin_only'/);
  assert.match(migration, /kids-world-daycare-kh2t/);
  assert.doesNotMatch(migration, /delete from daycares/i);
  const approve = readFileSync(new URL("../src/lib/server/approve-centre.ts", import.meta.url), "utf8");
  assert.match(approve, /listingVisibilityForOwners/);
  assert.match(approve, /is_test = \$\{flags\.isTest\}/);
  const desk = readFileSync(new URL("../src/lib/server/centre-access.ts", import.meta.url), "utf8");
  assert.doesNotMatch(desk, /PUBLIC_LISTING_SQL/);
  assert.doesNotMatch(desk, /is_test/);
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
  const nearby = readFileSync(new URL("../src/lib/server/catalog-neon.ts", import.meta.url), "utf8");
  assert.match(nearby, /PUBLIC_LISTING_SQL/);
  assert.match(PUBLIC_LISTING_SQL, /coalesce\(visibility, 'public'\) = 'public'/);
  assert.match(PUBLIC_LISTING_SQL, /coalesce\(is_test, 0\) = 0/);
  assert.match(PUBLIC_LISTING_SQL, /name !~\* '\^test\(\[ _-\]\|\$\)'/);
  assert.match(PUBLIC_LISTING_SQL, /slug !~\* '\^test\(\[_-\]\|\$\)'/);
  assert.match(PUBLIC_LISTING_SQL, /name !~\* '\^qa\[ _-\]'/);
  assert.match(PUBLIC_LISTING_SQL, /name not ilike '%qa test%'/);
  assert.match(PUBLIC_LISTING_SQL, /id not ilike 'ke-test-%'/);
  assert.match(PUBLIC_LISTING_SQL, /slug not ilike 'test-ghost%'/);
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

test("production seed and migration hide leftover TEST fixtures", () => {
  const seed = readFileSync(new URL("../src/lib/catalog-seed.ts", import.meta.url), "utf8");
  const api = readFileSync(new URL("../src/routes/api/seed-catalog.ts", import.meta.url), "utf8");
  const ops = readFileSync(new URL("./seed-catalog-to-neon.mjs", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../migrations/0039_hide_test_fixtures.sql", import.meta.url), "utf8");
  const titleCase = readFileSync(new URL("../migrations/0051_hide_test_test_fixtures.sql", import.meta.url), "utf8");
  assert.match(seed, /allowSeedTestListings/);
  assert.match(api, /catalogRowsForSeed/);
  assert.match(ops, /catalogRowsForSeed/);
  assert.match(migration, /visibility = 'admin_only'/);
  assert.match(migration, /name like 'TEST %'/);
  assert.doesNotMatch(migration, /delete from daycares/i);
  assert.match(titleCase, /name ~\* '\^test\(\[ _-\]\|\$\)'/);
  assert.match(titleCase, /test-test-p23f/);
  assert.match(titleCase, /Joan Kids World/);
  assert.doesNotMatch(titleCase, /delete from daycares/i);
  assert.doesNotMatch(titleCase, /joan-kids/i);
});
