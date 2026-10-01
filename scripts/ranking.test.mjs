import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildMarketRows, rankingMarketCsv } from "../src/lib/ranking/market.ts";
import {
  assignRankingVariant,
  parseRankingOverride,
  rankingBucket,
  RANKING_BEST_MATCH_FLAG,
  RANKING_BEST_MATCH_ROLLOUT_PERCENT,
} from "../src/lib/ranking/variant.ts";
import { SMART_MATCH_WEIGHTS } from "../src/lib/ranking/weights.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await register(new URL("./alias-loader.mjs", import.meta.url), import.meta.url);

const { smartMatchScore, compareSmartMatch, compareSmartMatchOrNearest } = await import(
  "../src/lib/ranking/score.ts"
);
const { rankingEventProperties, RANKING_EVENTS } = await import("../src/lib/ranking/events.ts");

const NOW = Date.parse("2026-09-30T18:00:00.000Z");
const HOME = { lat: 49.9, lng: -97.14 };
const DAY = 86_400_000;

function listing(over = {}) {
  return {
    id: "listing-a",
    lat: HOME.lat,
    lng: HOME.lng,
    ageMinMonths: 0,
    ageMaxMonths: 60,
    agesKnown: true,
    spotsInfant: 0,
    spotsToddler: 0,
    spotsPreschool: 0,
    lastVacancyUpdatedAt: null,
    spotsUpdatedAt: null,
    availabilityKnown: false,
    hours: "",
    amenities: "",
    scheduleOptions: [],
    feeProgram: null,
    province: "MB",
    city: "Winnipeg",
    name: "Example Centre",
    facilityType: "centre",
    financial: null,
    claimStatus: "unclaimed",
    claimed: false,
    claimedAt: null,
    live: false,
    licenseNumber: null,
    photos: [],
    infantMonthly: null,
    toddlerMonthly: null,
    preschoolMonthly: null,
    partTimeMonthly: null,
    ...over,
  };
}

const fullQuery = {
  home: HOME,
  work: HOME,
  radiusKm: 25,
  ageGroup: "infant",
  wantSubsidy: true,
  schedules: ["full"],
};

test("smart match weights sum to 100 and the rollout constant is 50", () => {
  const sum = Object.values(SMART_MATCH_WEIGHTS).reduce((n, w) => n + w, 0);
  assert.equal(sum, 100);
  assert.equal(RANKING_BEST_MATCH_ROLLOUT_PERCENT, 50);
  assert.equal(RANKING_BEST_MATCH_FLAG, "ranking-best-match");
  const scoreSrc = readFileSync(join(root, "src/lib/ranking/score.ts"), "utf8");
  assert.doesNotMatch(scoreSrc, /priority|featuredCity|featured_city/);
});

test("scores stay finite, inside 0–100, and a closer listing beats a farther one", () => {
  const near = listing({ id: "near", lat: 49.905, lng: -97.14 });
  const far = listing({ id: "far", lat: 50.05, lng: -97.14 });
  const query = { home: HOME, radiusKm: 25 };
  const nearScore = smartMatchScore(near, query, NOW);
  const farScore = smartMatchScore(far, query, NOW);
  for (const score of [nearScore.total, farScore.total]) {
    assert.equal(Number.isFinite(score), true);
    assert.ok(score >= 0 && score <= 100);
  }
  assert.ok(nearScore.total > farScore.total);
  assert.ok(compareSmartMatch(near, far, query, NOW) < 0);
});

test("stale and unknown openings score the same and are not a penalty", () => {
  const fresh = listing({
    id: "fresh",
    spotsInfant: 2,
    lastVacancyUpdatedAt: new Date(NOW - 2 * DAY).toISOString(),
  });
  const stale = listing({
    id: "stale",
    spotsInfant: 2,
    lastVacancyUpdatedAt: new Date(NOW - 30 * DAY).toISOString(),
  });
  const unknown = listing({ id: "unknown", spotsInfant: 2, lastVacancyUpdatedAt: null });
  const freshTotal = smartMatchScore(fresh, fullQuery, NOW).total;
  const staleTotal = smartMatchScore(stale, fullQuery, NOW).total;
  const unknownTotal = smartMatchScore(unknown, fullQuery, NOW).total;
  assert.equal(staleTotal, unknownTotal);
  assert.ok(staleTotal >= 0);
  assert.ok(freshTotal >= staleTotal);
  const gap = freshTotal - staleTotal;
  const maxGap = SMART_MATCH_WEIGHTS.openingsFreshness + SMART_MATCH_WEIGHTS.trust * 0.25;
  assert.ok(gap <= maxGap + 0.01, `gap ${gap} exceeded openings weight plus the fresh-spot trust slice`);
  assert.ok(gap > 0);
});

test("paid plan fields do not move a listing ahead of a closer one", () => {
  const near = listing({ id: "near", lat: 49.905, lng: -97.14 });
  const farPaid = listing({
    id: "far-paid",
    lat: 50.05,
    lng: -97.14,
    priority: true,
    featuredCity: true,
    plan: "pro",
  });
  const query = { home: HOME, radiusKm: 25 };
  assert.ok(smartMatchScore(near, query, NOW).total > smartMatchScore(farPaid, query, NOW).total);
  assert.ok(compareSmartMatch(near, farPaid, query, NOW) < 0);
  const server = readFileSync(join(root, "src/lib/server/daycares.ts"), "utf8");
  const from = server.indexOf("const useBest");
  const best = server.slice(from, server.indexOf("const facility", from));
  const branch = best.slice(best.indexOf("if (useBest)"), best.indexOf("} else {"));
  assert.match(branch, /compareSmartMatchOrNearest/);
  assert.doesNotMatch(branch, /compareWithPaidPins/);
  assert.match(best, /compareWithPaidPins/);
});

test("a closer unverified listing beats a far claim-verified one", () => {
  const close = listing({ id: "close", lat: 49.903, lng: -97.14, claimStatus: "unclaimed" });
  const farVerified = listing({
    id: "far-verified",
    lat: 50.08,
    lng: -97.14,
    claimStatus: "live",
    live: true,
    claimed: true,
  });
  const query = { home: HOME, radiusKm: 25 };
  assert.ok(smartMatchScore(close, query, NOW).total > smartMatchScore(farVerified, query, NOW).total);
});

test("subsidy weight applies only when the parent asked, and not from a harvested amenity", () => {
  const funded = listing({ id: "funded", feeProgram: "mb-10-day", province: "MB" });
  const plain = listing({ id: "plain", province: "MB" });
  const amenity = listing({ id: "amenity", province: "MB", amenities: "ten-a-day,funded" });
  const off = { home: HOME, radiusKm: 25, wantSubsidy: false };
  const on = { home: HOME, radiusKm: 25, wantSubsidy: true };
  assert.equal(smartMatchScore(funded, off, NOW).total, smartMatchScore(plain, off, NOW).total);
  assert.ok(smartMatchScore(funded, on, NOW).total > smartMatchScore(plain, on, NOW).total);
  assert.equal(smartMatchScore(amenity, on, NOW).total, smartMatchScore(plain, on, NOW).total);
});

test("a work pin can change which listing ranks first", () => {
  const home = { lat: 49.9, lng: -97.14 };
  const nearHome = listing({ id: "home", lat: 49.909009, lng: -97.14 });
  const nearWork = listing({ id: "work", lat: 49.9, lng: -97.124615 });
  const work = { lat: 49.9, lng: -97.112027 };
  const homeOnly = { home, radiusKm: 6 };
  const withWork = { home, work, radiusKm: 6 };
  assert.ok(smartMatchScore(nearHome, homeOnly, NOW).total > smartMatchScore(nearWork, homeOnly, NOW).total);
  assert.ok(smartMatchScore(nearWork, withWork, NOW).total > smartMatchScore(nearHome, withWork, NOW).total);
});

test("a scoring throw falls back to nearest instead of failing the sort", () => {
  const near = listing({ id: "near", lat: 49.905, lng: -97.14 });
  const far = listing({ id: "far", lat: 50.05, lng: -97.14 });
  const cmp = compareSmartMatchOrNearest({}, near, { home: HOME, radiusKm: 25 }, NOW);
  assert.equal(typeof cmp, "number");
  assert.equal(Number.isFinite(cmp), true);
  assert.ok(compareSmartMatchOrNearest(near, far, { home: HOME, radiusKm: 25 }, NOW) < 0);
});

test("the flag defaults to nearest and an explicit override wins", () => {
  assert.equal(assignRankingVariant({ flag: undefined }), "nearest");
  assert.equal(assignRankingVariant({ flag: false }), "nearest");
  assert.equal(assignRankingVariant({ flag: true }), "best_match");
  assert.equal(assignRankingVariant({ flag: false, override: "best" }), "best_match");
  assert.equal(assignRankingVariant({ flag: true, override: "nearest" }), "nearest");
  assert.equal(parseRankingOverride("best"), "best");
  assert.equal(parseRankingOverride("distance"), "nearest");
  assert.equal(parseRankingOverride("nope"), null);
  const bucket = rankingBucket("parent-search-1");
  assert.ok(bucket.bucket >= 0 && bucket.bucket < 100);
  assert.equal(bucket.inRollout, bucket.bucket < 50);
});

test("ranking events keep an allowlist and drop contact or child fields", () => {
  assert.deepEqual(
    [...RANKING_EVENTS],
    [
      "search_performed",
      "listing_viewed",
      "listing_saved",
      "compare_opened",
      "tour_requested",
      "spot_requested",
      "message_started",
      "phone_clicked",
      "website_clicked",
    ],
  );
  const props = rankingEventProperties({
    city: "Winnipeg",
    age_group: "infant",
    sort: "best",
    result_count: 4,
    listing_id: "abc",
    position: 1,
    variant: "best_match",
    email: "parent@example.com",
    phone: "2045550100",
    child_name: "A",
    birthdate: "2024-01-01",
    message: "hello",
  });
  assert.deepEqual(props, {
    city: "Winnipeg",
    age_group: "infant",
    sort: "best",
    result_count: 4,
    listing_id: "abc",
    position: 1,
    variant: "best_match",
  });
  assert.equal("email" in props, false);
  assert.equal("phone" in props, false);
  assert.equal("child_name" in props, false);
});

test("the demand table and CSV have no personal columns", () => {
  const rows = buildMarketRows({
    asOf: "2026-09-29",
    now: NOW,
    listings: [
      {
        city: "Winnipeg, MB",
        ageMinMonths: 0,
        ageMaxMonths: 36,
        agesKnown: true,
        spotsInfant: 1,
        spotsToddler: 0,
        spotsPreschool: 0,
        vacancyUpdatedAt: new Date(NOW - DAY).toISOString(),
      },
      {
        city: "123 Main Street",
        ageMinMonths: 0,
        ageMaxMonths: 36,
        agesKnown: true,
        spotsInfant: 1,
        spotsToddler: 0,
        spotsPreschool: 0,
        vacancyUpdatedAt: new Date(NOW - DAY).toISOString(),
      },
    ],
    searches: [{ city: "Winnipeg", ageGroup: "infant", n: 3 }],
    saves: [{ city: "Winnipeg", ageGroup: "any", n: 1 }],
    spotRequests: [{ city: "Winnipeg", ageGroup: "infant", n: 2 }],
  });
  assert.ok(rows.every((row) => row.city === "Winnipeg"));
  assert.equal(
    rows.some((row) => row.city.includes("Main")),
    false,
  );
  const csv = rankingMarketCsv(rows);
  assert.match(csv.split("\n")[0], /^city,age_group,as_of,searches,saves,spot_requests,listings,confirmed_openings$/);
  assert.doesNotMatch(csv, /email|phone|child|birth|name@/i);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), [
      "ageGroup",
      "asOf",
      "city",
      "confirmedOpenings",
      "listings",
      "saves",
      "searches",
      "spotRequests",
    ]);
  }
});
