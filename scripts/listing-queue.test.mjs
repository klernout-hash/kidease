import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { GHOST_LISTING } from "../src/lib/ghost-listing.ts";
import { isPlatformLive } from "../src/lib/live.ts";
import { adminQueueWaitingRows, mapAdminCentreSqlRow } from "../src/lib/admin-centres-map.ts";
import {
  catalogImportWrite,
  isAdminListEligible,
  isWaitingOnAdminQueue,
  normalizeAdminClaimStatus,
  providerCreatedListingWrite,
} from "../src/lib/listing-queue.ts";
import { isQueueableClaimStatus, isWaitingClaim } from "../src/lib/listing-status.ts";
import { staffQueueRows } from "../src/lib/listing-visibility.ts";

function neonSqlCentre(overrides = {}) {
  return {
    daycare_id: "d_placeholder",
    slug: "placeholder",
    name: "Placeholder Daycare",
    address: "1 Main St",
    city: "Winnipeg",
    province: "MB",
    phone: null,
    contact_email: null,
    claim_status: "waiting",
    claimed_at: null,
    claim_id: null,
    claim_row_status: null,
    provider_user_id: null,
    provider_name: null,
    provider_email: null,
    submitted_at: "2026-09-16T18:00:00.000Z",
    reviewed_at: null,
    review_note: null,
    license_number: null,
    license_status: "unverified",
    license_expiry: null,
    licensed_capacity: null,
    registry_match_state: "unmatched",
    license_verified_at: null,
    license_verification_source: null,
    staff_screening_attested: 0,
    staff_screening_attested_at: null,
    screening_on_file: 0,
    screening_on_file_at: null,
    license_photo: null,
    photos: null,
    visibility: "public",
    is_test: 0,
    ...overrides,
  };
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("createListing writes a queueable waiting claim, not Live", () => {
  const write = providerCreatedListingWrite();
  assert.equal(write.claimStatus, "waiting");
  assert.equal(write.listingClaimStatus, "waiting");
  assert.equal(write.claimedAt, null);
  assert.equal(write.live, false);
  assert.equal(isAdminListEligible({ claimStatus: write.claimStatus, hasListingClaim: true, hasProviderLink: true }), true);
  assert.equal(isWaitingOnAdminQueue(write.claimStatus), true);
  assert.equal(isQueueableClaimStatus(write.claimStatus), true);
  assert.equal(isPlatformLive("d-new", false, { claimStatus: write.claimStatus, claimedAt: write.claimedAt }), false);

  const family = src("src/lib/server/family.ts");
  const start = family.indexOf("export const createListing");
  const end = family.indexOf("export const updateCapacity", start);
  const createListing = family.slice(start, end === -1 ? undefined : end);
  assert.match(createListing, /assertNewListingAllowed/);
  assert.match(createListing, /enqueueProviderCreatedListing/);
  assert.ok(
    createListing.indexOf("assertNewListingAllowed") < createListing.indexOf("enqueueProviderCreatedListing"),
    "duplicate reject must not skip the first-create Waiting enqueue path",
  );
  assert.match(src("src/lib/server/listing-queue.ts"), /claim_status = \$\{status\}/);
  assert.match(src("src/lib/server/listing-queue.ts"), /insert into listing_claims/);
  assert.match(src("src/lib/server/listing-queue.ts"), /claim_waiting/);
  assert.doesNotMatch(createListing, /claimed_at = now\(\)/);
  assert.doesNotMatch(createListing, /claim_status = ['"]approved['"]/);
  assert.match(createListing, /listingVisibilityForOwners/);
  assert.match(createListing, /visibility, is_test/);
  assert.match(createListing, /visibilityWrite\.isTest/);
});

test("catalogue unclaimed imports stay off Admin Waiting", () => {
  const imported = catalogImportWrite();
  assert.equal(imported.claimStatus, "unclaimed");
  assert.equal(imported.claimedAt, null);
  assert.equal(
    isAdminListEligible({
      claimStatus: imported.claimStatus,
      claimedAt: imported.claimedAt,
      hasListingClaim: false,
      hasProviderLink: false,
      name: "Bonnie Bairns Childcare",
      slug: "bonnie-bairns-childcare-services-1",
    }),
    false,
  );
  assert.equal(isQueueableClaimStatus("unclaimed"), false);
  assert.equal(isWaitingOnAdminQueue("unclaimed"), false);
  assert.equal(isWaitingClaim("unclaimed"), true, "provider badge may still say Waiting");

  const upsert = src("src/lib/catalog-upsert.ts");
  assert.doesNotMatch(upsert, /claim_status/);
  assert.match(upsert, /where daycares\.claimed_at is null/);
});

test("provider-created unclaimed orphans normalize onto the waiting queue", () => {
  const status = normalizeAdminClaimStatus({
    claimStatus: "unclaimed",
    claimedAt: null,
    claimRowStatus: null,
    hasProviderLink: true,
  });
  assert.equal(status, "waiting");
  assert.equal(isAdminListEligible({ claimStatus: "unclaimed", hasProviderLink: true }), true);
  assert.equal(isWaitingOnAdminQueue(status), true);
  assert.equal(
    normalizeAdminClaimStatus({
      claimStatus: "unclaimed",
      claimedAt: null,
      hasProviderLink: false,
    }),
    "unclaimed",
  );
  assert.equal(
    normalizeAdminClaimStatus({
      claimStatus: "unclaimed",
      claimedAt: "2026-09-01T00:00:00.000Z",
      hasProviderLink: true,
    }),
    "approved",
  );
});

test("claim / licence-photo path stays queueable at pending then waiting", () => {
  assert.equal(isAdminListEligible({ claimStatus: "pending", hasListingClaim: true }), true);
  assert.equal(isWaitingOnAdminQueue("pending"), true);
  assert.equal(isWaitingOnAdminQueue("waiting"), true);
  assert.equal(isWaitingOnAdminQueue("verified"), true);
  assert.equal(isWaitingOnAdminQueue("approved"), false);
  assert.equal(isWaitingOnAdminQueue("declined"), false);
  assert.equal(isWaitingOnAdminQueue("waiting"), true);
  assert.equal(isWaitingOnAdminQueue("unclaimed"), false);
  assert.match(src("src/lib/admin-verify.ts"), /isQueueableClaimStatus\(item\.claimStatus\)/);
});

test("Joan Kids World stays on Waiting when Show QA is unchecked", () => {
  const joan = mapAdminCentreSqlRow(
    neonSqlCentre({
      daycare_id: "d_d85jtifbkh2t",
      slug: "kids-world-daycare",
      name: "Kids World Daycare",
      claim_status: "waiting",
      claim_id: "cl_joan",
      claim_row_status: "waiting",
      provider_user_id: "user_joan",
      provider_link_user_id: "user_joan",
      provider_name: "Joan Mbabazi",
      visibility: "public",
      is_test: 0,
    }),
  );
  const peninsula = mapAdminCentreSqlRow(
    neonSqlCentre({
      daycare_id: "bc-9001",
      slug: "harbour-montessori",
      name: "Harbour Montessori",
      claim_status: "pending",
      claim_id: "cl_pen",
      claim_row_status: "pending",
      visibility: "public",
      is_test: 0,
    }),
  );
  const qa = mapAdminCentreSqlRow(
    neonSqlCentre({
      daycare_id: "d_test_1",
      slug: "test-test-waiting",
      name: "Test Test",
      claim_status: "waiting",
      claim_id: "cl_qa",
      visibility: "admin_only",
      is_test: 1,
    }),
  );

  assert.equal(joan.isTest, false);
  assert.equal(joan.claimStatus, "waiting");
  assert.equal(isAdminListEligible({
    id: joan.daycareId,
    name: joan.name,
    slug: joan.slug,
    claimStatus: joan.claimStatus,
    hasListingClaim: joan.hasListingClaim,
    hasProviderLink: joan.hasProviderLink,
    visibility: "public",
    isTest: 0,
  }), true);
  assert.equal(qa.isTest, true);

  const waiting = adminQueueWaitingRows([joan, peninsula, qa], false);
  assert.deepEqual(
    waiting.map((r) => r.daycareId),
    ["d_d85jtifbkh2t", "bc-9001"],
  );
  assert.equal(
    waiting.some((r) => r.name === "Kids World Daycare"),
    true,
  );
  assert.equal(
    adminQueueWaitingRows([joan, peninsula, qa], true).length,
    3,
  );
});

test("QA fixtures stay opt-in and unclaimed QA is not a production waiting claim", () => {
  const liveWaiting = {
    id: "mb-1",
    slug: "kids-world-daycare",
    name: "Kids World daycare",
    claimStatus: "waiting",
  };
  const qaUnclaimed = { ...GHOST_LISTING, claimStatus: "unclaimed" };
  const qaWaiting = { ...GHOST_LISTING, claimStatus: "waiting" };
  assert.deepEqual(
    staffQueueRows([liveWaiting, qaUnclaimed, qaWaiting], false).map((r) => r.slug),
    ["kids-world-daycare"],
  );
  const withQa = staffQueueRows([liveWaiting, qaUnclaimed, qaWaiting], true);
  assert.equal(withQa.length, 3);
  const waiting = withQa.filter((r) => isWaitingOnAdminQueue(r.claimStatus));
  assert.deepEqual(
    waiting.map((r) => r.slug),
    ["kids-world-daycare", GHOST_LISTING.slug],
  );
});

test("admin surfaces use queueable status, not unclaimed-as-waiting", () => {
  const admin = src("src/routes/admin.tsx");
  assert.match(admin, /isQueueableClaimStatus/);
  assert.match(admin, /staffQueueRows/);
  assert.match(admin, /AdminIncompleteQueue/);
  const centres = src("src/lib/server/admin-centres.ts");
  assert.match(centres, /mapAdminCentreSqlRow/);
  assert.match(centres, /exists \(select 1 from listing_claims/);
  assert.match(centres, /exists \(select 1 from provider_daycares/);
  assert.match(centres, /throw first/);
  assert.doesNotMatch(centres, /order by created_at desc nulls last[\s\S]*\.catch\(\(\) => \[\]\)/);
  assert.match(src("src/lib/admin-verify.ts"), /isQueueableClaimStatus/);
  assert.match(src("src/lib/server/notify.ts"), /New listing: \$\{centre\}/);
});
