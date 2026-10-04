import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Google ratings are labeled Google rating and are omitted when the data is missing", () => {
  const widget = src("src/components/google-rating.tsx");
  assert.match(widget, /t\("googleReviews"\)/);
  assert.match(widget, /ratingX10 <= 0 \|\| reviewCount <= 0/);
  assert.match(widget, /data-ke="google-rating"/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /googleReviews: "Google rating"/);
  assert.match(copy, /googleReviews: "Note Google"/);
  assert.doesNotMatch(widget, /—/);
});

test("enrolled parents see a verified review prompt on the listing", () => {
  const form = src("src/components/listing-review-form.tsx");
  assert.match(form, /reason === "enrolment"/);
  assert.match(form, /verifiedReviewPrompt/);
  assert.match(form, /verifiedReviewLead/);
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /verifiedReviewNote/);
  assert.match(listing, /data-ke="verified-review-note"/);
  assert.match(listing, /data-ke="listing-google-rating"/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /Verified reviews are from parents enrolled at this centre/);
  assert.match(copy, /You are enrolled here\. Write a verified review\./);
  assert.doesNotMatch(copy.slice(copy.indexOf("verifiedReviewNote"), copy.indexOf("verifiedReviewLead") + 200), /—/);
});

test("Start a daycare ends on Create your KidEase listing with no upgrade path", () => {
  const page = src("src/routes/start-a-daycare.tsx");
  assert.match(page, /createKideaseListing/);
  assert.match(page, /hash="enroll"/);
  assert.match(page, /to="\/claim"/);
  assert.doesNotMatch(page, /enrollToday/);
  assert.doesNotMatch(page, /\/plans/);
  assert.doesNotMatch(page, /upgrade/i);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /createKideaseListing: "Create your KidEase listing"/);
  assert.match(copy, /createKideaseListing: "Créez votre fiche KidEase"/);
  assert.match(copy, /not a payment to become licensed/);
});
