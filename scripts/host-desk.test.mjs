import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  billLabel,
  chartHasEarnings,
  insightsCardRating,
  paidMonthBars,
  parentHeadline,
  recentMonthPeriods,
  shapeHostEarnings,
} from "../src/lib/host-desk.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const now = new Date(2026, 9, 15, 12, 0, 0);

test("earnings bars use paid bills only and never invent a month total", () => {
  assert.deepEqual(recentMonthPeriods(now, 3), ["2026-08", "2026-09", "2026-10"]);
  const shaped = shapeHostEarnings(
    [
      {
        id: "paid-now",
        status: "paid",
        netCents: 4200,
        period: "2026-10",
        paidAt: "2026-10-02",
        dueAt: null,
        parentName: "Alex",
        childName: "Rowan",
        number: "KE-1",
        centreName: "North Elm",
      },
      {
        id: "sent",
        status: "sent",
        netCents: 1500,
        period: "2026-10",
        paidAt: null,
        dueAt: "2026-10-20",
        parentName: null,
        childName: null,
        number: "KE-2",
        centreName: null,
      },
      {
        id: "old",
        status: "paid",
        netCents: 800,
        period: "2026-08",
        paidAt: "2026-08-04",
        dueAt: null,
        parentName: "Sam",
        childName: null,
        number: null,
        centreName: null,
      },
    ],
    now,
  );
  assert.equal(shaped.ok, true);
  assert.equal(shaped.thisMonthCents, 4200);
  assert.equal(shaped.upcoming.length, 1);
  assert.equal(shaped.upcoming[0]?.id, "sent");
  assert.equal(billLabel(shaped.upcoming[0]), "KE-2");
  assert.equal(shaped.paid[0]?.id, "paid-now");
  const august = shaped.bars.find((bar) => bar.period === "2026-08");
  const october = shaped.bars.find((bar) => bar.period === "2026-10");
  const september = shaped.bars.find((bar) => bar.period === "2026-09");
  assert.equal(august?.cents, 800);
  assert.equal(october?.cents, 4200);
  assert.equal(september?.cents, 0);
  assert.equal(chartHasEarnings(paidMonthBars([], now)), false);
  assert.equal(shapeHostEarnings([], now).thisMonthCents, null);
});

test("insights rating prefers the listing number and hides an empty parent set", () => {
  assert.equal(parentHeadline([]), null);
  assert.deepEqual(parentHeadline([{ rating: 4 }, { rating: 5 }]), { ratingX10: 45, reviewCount: 2 });
  assert.deepEqual(
    insightsCardRating({
      listingRatingX10: 46,
      listingReviewCount: 10,
      parentRatingX10: 50,
      parentReviewCount: 1,
    }),
    { ratingX10: 46, reviewCount: 10 },
  );
  assert.deepEqual(
    insightsCardRating({
      listingRatingX10: null,
      listingReviewCount: null,
      parentRatingX10: 40,
      parentReviewCount: 2,
    }),
    { ratingX10: 40, reviewCount: 2 },
  );
  assert.equal(
    insightsCardRating({
      listingRatingX10: 0,
      listingReviewCount: 0,
      parentRatingX10: null,
      parentReviewCount: null,
    }),
    null,
  );
});

test("earnings and insights screens stay free of plan and upgrade links", () => {
  const earnings = read("src/components/host-earnings-screen.tsx");
  const insights = read("src/components/host-insights-screen.tsx");
  const menu = read("src/components/app-menu-screen.tsx");
  for (const source of [earnings, insights]) {
    assert.doesNotMatch(source, /\/plans|\/pricing|navUpgrade|Upgrade/);
  }
  assert.match(earnings, /data-ke="host-earnings"/);
  assert.match(insights, /data-ke="host-insights"/);
  assert.match(insights, /insightsViews/);
  assert.match(menu, /screen: "earnings"/);
  assert.match(menu, /screen: "insights"/);
  assert.match(menu, /data-ke="menu-earnings"/);
  assert.match(menu, /data-ke="menu-insights"/);
  assert.doesNotMatch(menu, /loadMenuProviderCards/);
  assert.match(earnings, /KidBlocks/);
  assert.match(insights, /KidStars/);
  assert.match(earnings, /prefers-reduced-motion|CountUp/);
  assert.match(read("src/styles.css"), /prefers-reduced-motion: no-preference[\s\S]*\.ke-bar-grow/);
  assert.match(read("src/styles.css"), /prefers-reduced-motion: reduce/);
  assert.match(read("src/components/count-up.tsx"), /prefers-reduced-motion: reduce/);
});
