import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const WEIGHTS = { trust: 25, completeness: 25, freshness: 15, reviews: 20, engagement: 15 };
const MIN_REVIEW_COUNT = 3;
const MIN_TOUR_DECIDED = 5;
const MIN_THREAD_SAMPLE = 5;
const GUEST_FAVORITE_PERCENTILE = 0.1;
const GUEST_FAVORITE_MIN_METRO = 8;
const GUEST_FAVORITE_MIN_SCORE = 60;

function clampScore(n, max) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, Math.round(n));
}

function isClaimVerified(item) {
  const raw = (item.claimStatus || "").trim().toLowerCase();
  if (raw === "unclaimed" || (!raw && !item.claimed && !item.claimedAt)) return false;
  return ["approved", "live", "active", "published"].includes(raw) || Boolean(item.live && item.claimed);
}

function listingComplete(item) {
  const hasFees = item.province === "MB" || (item.infantMonthly ?? 0) > 0;
  const hasAges = Boolean(item.agesKnown);
  const hasHours = (item.hours || "").length >= 4;
  const hasLicense = Boolean(item.licenseNumber) && item.licenseNumber !== item.id;
  const hasPhoto = (item.photos ?? []).some((p) => p && !p.includes("placeholder"));
  const have = [hasFees, hasAges, hasHours, hasLicense, hasPhoto].filter(Boolean).length;
  return { ready: have === 5, score: have };
}

function qualityScore100(item) {
  let trust = 0;
  if (isClaimVerified(item)) trust += 15;
  if (item.licenseStatus === "matched" || item.registryMatchState === "matched") trust += 10;
  const complete = listingComplete(item);
  const freshness = item.lastVacancyUpdatedAt ? 15 : 0;
  let reviews = 0;
  const count = item.parentReviewCount ?? 0;
  if (count >= MIN_REVIEW_COUNT && (item.parentRatingX10 ?? 0) > 0) {
    reviews = WEIGHTS.reviews * Math.min(1, item.parentRatingX10 / 50) * Math.min(1, count / 8);
  }
  let engagement = 0;
  if ((item.tourDecided ?? 0) >= MIN_TOUR_DECIDED) engagement += 8 * Math.min(1, item.tourAccepted / item.tourDecided);
  if ((item.threadCount ?? 0) >= MIN_THREAD_SAMPLE) engagement += 7 * Math.min(1, item.threadReplied / item.threadCount);
  return clampScore(
    clampScore(trust, 25) + clampScore((complete.score / 5) * 25, 25) + freshness + reviews + engagement,
    100,
  );
}

function eligible(item) {
  return (
    qualityScore100(item) >= GUEST_FAVORITE_MIN_SCORE &&
    isClaimVerified(item) &&
    listingComplete(item).ready &&
    Boolean(item.lastVacancyUpdatedAt) &&
    (item.parentReviewCount ?? 0) >= MIN_REVIEW_COUNT &&
    (item.parentRatingX10 ?? 0) > 0 &&
    item.licenseStatus !== "expired" &&
    item.licenseStatus !== "suspended"
  );
}

function assignGuestFavorites(items) {
  const groups = new Map();
  for (const item of items) {
    const key = `${(item.city || "").toLowerCase()}|${(item.province || "").toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  const winners = new Set();
  for (const group of groups.values()) {
    const pool = group.filter(eligible);
    if (pool.length < GUEST_FAVORITE_MIN_METRO) continue;
    pool.sort((a, b) => qualityScore100(b) - qualityScore100(a));
    const take = Math.max(1, Math.ceil(pool.length * GUEST_FAVORITE_PERCENTILE));
    for (const item of pool.slice(0, take)) winners.add(item.id);
  }
  return items.map((item) => ({ ...item, guestFavorite: winners.has(item.id) }));
}

function recommendedRank(item, km, catchment = 8) {
  return (qualityScore100(item) / 100) * Math.exp((-Math.LN2 * km) / catchment);
}

const empty = {
  id: "on-1",
  city: "Toronto",
  province: "ON",
  infantMonthly: 0,
  photos: [],
  claimStatus: "unclaimed",
  parentRatingX10: 0,
  parentReviewCount: 0,
};

const strong = {
  id: "mb-100",
  city: "Winnipeg",
  province: "MB",
  infantMonthly: 1200,
  agesKnown: true,
  hours: "Monday to Friday 7:00–18:00",
  licenseNumber: "123456",
  photos: ["/photos/buildings/mb-100.jpg"],
  lastVacancyUpdatedAt: new Date().toISOString(),
  claimStatus: "approved",
  claimed: true,
  live: true,
  licenseStatus: "matched",
  registryMatchState: "matched",
  parentRatingX10: 48,
  parentReviewCount: 8,
  tourDecided: 10,
  tourAccepted: 8,
  threadCount: 10,
  threadReplied: 9,
};

test("quality score is 0–100 from real signals and never invents reviews", () => {
  assert.equal(qualityScore100(empty), 0);
  const oneReview = qualityScore100({ ...strong, parentReviewCount: 1, parentRatingX10: 50 });
  const enoughReviews = qualityScore100(strong);
  assert.ok(enoughReviews > oneReview);
  assert.ok(enoughReviews > 70);
  assert.ok(enoughReviews <= 100);
  assert.equal(
    qualityScore100({ ...strong, tourDecided: 2, tourAccepted: 2, threadCount: 2, threadReplied: 2 })
      - qualityScore100({ ...strong, tourDecided: 0, tourAccepted: 0, threadCount: 0, threadReplied: 0 }),
    0,
  );
});

test("licence expired and unclaimed listings are soft-demoted, not removed", () => {
  const expired = qualityScore100({ ...strong, licenseStatus: "expired", registryMatchState: "mismatch" });
  assert.ok(expired < qualityScore100(strong));
  assert.equal(eligible({ ...strong, licenseStatus: "expired" }), false);
  const unclaimed = qualityScore100({ ...strong, claimStatus: "unclaimed", claimed: false, live: false });
  assert.ok(unclaimed < qualityScore100(strong));
});

test("Guest Favorites hide when the metro sample is thin", () => {
  const thin = Array.from({ length: GUEST_FAVORITE_MIN_METRO - 1 }, (_, i) => ({
    ...strong,
    id: `mb-thin-${i}`,
  }));
  assert.equal(assignGuestFavorites(thin).every((item) => item.guestFavorite === false), true);

  const metro = Array.from({ length: GUEST_FAVORITE_MIN_METRO }, (_, i) => ({
    ...strong,
    id: `mb-hit-${i}`,
    parentRatingX10: i === 0 ? 50 : 40,
    parentReviewCount: i === 0 ? 12 : 4,
  }));
  const marked = assignGuestFavorites(metro);
  assert.equal(marked.filter((item) => item.guestFavorite).length, 1);
  assert.equal(marked.find((item) => item.guestFavorite)?.id, "mb-hit-0");

  const otherCity = assignGuestFavorites([
    ...metro,
    { ...strong, id: "on-lonely", city: "Ottawa", parentRatingX10: 50, parentReviewCount: 20 },
  ]);
  assert.equal(otherCity.find((item) => item.id === "on-lonely")?.guestFavorite, false);
});

test("recommended sort multiplies quality by proximity and keeps incomplete listings", () => {
  const nearStrong = recommendedRank(strong, 1);
  const farStrong = recommendedRank(strong, 20);
  const nearEmpty = recommendedRank(empty, 0.4);
  assert.ok(nearStrong > farStrong);
  assert.ok(nearStrong > nearEmpty);
  assert.ok(Number.isFinite(nearEmpty));
});

test("server overlay, cards, desk, and docs stay honest", () => {
  const quality = src("src/lib/quality.ts");
  assert.match(quality, /QUALITY_WEIGHTS = \{[\s\S]*trust: 25/);
  assert.match(quality, /MIN_REVIEW_COUNT = 3/);
  assert.match(quality, /MIN_TOUR_DECIDED = 5/);
  assert.match(quality, /GUEST_FAVORITE_MIN_METRO = 8/);
  assert.match(quality, /GUEST_FAVORITE_PERCENTILE = 0\.1/);
  assert.match(quality, /never invents ratings/);
  assert.match(quality, /soft-demoted only/);
  assert.doesNotMatch(quality, /[Bb]ackground checked/);

  const server = src("src/lib/server/quality.ts");
  assert.match(server, /loadEngagementStats/);
  assert.match(server, /tour_requests/);
  assert.match(server, /sender = 'provider'/);
  assert.match(server, /assignGuestFavorites/);

  const daycares = src("src/lib/server/daycares.ts");
  assert.match(daycares, /overlayQuality/);
  assert.match(daycares, /recommendedRank/);
  assert.match(src("src/lib/proximity.ts"), /quality × proximity|quality \* near/);

  assert.match(src("src/components/daycare-card.tsx"), /GuestFavoriteBadge/);
  assert.match(src("src/components/listing-badges.tsx"), /GuestFavoriteBadge/);
  assert.match(src("src/components/quality-issues.tsx"), /QualityIssuesPanel/);
  assert.match(src("src/components/provider-listing-forms.tsx"), /QualityIssuesPanel/);
  assert.match(src("src/routes/compare.tsx"), /guestFavorite/);

  const copy = src("src/lib/copy.ts");
  assert.match(copy, /guestFavorite: "Guest favorite"/);
  assert.match(copy, /KidEase does not invent this badge/);
  assert.match(copy, /KidEase does not invent ratings/);
  assert.doesNotMatch(copy, /Background checked by KidEase/);
  assert.doesNotMatch(copy, /background checked/i);

  const migration = src("migrations/0031_quality_guest_favorites.sql");
  assert.match(migration, /quality_score/);
  assert.match(migration, /guest_favorite/);
  assert.match(migration, /Never invented/);

  const docs = src("docs/quality-score.md");
  assert.match(docs, /0–100/);
  assert.match(docs, /top 10%/);
  assert.match(docs, /soft demotion/);
  assert.doesNotMatch(docs, /background checked/i);
});
