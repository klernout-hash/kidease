import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const STALE_MS = 14 * 24 * 60 * 60 * 1000;

function isRealListingPhoto(srcPath) {
  const p = (srcPath || "").trim();
  if (!p) return false;
  if (p.includes("placeholder")) return false;
  if (p.includes("-logo")) return false;
  if (p.includes("/photos/wpg/")) return false;
  if (p.startsWith("data:image")) return true;
  if (p.startsWith("/photos/buildings/")) return true;
  if (p.startsWith("/img/")) return true;
  if (/^https?:\/\//i.test(p)) return true;
  if (p.startsWith("/") && !p.startsWith("/photos/")) return true;
  return false;
}

function vacancyFreshness(updatedAt, now = Date.now()) {
  if (!updatedAt) return { kind: "unknown" };
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return { kind: "unknown" };
  return { kind: now - ts > STALE_MS ? "stale" : "fresh" };
}

const FEE_PROGRAM = new Set(["MB", "SK", "PE", "NL", "YT", "NT", "NU", "QC", "AB"]);

function officialLicenceNumber(raw, id) {
  const n = (raw || "").trim();
  if (!n || n === "—" || n.toLowerCase() === "unknown") return null;
  const tail = (id || "").split("-").pop() || "";
  if (/^\d{1,3}$/.test(n) && (!id || n === tail)) return null;
  return n;
}

function listingReady(d) {
  const hasFees = FEE_PROGRAM.has(d.province) || [d.infantMonthly, d.toddlerMonthly, d.preschoolMonthly].some((n) => n != null && n > 0);
  const hasAges = Boolean(d.agesKnown) || (d.ageMaxMonths > d.ageMinMonths && d.ageMaxMonths > 0);
  const hours = (d.hours || "").trim();
  const hasHours = hours.length >= 4 && hours !== "—";
  const n = officialLicenceNumber(d.licenseNumber, d.id);
  const hasLicense = Boolean(n) && n !== d.id && n !== (d.id || "").split("-").pop();
  const hasPhoto = (d.photos ?? []).some((p) => isRealListingPhoto(p));
  return { hasFees, hasAges, hasHours, hasLicense, hasPhoto, ready: hasFees && hasAges && hasHours && hasLicense && hasPhoto };
}

test("vacancy freshness never uses claim time and marks stale after 14 days", () => {
  assert.equal(vacancyFreshness(null).kind, "unknown");
  assert.equal(vacancyFreshness("not-a-date").kind, "unknown");
  assert.equal(vacancyFreshness(new Date().toISOString()).kind, "fresh");
  assert.equal(vacancyFreshness(new Date(Date.now() - STALE_MS - 1000).toISOString()).kind, "stale");
  const mapped = src("src/lib/server/map-row.ts");
  assert.match(mapped, /last_vacancy_updated_at/);
  assert.doesNotMatch(mapped, /spotsUpdatedAt: r\.claimed_at/);
  const overlay = src("src/lib/server/daycares.ts");
  assert.doesNotMatch(overlay, /availabilityKnown:\s*true/);
  const readiness = src("src/lib/listing-readiness.ts");
  assert.match(readiness, /VACANCY_STALE_MS = 14 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(readiness, /Does not invent a vacancy time/);
});

test("completeness requires fees or fee program, ages, hours, real licence, real photo", () => {
  const ready = listingReady({
    id: "mb-100",
    province: "MB",
    infantMonthly: 0,
    toddlerMonthly: 0,
    preschoolMonthly: 0,
    agesKnown: true,
    ageMinMonths: 12,
    ageMaxMonths: 60,
    hours: "Monday to Friday 7:00–18:00",
    licenseNumber: "123456",
    photos: ["/photos/buildings/mb-100.jpg"],
  });
  assert.equal(ready.ready, true);

  const incomplete = listingReady({
    id: "on-1",
    province: "ON",
    infantMonthly: 0,
    toddlerMonthly: 0,
    preschoolMonthly: 0,
    agesKnown: false,
    ageMinMonths: 0,
    ageMaxMonths: 0,
    hours: "",
    licenseNumber: "1",
    photos: ["/photos/storefront-placeholder-480.webp", "/photos/wpg/mb-1.jpg", "centre-logo.png"],
  });
  assert.equal(incomplete.ready, false);
  assert.equal(incomplete.hasFees, false);
  assert.equal(incomplete.hasAges, false);
  assert.equal(incomplete.hasHours, false);
  assert.equal(incomplete.hasLicense, false);
  assert.equal(incomplete.hasPhoto, false);
});

test("real photos exclude placeholders, logos, and street-view stock", () => {
  assert.equal(isRealListingPhoto("/photos/buildings/mb-1.jpg"), true);
  assert.equal(isRealListingPhoto("/img/abc"), true);
  assert.equal(isRealListingPhoto("data:image/jpeg;base64,xx"), true);
  assert.equal(isRealListingPhoto("/photos/storefront-placeholder-480.webp"), false);
  assert.equal(isRealListingPhoto("/photos/wpg/mb-1.jpg"), false);
  assert.equal(isRealListingPhoto("centre-logo.png"), false);
  assert.equal(isRealListingPhoto(""), false);
  const readiness = src("src/lib/listing-readiness.ts");
  assert.match(readiness, /\/photos\/wpg\//);
  assert.match(readiness, /placeholder/);
  assert.match(readiness, /-logo/);
});

test("public reviews query only approved rows and forms use Turnstile", () => {
  const daycares = src("src/lib/server/daycares.ts");
  assert.match(daycares, /coalesce\(status, 'approved'\) = 'approved'/);
  const reviews = src("src/lib/server/reviews.ts");
  assert.match(reviews, /assertTurnstileToken/);
  assert.match(reviews, /'pending'/);
  assert.match(reviews, /MAX_SUBMISSIONS_PER_DAY = 3/);
  assert.doesNotMatch(reviews, /Background checked/);
  const form = src("src/components/listing-review-form.tsx");
  assert.match(form, /TurnstileField/);
  assert.match(form, /writeReviewLead/);
  const listing = src("src/routes/daycare.\$slug.tsx");
  assert.match(listing, /ListingReviewForm/);
  assert.match(listing, /CompletenessBanner/);
  const badges = src("src/components/listing-badges.tsx");
  assert.match(badges, /TrustSignals/);
  const completeness = src("src/components/listing-completeness.tsx");
  assert.match(completeness, /detailsIncomplete/);
  assert.match(completeness, /completenessParentNext/);
});

test("parent listing honesty never labels unknown vacancy as stale", () => {
  const card = src("src/components/daycare-card.tsx");
  assert.match(card, /parentIncompleteLabel/);
  assert.match(card, /freshness\.kind === "unknown"/);
  assert.doesNotMatch(card, /freshness\.text \|\| t\("vacancyStale"\)/);
  const listing = src("src/routes/daycare.\$slug.tsx");
  assert.match(listing, /VacancyFreshness/);
  assert.doesNotMatch(listing, /!d\.availabilityKnown[\s\S]*vacancyStale/);
  const forms = src("src/components/provider-listing-forms.tsx");
  assert.match(forms, /vacancyUnknownProvider/);
  assert.match(forms, /vacancyStaleProvider/);
  assert.doesNotMatch(forms, /availabilityKnown \?[\s\S]*vacancyStale/);
  const search = src("src/routes/search.tsx");
  assert.match(search, /filterConfirmedSpots/);
  assert.match(search, /filterDetailsReady/);
  assert.match(search, /noFilterResults/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /A few details to confirm/);
  assert.match(copy, /Ask about current spots/);
  assert.match(copy, /KidEase does not invent availability/);
  assert.doesNotMatch(copy, /Details incomplete/);
  assert.doesNotMatch(copy, /Not updated recently/);
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

test("create listing form can attach a storefront before publish", () => {
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /id="list-new"/);
  assert.match(provider, /storefrontCta/);
  assert.match(provider, /readListingImage/);
  assert.match(provider, /createListing\(\{ data: form \}\)/);
  assert.match(provider, /storefront:/);
  const family = src("src/lib/server/family.ts");
  assert.match(family, /storefront\?: string/);
  assert.match(family, /applyStorefrontPhoto\(STOCK_CREATE_PHOTOS, data\.storefront\)/);
  const claims = src("src/lib/server/claims.ts");
  assert.match(claims, /applyStorefrontPhoto\(current\[0\]\?\.photos \?\? "", data\.storefront\)/);
  const forms = src("src/components/provider-listing-forms.tsx");
  assert.match(forms, /LISTING_PHOTO_MAX_BYTES = 1_800_000/);
  assert.match(forms, /readAsDataURL/);
  assert.match(forms, /mode === "listing"/);
  assert.match(forms, /storefrontCta/);
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
