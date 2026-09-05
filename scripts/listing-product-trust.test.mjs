import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  applyListingReadiness,
  isRealListingPhoto,
  listingCompleteness,
  vacancyFreshness,
  VACANCY_STALE_MS,
} from "../src/lib/listing-readiness.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const base = {
  id: "mb-100",
  slug: "test-centre",
  name: "Test Centre",
  nameFr: "Test Centre",
  tagline: "",
  taglineFr: "",
  description: "",
  descriptionFr: "",
  address: "1 Main",
  city: "Winnipeg",
  province: "MB",
  postalCode: "R3C 0A1",
  lat: 49.89,
  lng: -97.13,
  phone: null,
  hours: "Monday to Friday 7:00–18:00",
  hoursFr: "",
  ageMinMonths: 12,
  ageMaxMonths: 60,
  infantMonthly: 0,
  toddlerMonthly: 0,
  preschoolMonthly: 0,
  partTimeMonthly: null,
  spotsInfant: 2,
  spotsToddler: 0,
  spotsPreschool: 0,
  waitlist: 0,
  ratingX10: 0,
  reviewCount: 0,
  licenseNumber: "123456",
  languages: "en",
  amenities: "licensed",
  photos: ["/photos/buildings/mb-100.jpg"],
  verified: true,
  live: false,
  agesKnown: true,
};

test("vacancy freshness never uses claim time and marks stale after 14 days", () => {
  assert.equal(vacancyFreshness(null).kind, "unknown");
  assert.equal(vacancyFreshness("not-a-date").kind, "unknown");
  const fresh = vacancyFreshness(new Date().toISOString());
  assert.equal(fresh.kind, "fresh");
  const stale = vacancyFreshness(new Date(Date.now() - VACANCY_STALE_MS - 1000).toISOString());
  assert.equal(stale.kind, "stale");
  const mapped = src("src/lib/server/map-row.ts");
  assert.match(mapped, /last_vacancy_updated_at/);
  assert.doesNotMatch(mapped, /spotsUpdatedAt: r\.claimed_at/);
  const overlay = src("src/lib/server/daycares.ts");
  assert.doesNotMatch(overlay, /availabilityKnown:\s*true/);
});

test("completeness requires fees or fee program, ages, hours, real licence, real photo", () => {
  const ready = listingCompleteness(base);
  assert.equal(ready.ready, true);
  assert.equal(ready.score, 5);

  const incomplete = listingCompleteness({
    ...base,
    id: "on-1",
    province: "ON",
    hours: "",
    agesKnown: false,
    ageMinMonths: 0,
    ageMaxMonths: 0,
    licenseNumber: "1",
    photos: ["/photos/storefront-placeholder-480.webp", "/photos/wpg/mb-1.jpg", "centre-logo.png"],
  });
  assert.equal(incomplete.ready, false);
  assert.deepEqual(incomplete.missing.sort(), ["ages", "fees", "hours", "license", "photo"]);
});

test("real photos exclude placeholders, logos, and street-view stock", () => {
  assert.equal(isRealListingPhoto("/photos/buildings/mb-1.jpg"), true);
  assert.equal(isRealListingPhoto("/img/abc"), true);
  assert.equal(isRealListingPhoto("data:image/jpeg;base64,xx"), true);
  assert.equal(isRealListingPhoto("/photos/storefront-placeholder-480.webp"), false);
  assert.equal(isRealListingPhoto("/photos/wpg/mb-1.jpg"), false);
  assert.equal(isRealListingPhoto("centre-logo.png"), false);
  assert.equal(isRealListingPhoto(""), false);
});

test("readiness does not invent vacancy from a claimed listing", () => {
  const d = applyListingReadiness({ ...base, claimed: true, lastVacancyUpdatedAt: null, spotsUpdatedAt: null });
  assert.equal(d.availabilityKnown, false);
  assert.equal(d.spotsUpdatedAt, null);
  assert.equal(d.detailsReady, true);
});

test("public reviews query only approved rows and forms use Turnstile", () => {
  const daycares = src("src/lib/server/daycares.ts");
  assert.match(daycares, /coalesce\(status, 'approved'\) = 'approved'/);
  const reviews = src("src/lib/server/reviews.ts");
  assert.match(reviews, /assertTurnstileToken/);
  assert.match(reviews, /status = 'pending'/);
  assert.match(reviews, /MAX_SUBMISSIONS_PER_DAY = 3/);
  assert.doesNotMatch(reviews, /Background checked/);
  const form = src("src/components/listing-review-form.tsx");
  assert.match(form, /TurnstileField/);
  assert.match(form, /writeReviewLead/);
  const listing = src("src/routes/daycare.\$slug.tsx");
  assert.match(listing, /ListingReviewForm/);
  assert.match(listing, /CompletenessBanner/);
});

test("provider guest gate and declined claims stay honest", () => {
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /providerGuestLead/);
  assert.match(provider, /declined/);
  assert.match(provider, /Promote is off while this listing is declined/);
  const forms = src("src/components/provider-listing-forms.tsx");
  assert.match(forms, /refreshVacancy/);
  assert.match(forms, /vacancyRefresh/);
  assert.match(forms, /CompletenessChecklist/);
  const copy = src("src/lib/copy.ts");
  assert.doesNotMatch(copy, /Background checked by KidEase/);
  assert.match(copy, /KidEase does not invent availability/);
});

test("admin reviews tab is first-class and migration is 0024", () => {
  const nav = src("src/lib/desk-nav.ts");
  assert.match(nav, /id: "reviews"/);
  const admin = src("src/routes/admin.tsx");
  assert.match(admin, /AdminReviewsPanel/);
  const migration = src("migrations/0024_listing_freshness_reviews.sql");
  assert.match(migration, /last_vacancy_updated_at/);
  assert.match(migration, /Never backfilled from claimed_at/);
  assert.match(migration, /status in \('pending', 'approved', 'rejected'\)/);
});
