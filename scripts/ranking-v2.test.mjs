import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { rankingV2Enabled } from "../src/lib/features.ts";
import {
  excludeRankingV2,
  rankingV2Bonus,
  rankingV2TieBreak,
} from "../src/lib/ranking/v2.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = Date.parse("2026-11-04T15:00:00.000Z");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("FEATURE_RANKING_V2 stays off", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_RANKING_V2, false);
  assert.equal(rankingV2Enabled({}), false);
  assert.equal(rankingV2Enabled({ FEATURE_RANKING_V2: "1" }), true);
  assert.match(src(".env.example"), /^FEATURE_RANKING_V2=0$/m);
  assert.match(src("docs/ranking-v2-gap-report.md"), /Critical/);
});

test("flag off keeps the current order, including ties", () => {
  const cards = [
    { id: "far", distanceKm: 12 },
    { id: "near", distanceKm: 2, spotsUpdatedAt: "2026-11-04T12:00:00.000Z" },
    { id: "mid", distanceKm: 5 },
  ];
  const base = (a, b) => a.distanceKm - b.distanceKm;
  const off = [...cards].sort((a, b) => rankingV2TieBreak(a, b, base, { enabled: false, now: NOW }));
  const plain = [...cards].sort(base);
  assert.deepEqual(off.map((card) => card.id), plain.map((card) => card.id));
  assert.deepEqual(
    excludeRankingV2(
      [
        { id: "keep", blocked: true },
        { id: "also", closedToday: true },
      ],
      false,
    ).map((card) => card.id),
    ["keep", "also"],
  );
});

test("flag on nudges a tie and hides a blocked or closed centre", () => {
  const stale = { id: "stale", distanceKm: 4, spotsUpdatedAt: "2026-01-01T00:00:00.000Z" };
  const fresh = { id: "fresh", distanceKm: 4, spotsUpdatedAt: "2026-11-03T12:00:00.000Z" };
  const base = (a, b) => a.distanceKm - b.distanceKm;
  const ctx = { enabled: true, now: NOW, ageGroup: "toddler" };
  assert.ok(rankingV2TieBreak(stale, fresh, base, ctx) > 0);
  const toddler = { id: "age", ageMinMonths: 18, ageMaxMonths: 36 };
  assert.ok(rankingV2Bonus(toddler, ctx) > rankingV2Bonus({ id: "other", ageMinMonths: 60, ageMaxMonths: 144 }, ctx));
  assert.equal(rankingV2Bonus({ id: "paid", featuredCity: true, priority: true }, ctx), 0);
  const kept = excludeRankingV2(
    [
      { id: "open" },
      { id: "blocked", blocked: true },
      { id: "closed", closedToday: true },
    ],
    true,
  );
  assert.deepEqual(kept.map((card) => card.id), ["open"]);
});

test("a new listing and Top Rated are small nudges, and unverified review volume is dampened", () => {
  const ctx = { enabled: true, now: NOW };
  const freshClaim = rankingV2Bonus({ id: "new", claimedAt: "2026-10-20T00:00:00.000Z" }, ctx);
  const oldClaim = rankingV2Bonus({ id: "old", claimedAt: "2024-01-01T00:00:00.000Z" }, ctx);
  assert.ok(freshClaim > oldClaim);
  assert.ok(rankingV2Bonus({ id: "badge", topRated: true }, ctx) > rankingV2Bonus({ id: "plain" }, ctx));
  const dampened = rankingV2Bonus({ id: "odd", reviewCount: 40, parentReviewCount: 0, ratingX10: 50 }, ctx);
  assert.ok(dampened < 0);
});

test("ranking v2 does not read paid placement", () => {
  const source = src("src/lib/ranking/v2.ts");
  assert.doesNotMatch(source, /featuredCity|priorityUntil|FEATURE_GOOGLE/);
  assert.match(src("src/lib/server/daycares.ts"), /rankingV2TieBreak/);
});
