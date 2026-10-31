import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { reviewReportsEnabled } from "../src/lib/features.ts";
import {
  canReportReview,
  formatParentRating,
  parentRatingShown,
  ratingFloor,
  reviewReportCopy,
  reviewReportDetail,
} from "../src/lib/review-reports.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("review reports default off and one review stays hidden until the flag is on", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_REVIEW_REPORTS, false);
  assert.equal(reviewReportsEnabled({}), false);
  assert.equal(reviewReportsEnabled({ FEATURE_REVIEW_REPORTS: "1" }), true);
  assert.equal(ratingFloor(false, 3), 3);
  assert.equal(ratingFloor(true, 3), 1);
  assert.equal(parentRatingShown(1, 40, ratingFloor(false, 3)), false);
  assert.equal(parentRatingShown(1, 40, ratingFloor(true, 3)), true);
  assert.equal(parentRatingShown(2, 0, 1), false);
  assert.equal(formatParentRating(45), "4.5");
  assert.match(read(".env.example"), /^FEATURE_REVIEW_REPORTS=0$/m);
  assert.doesNotMatch(read(".env.example"), /^FEATURE_REVIEW_REPORTS=1$/m);
});

test("only a different signed-in person can report a published review", () => {
  assert.equal(
    canReportReview({
      enabled: false,
      status: "published",
      reporterUserId: "parent",
      authorUserId: "other",
      reviewId: "rv1",
    }),
    false,
  );
  assert.equal(
    canReportReview({
      enabled: true,
      status: "pending",
      reporterUserId: "parent",
      authorUserId: "other",
      reviewId: "rv1",
    }),
    false,
  );
  assert.equal(
    canReportReview({
      enabled: true,
      status: "published",
      reporterUserId: "parent",
      authorUserId: "parent",
      reviewId: "rv1",
    }),
    false,
  );
  assert.equal(
    canReportReview({
      enabled: true,
      status: "published",
      reporterUserId: "parent",
      authorUserId: "centre-parent",
      reviewId: "rv1",
    }),
    true,
  );
  assert.equal(reviewReportDetail("rv1", "  has a phone 204-555-0100  "), "review:rv1 has a phone 204-555-0100");
  const en = reviewReportCopy("en");
  const fr = reviewReportCopy("fr");
  assert.match(en.sent, /KidEase will read it/);
  assert.match(fr.help, /Aide/);
  assert.doesNotMatch(en.report, /free forever/i);
});

test("report button, card floor, and compare row stay behind the flag", () => {
  const server = read("src/lib/server/review-reports.ts");
  const listing = read("src/routes/daycare.$slug.tsx");
  const card = read("src/components/daycare-card.tsx");
  const search = read("src/routes/search.tsx");
  const compare = read("src/routes/compare.tsx");
  assert.match(server, /reviewReportsEnabled/);
  assert.match(server, /target_kind/);
  assert.match(server, /'review'/);
  assert.doesNotMatch(server, /sendSms|twilio/i);
  assert.match(listing, /ReviewReportButton/);
  assert.match(listing, /data\.reviewReports/);
  assert.match(read("src/components/review-report-button.tsx"), /localePath\("\/help"/);
  assert.match(card, /parentRatingShown/);
  assert.match(search, /reviewRatingFloor/);
  assert.match(compare, /reviewReportFlag/);
  assert.match(read("src/lib/server/daycares.ts"), /reviewReports: reviewReportsEnabled\(\)/);
});
