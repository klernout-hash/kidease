import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AI_FLAGS, aiFlagDefaultOn } from "../src/lib/ai/flags.ts";
import { aiFeatureVisible } from "../src/lib/ai/flag-gate.ts";
import {
  groundReviewPoints,
  REVIEW_SUMMARY_MIN,
  REVIEW_SUMMARY_SYSTEM,
  reviewSummarySchema,
  reviewSummarySource,
} from "../src/lib/ai/review-summary.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const source = reviewSummarySource([
  "The yard is sunny and the teachers are kind.",
  "Warm staff and a sunny outdoor yard.",
  "Kind teachers at drop-off.",
]);

test("ai-review-summary stays off when PostHog is off or unreachable", () => {
  assert.equal(aiFlagDefaultOn(AI_FLAGS.reviewSummary, 0), false);
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.reviewSummary, bucket: 0, snapshot: { reached: false, flags: {} } }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.reviewSummary,
      bucket: 2,
      snapshot: { reached: true, flags: { "ai-review-summary": false } },
    }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.reviewSummary,
      bucket: 80,
      snapshot: { reached: true, flags: { "ai-review-summary": true } },
    }),
    true,
  );
});

test("points that are not in the reviews are refused, and two reviews are not enough", () => {
  assert.equal(REVIEW_SUMMARY_MIN, 3);
  const themed = groundReviewPoints(["Sunny yard", "Kind teachers"], source, 3);
  assert.deepEqual(themed, ["Sunny yard", "Kind teachers"]);
  assert.deepEqual(groundReviewPoints(["Fees are $10 a day"], source, 3), []);
  assert.deepEqual(groundReviewPoints(["Licence number 44421"], source, 3), []);
  assert.deepEqual(groundReviewPoints(["Montessori program"], source, 3), []);
  assert.deepEqual(groundReviewPoints(["Sunny yard"], source, 2), []);
  assert.equal(reviewSummarySchema.safeParse({ points: ["Sunny yard"], fee: 1 }).success, false);
  assert.match(REVIEW_SUMMARY_SYSTEM, /Do not invent a fee/);
});

test("the summary reads published review text only", () => {
  const server = read("src/lib/server/review-summary.ts");
  const page = read("src/components/review-summary.tsx");
  assert.match(server, /status in \('published', 'approved'\)/);
  assert.match(server, /select body from reviews/);
  assert.doesNotMatch(server, /author/);
  assert.match(server, /AI_FLAGS\.reviewSummary/);
  assert.match(page, /useAiFeatureFlag\(AI_FLAGS\.reviewSummary\)/);
  assert.match(page, /#listing-reviews/);
  assert.match(read("src/routes/daycare.$slug.tsx"), /ReviewSummary/);
  assert.match(read("src/lib/ai/flag-gate.ts"), /AI_FLAGS\.reviewSummary/);
});
