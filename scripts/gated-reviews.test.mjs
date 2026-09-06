import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ENROLLED_BOOKING_STATUSES,
  isPublicReviewStatus,
  normalizeReviewStatus,
  parentReviewSummary,
  resolveReviewWriteAccess,
} from "../src/lib/review-gate.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("only enrolment, attendance, or admin grant can write; centres cannot", () => {
  assert.deepEqual(ENROLLED_BOOKING_STATUSES, ["accepted", "active"]);
  assert.deepEqual(resolveReviewWriteAccess({ ownsCentre: true, enrolled: true, attended: true, granted: true }), {
    canWrite: false,
    reason: "centre_owner",
  });
  assert.deepEqual(resolveReviewWriteAccess({ ownsCentre: false, enrolled: true, attended: false, granted: false }), {
    canWrite: true,
    reason: "enrolment",
  });
  assert.deepEqual(resolveReviewWriteAccess({ ownsCentre: false, enrolled: false, attended: true, granted: false }), {
    canWrite: true,
    reason: "attendance",
  });
  assert.deepEqual(resolveReviewWriteAccess({ ownsCentre: false, enrolled: false, attended: false, granted: true }), {
    canWrite: true,
    reason: "grant",
  });
  assert.deepEqual(resolveReviewWriteAccess({ ownsCentre: false, enrolled: false, attended: false, granted: false }), {
    canWrite: false,
    reason: "none",
  });
});

test("legacy approved/rejected map to published/hidden", () => {
  assert.equal(normalizeReviewStatus("approved"), "published");
  assert.equal(normalizeReviewStatus("rejected"), "hidden");
  assert.equal(normalizeReviewStatus("published"), "published");
  assert.equal(isPublicReviewStatus("approved"), true);
  assert.equal(isPublicReviewStatus("hidden"), false);
  assert.deepEqual(parentReviewSummary([{ rating: 5 }, { rating: 4 }]), { ratingX10: 45, count: 2 });
  assert.deepEqual(parentReviewSummary([]), { ratingX10: 0, count: 0 });
});

test("submit path enforces the gate and blocks the centre account", () => {
  const reviews = src("src/lib/server/reviews.ts");
  assert.match(reviews, /evaluateReviewWriteAccess/);
  assert.match(reviews, /hasEnrolment/);
  assert.match(reviews, /hasAttendance/);
  assert.match(reviews, /hasReviewerGrant/);
  assert.match(reviews, /ownsCentre/);
  assert.match(reviews, /Centres cannot write reviews on their own listing/);
  assert.match(reviews, /confirmed enrolment or in-care relationship/);
  assert.match(reviews, /decision === "hide"/);
  assert.match(reviews, /grantListingReviewer/);
  assert.match(reviews, /Cannot grant a reviewer flag to the centre account/);
  assert.doesNotMatch(reviews, /Background checked/);
});

test("listing and search cards show published parent-review summary", () => {
  const daycares = src("src/lib/server/daycares.ts");
  assert.match(daycares, /overlayParentReviews/);
  assert.match(daycares, /parentReviewSummary/);
  assert.match(daycares, /parentRatingX10/);
  const card = src("src/components/daycare-card.tsx");
  assert.match(card, /parentReviewCount/);
  assert.match(card, /parentRatingX10/);
  const listing = src("src/routes/daycare.\$slug.tsx");
  assert.match(listing, /parentReviewCount/);
  assert.match(listing, /ListingReviewForm/);
  const admin = src("src/components/admin-reviews.tsx");
  assert.match(admin, /hideReview/);
  assert.match(admin, /publishReview/);
  assert.match(admin, /grantListingReviewer/);
});

test("migration 0030 documents the enrolment/attendance/grant gate", () => {
  const migration = src("migrations/0030_gated_parent_reviews.sql");
  assert.match(migration, /bookings.status in \('accepted', 'active'\)/);
  assert.match(migration, /attendance.parent_user_id/);
  assert.match(migration, /reviewer_grants/);
  assert.match(migration, /provider_daycares/);
  assert.match(migration, /pending → published \| hidden/);
  assert.match(migration, /tour_requests from 0028 are not enrolment/);
  assert.doesNotMatch(migration, /KidEase background-checked/);
});
