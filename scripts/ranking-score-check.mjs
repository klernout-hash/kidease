import assert from "node:assert/strict";
import { scoreSmartMatch } from "../src/lib/ranking/score.ts";
import { SMART_MATCH_WEIGHTS } from "../src/lib/ranking/weights.ts";

const now = Date.parse("2026-09-30T18:00:00Z");
const fresh = "2026-09-28T18:00:00Z";
const stale = "2026-08-01T18:00:00Z";

function listing(extra = {}) {
  return {
    id: "c1",
    name: "Example Centre",
    city: "Winnipeg",
    province: "MB",
    amenities: "",
    agesKnown: true,
    ageMinMonths: 0,
    ageMaxMonths: 18,
    hours: "7:30 to 17:30",
    licenseNumber: "LIC-100",
    photos: ["/photos/buildings/example.jpg"],
    infantMonthly: 400,
    toddlerMonthly: null,
    preschoolMonthly: null,
    partTimeMonthly: null,
    feeConfirmed: false,
    feeProgram: null,
    facilityType: "child_care_centre",
    spotsInfant: 2,
    spotsToddler: 0,
    spotsPreschool: 0,
    lastVacancyUpdatedAt: fresh,
    spotsUpdatedAt: fresh,
    claimStatus: "verified",
    claimed: true,
    claimedAt: fresh,
    scheduleOptions: ["full"],
    distanceKm: 2,
    ...extra,
  };
}

const query = { ageGroup: "infant", radiusKm: 25, distanceKnown: true, anchor: "home", wantSubsidy: false };

const strong = scoreSmartMatch(listing(), query, now);
const far = scoreSmartMatch(listing({ distanceKm: 40 }), query, now);
assert.ok(strong.score > far.score, "closer ranks higher");
assert.ok(strong.score >= 0 && strong.score <= 100);
assert.ok(strong.reasons.includes("close_home"));
assert.ok(strong.reasons.includes("spots_fresh"));

const staleScore = scoreSmartMatch(listing({ lastVacancyUpdatedAt: stale, spotsUpdatedAt: stale }), query, now);
assert.equal(staleScore.reasons.includes("spots_fresh"), false, "stale openings are neutral");
assert.ok(staleScore.score <= strong.score);

const unknown = scoreSmartMatch(
  listing({ agesKnown: false, ageMinMonths: 0, ageMaxMonths: 0, lastVacancyUpdatedAt: null, spotsUpdatedAt: null, spotsInfant: 0 }),
  query,
  now,
);
assert.equal(unknown.reasons.includes("age_fit"), false);
assert.ok(unknown.score >= 0, "unknown still scores, it is not removed");

const paid = scoreSmartMatch(listing({ priority: true, featuredCity: true }), query, now);
const free = scoreSmartMatch(listing({ priority: false, featuredCity: false }), query, now);
assert.equal(paid.score, free.score, "paid plans do not change the score");

const unclaimed = scoreSmartMatch(listing({ claimStatus: "unclaimed", claimed: false, claimedAt: null }), query, now);
assert.ok(unclaimed.score > 0, "unclaimed listings are not buried to zero when the other facts fit");
assert.ok(unclaimed.score <= strong.score);

const work = scoreSmartMatch(listing({ distanceKm: 20 }), { ...query, anchor: "work", workDistanceKm: 3 }, now);
assert.ok(work.reasons.includes("close_work"));

assert.equal(SMART_MATCH_WEIGHTS.distance + SMART_MATCH_WEIGHTS.ageFit + SMART_MATCH_WEIGHTS.openingsFreshness + SMART_MATCH_WEIGHTS.subsidyFit + SMART_MATCH_WEIGHTS.hoursFit + SMART_MATCH_WEIGHTS.completeness + SMART_MATCH_WEIGHTS.trust, 100);

console.log("ranking score ok", strong.score);
