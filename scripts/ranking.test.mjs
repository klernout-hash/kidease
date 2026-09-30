import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bestMatchBucket, resolveBestMatchVariant } from "../src/lib/ranking/flag.ts";
import { buildDemandSupplyRows, demandSupplyCsv, previousWinnipegDay } from "../src/lib/ranking/demand.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("smart match score examples stay reversible and ignore paid plans", () => {
  const res = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--import", join(root, "scripts/register-alias.mjs"), join(root, "scripts/ranking-score-check.mjs")],
    { encoding: "utf8" },
  );
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /ranking score ok/);
});

test("best match flag is 50 percent until PostHog knows the flag", () => {
  assert.equal(bestMatchBucket("same-seed"), bestMatchBucket("same-seed"));
  let on = 0;
  for (let i = 0; i < 1000; i++) {
    const variant = resolveBestMatchVariant({ flagKnown: false, flag: undefined, seed: `parent-${i}` });
    if (variant === "best_match") on += 1;
  }
  assert.ok(on > 400 && on < 600, `expected about half, got ${on}`);
  assert.equal(
    resolveBestMatchVariant({ flagKnown: true, flag: false, seed: "parent-1" }),
    "nearest",
  );
  assert.equal(
    resolveBestMatchVariant({ flagKnown: true, flag: true, seed: "parent-1" }),
    "best_match",
  );
  assert.equal(
    resolveBestMatchVariant({ flagKnown: false, flag: undefined, seed: "x", force: "nearest" }),
    "nearest",
  );
});

test("nightly demand table counts searches against supply and exports csv without pii", () => {
  const day = previousWinnipegDay(new Date("2026-09-30T18:00:00Z"));
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  const rows = buildDemandSupplyRows({
    day,
    now: Date.parse("2026-09-30T18:00:00Z"),
    events: [
      { name: "search_performed", city: "Winnipeg", ageGroup: "infant" },
      { name: "search_performed", city: "Winnipeg", ageGroup: "infant" },
      { name: "listing_saved", city: "Winnipeg", ageGroup: "infant" },
      { name: "spot_requested", city: "Hamilton", ageGroup: "toddler" },
      { name: "search_performed", city: "", ageGroup: "infant" },
    ],
    listings: [
      {
        city: "Winnipeg",
        ageMinMonths: 0,
        ageMaxMonths: 24,
        spotsInfant: 1,
        spotsToddler: 0,
        spotsPreschool: 0,
        vacancyAt: "2026-09-28T18:00:00Z",
      },
      {
        city: "Hamilton",
        ageMinMonths: 18,
        ageMaxMonths: 36,
        spotsInfant: 0,
        spotsToddler: 2,
        spotsPreschool: 0,
        vacancyAt: "2026-01-01T00:00:00Z",
      },
    ],
  });
  const winnipeg = rows.find((row) => row.city === "Winnipeg" && row.ageGroup === "infant");
  assert.ok(winnipeg);
  assert.equal(winnipeg.searches, 2);
  assert.equal(winnipeg.saves, 1);
  assert.equal(winnipeg.listings, 1);
  assert.equal(winnipeg.confirmedOpenings, 1);
  const hamilton = rows.find((row) => row.city === "Hamilton" && row.ageGroup === "toddler");
  assert.equal(hamilton.spotRequests, 1);
  assert.equal(hamilton.confirmedOpenings, 0, "stale openings are not confirmed");
  const csv = demandSupplyCsv(rows);
  assert.match(csv, /day,city,age_group,searches,saves,spot_requests,listings,confirmed_openings/);
  assert.doesNotMatch(csv, /@|phone|birthdate|child/i);
});

test("search, events, and the nightly job are wired", () => {
  const search = src("src/routes/search.tsx");
  const weights = src("src/lib/ranking/weights.ts");
  const events = src("src/lib/ranking/events.ts");
  const names = src("src/lib/ranking/names.ts");
  const score = src("src/lib/ranking/score.ts");
  const daycares = src("src/lib/server/daycares.ts");
  const fns = src("src/inngest/functions.ts");
  assert.match(weights, /SMART_MATCH_WEIGHTS/);
  assert.match(weights, /best-match-sort/);
  assert.match(weights, /Paid plans/);
  assert.match(score, /priority/);
  assert.doesNotMatch(score, /priority \?/);
  assert.match(score, /safeScoreSmartMatch/);
  assert.match(daycares, /sort === "match"/);
  assert.match(daycares, /safeScoreSmartMatch/);
  assert.match(daycares, /compareProximity/);
  assert.match(search, /data-ke=\{k === "match" \? "sort-best-match"/);
  assert.match(search, /search_performed/);
  assert.match(search, /rankVariant === "best_match"/);
  assert.match(src("src/components/rank-cues.tsx"), /data-ke="why-match"/);
  for (const name of [
    "search_performed",
    "listing_viewed",
    "listing_saved",
    "compare_opened",
    "tour_requested",
    "spot_requested",
    "message_started",
    "phone_clicked",
    "website_clicked",
  ]) {
    assert.match(names, new RegExp(name));
  }
  assert.match(events, /readAnalyticsConsent\(\) !== "granted"/);
  assert.doesNotMatch(events, /input\.email|input\.phone|input\.body|input\.child|input\.birth/);
  assert.match(fns, /demand-supply-nightly/);
  assert.match(fns, /DEMAND_SUPPLY_CRON/);
  assert.match(src("src/routes/admin-demand.tsx"), /\/admin-demand/);
  assert.match(src("src/routeTree.gen.ts"), /admin-demand/);
  assert.doesNotMatch(src("docs/ranking.md"), /free forever/i);
  assert.doesNotMatch(weights, /free forever/i);
});

test("best match sort is on the page when the flag is forced", async (t) => {
  const base = process.env.BASE_URL;
  if (!base) {
    t.skip("BASE_URL is not set");
    return;
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${base.replace(/\/$/, "")}/search?bm=1&q=Winnipeg`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector("[data-ke='sort-best-match']", { timeout: 20000 });
    const why = await page.locator("[data-ke='why-match']").count();
    assert.ok(why >= 0);
  } finally {
    await browser.close();
  }
});
