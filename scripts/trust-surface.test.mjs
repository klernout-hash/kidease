import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { publicGoogleRating } from "../src/lib/google-reviews.ts";
import { trustSurfaceCopy } from "../src/lib/trust-surface.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Google rating uses Google columns and hides the default 4.5", () => {
  assert.equal(
    publicGoogleRating({ googleRatingX10: 0, googleReviewCount: 0, parentReviewCount: 0 }),
    null,
  );
  assert.equal(
    publicGoogleRating({
      ratingX10: 45,
      reviewCount: 12,
      googleRatingX10: null,
      googleReviewCount: null,
    }),
    null,
  );
  assert.deepEqual(
    publicGoogleRating({ googleRatingX10: 46, googleReviewCount: 80, parentReviewCount: 0 }),
    { ratingX10: 46, reviewCount: 80 },
  );
  assert.equal(
    publicGoogleRating({
      googleRatingX10: 46,
      googleReviewCount: 80,
      parentReviewCount: 3,
      parentRatingX10: 50,
    }),
    null,
  );
});

test("Google rating label is visible text, and the enrolment prompt is on the listing", () => {
  const rating = src("src/components/google-rating.tsx");
  assert.match(rating, /words\.googleRating/);
  assert.match(rating, /font-medium text-muted/);
  const form = src("src/components/listing-review-form.tsx");
  assert.match(form, /enrolment-review-prompt/);
  assert.match(form, /verifiedReviewTitle/);
  const desk = src("src/components/parent-desk.tsx");
  assert.match(desk, /enrolment-review-link/);
  assert.match(desk, /hash="listing-reviews"/);
  const page = src("src/routes/daycare.$slug.tsx");
  assert.match(page, /publicGoogleRating/);
  assert.doesNotMatch(page, /const googleRated = d\.reviewCount/);
});

test("Start a daycare path ends at Create your KidEase listing", () => {
  const en = trustSurfaceCopy("en");
  const fr = trustSurfaceCopy("fr");
  assert.equal(en.createListing, "Create your KidEase listing");
  assert.equal(en.googleRating, "Google rating");
  assert.match(fr.createListing, /fiche KidEase/);
  assert.doesNotMatch(en.createListing + fr.createListing + en.googleRating, /—|free forever|Winnipeg-based/i);
  const page = src("src/routes/start-a-daycare.tsx");
  assert.match(page, /data-ke="start-daycare-path"/);
  assert.match(page, /path\.createListing/);
  assert.match(page, /to="\/claim"/);
  assert.doesNotMatch(page, /start-a-daycare\/\$/);
  const copy = src("src/lib/trust-surface.ts");
  assert.doesNotMatch(copy, /\$\d/);
});
