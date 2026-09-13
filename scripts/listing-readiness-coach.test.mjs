import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  hasListedCapacity,
  hasListedProvince,
  isListingVerified,
  listingCoachDesks,
  listingVerifiedCoach,
} from "../src/lib/listing-verified.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const empty = {
  id: "on-9",
  province: "",
  hours: "",
  licenseNumber: "",
  licensedCapacity: null,
  agesKnown: false,
  ageMinMonths: 0,
  ageMaxMonths: 0,
  infantMonthly: 0,
  toddlerMonthly: 0,
  preschoolMonthly: 0,
  photos: [],
  screeningOnFile: false,
  financial: { subsidy: false, sliding: false, sibling: false, meals: false },
  safetyFeatures: [],
};

const ready = {
  id: "mb-100",
  province: "MB",
  hours: "Monday to Friday 7:30–17:30",
  licenseNumber: "MB-44120",
  licensedCapacity: 16,
  agesKnown: true,
  ageMinMonths: 12,
  ageMaxMonths: 60,
  infantMonthly: 0,
  toddlerMonthly: 0,
  preschoolMonthly: 0,
  photos: ["/photos/buildings/mb-100.jpg"],
  screeningOnFile: true,
  financial: { subsidy: true, sliding: false, sibling: false, meals: false },
  safetyFeatures: ["fenced"],
  lastVacancyUpdatedAt: "2026-09-13T12:00:00.000Z",
};

test("Listing Verified requires Canada blockers and treats subsidy/policies as nice-to-have", () => {
  const missing = listingVerifiedCoach(empty);
  assert.equal(missing.verified, false);
  assert.deepEqual(missing.missingBlockers, [
    "license",
    "province",
    "hours",
    "ages",
    "capacity",
    "fees",
    "photo",
    "screening",
  ]);
  assert.deepEqual(missing.missingNice, ["subsidy", "policies", "vacancy"]);
  assert.equal(hasListedProvince("MB"), true);
  assert.equal(hasListedProvince("XX"), false);
  assert.equal(hasListedCapacity(0), false);
  assert.equal(hasListedCapacity(12), true);

  const almost = listingVerifiedCoach({ ...ready, screeningOnFile: false, safetyFeatures: [] });
  assert.equal(almost.verified, false);
  assert.deepEqual(almost.missingBlockers, ["screening"]);
  assert.equal(almost.missingNice.includes("policies"), true);
  assert.equal(isListingVerified(ready), true);
  assert.equal(listingVerifiedCoach(ready).missingNice.length, 0);

  const hrefs = listingCoachDesks(almost);
  assert.deepEqual(hrefs.map((h) => h.desk), ["screening"]);
});

test("expired licence and invented licence tails never count as verified", () => {
  assert.equal(
    listingVerifiedCoach({ ...ready, licenseStatus: "expired" }).missingBlockers.includes("license"),
    true,
  );
  assert.equal(
    listingVerifiedCoach({ ...ready, licenseNumber: "100", id: "mb-100" }).missingBlockers.includes("license"),
    true,
  );
});

test("Today and listing editor use Action required + coach, not a Superhost public score", () => {
  const home = src("src/components/today-urgency-home.tsx");
  const forms = src("src/components/provider-listing-forms.tsx");
  const coach = src("src/components/listing-readiness-coach.tsx");
  const provider = src("src/routes/provider.tsx");
  const copy = src("src/lib/copy.ts");
  const model = src("src/lib/listing-verified.ts");

  assert.match(home, /ActionRequiredBanner/);
  assert.match(home, /opsRows/);
  assert.doesNotMatch(home, /QualityIssuesPanel|qualityScoreTitle|Superhost/);
  assert.match(forms, /ListingReadinessCoach/);
  assert.match(forms, /listing-health-province/);
  assert.match(forms, /listing-health-subsidy/);
  assert.match(forms, /listing-health-policies/);
  assert.doesNotMatch(forms, /QualityIssuesPanel|qualityScoreTitle|\/100/);
  assert.match(coach, /listingCoachBlockers/);
  assert.match(coach, /listingCoachNice/);
  assert.match(coach, /listingCoachOpenScreening/);
  assert.match(coach, /listingCoachOpenLicence/);
  assert.match(coach, /listingCoachOpenListing/);
  assert.doesNotMatch(coach, /qualityScoreTitle|Superhost|\/100/);
  assert.match(model, /desk: "screening"/);
  assert.match(model, /desk: "licence"/);
  assert.match(model, /desk: "listings"/);
  assert.match(provider, /ActionRequiredBanner/);
  assert.match(provider, /ListingReadinessCoach/);
  assert.match(provider, /CompletenessChecklist/);
  assert.match(provider, /ProviderTrustChecklist/);
  assert.match(provider, /ProviderScreeningPanel/);
  assert.match(provider, /focus\?: ListingCoachFocus/);
  assert.match(src("src/components/listing-completeness.tsx"), /ListingReadinessCoach/);
  assert.match(src("src/components/provider-trust.tsx"), /listing-health-license/);
  assert.match(src("src/components/provider-trust.tsx"), /listing-health-capacity/);
  assert.match(src("src/components/provider-screening.tsx"), /listing-coach-screening/);
  assert.match(copy, /listingVerified: "Listing Verified"/);
  assert.match(copy, /KidEase is not the provincial regulator/);
  assert.match(copy, /does not issue licences or Vulnerable Sector Checks/);
  assert.match(copy, /todayActionRequired: "Action required"/);
  assert.doesNotMatch(copy, /Superhost/);
  assert.match(model, /not a public Superhost score/);
  assert.match(model, /does not issue licences or VSCs/);
});

test("Sprint 2c does not rewrite inbox, tours, or public Explore", () => {
  const home = src("src/components/today-urgency-home.tsx");
  assert.match(home, /acceptTour/);
  assert.match(home, /todayProposeTime/);
  assert.match(src("src/lib/today-sla.ts"), /TODAY_TOUR_SLA_HOURS = TOUR_HOLD_SLA_HOURS/);
  assert.match(src("src/lib/tour-hold.ts"), /TOUR_HOLD_SLA_HOURS = 48/);
  assert.doesNotMatch(src("src/routes/index.tsx"), /ListingReadinessCoach|ActionRequiredBanner/);
  assert.doesNotMatch(src("src/routes/search.tsx"), /ListingReadinessCoach|ActionRequiredBanner/);
  assert.doesNotMatch(src("src/components/parent-desk.tsx"), /ListingReadinessCoach/);
});
