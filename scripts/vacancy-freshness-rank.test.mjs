import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { copy } from "../src/lib/copy.ts";
import {
  compareFreshOpenSpots,
  openSpotsConfirmedRecently,
  vacancyPublicWindow,
  vacancyUpdatedThisWeek,
} from "../src/lib/vacancy-rank.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const now = Date.parse("2026-10-03T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function row(over = {}) {
  return {
    spotsTotal: 2,
    spotsInfant: 1,
    spotsToddler: 1,
    spotsPreschool: 0,
    lastVacancyUpdatedAt: null,
    spotsUpdatedAt: null,
    ...over,
  };
}

test("public vacancy labels name a confirm date or say spots are not confirmed", () => {
  assert.equal(vacancyPublicWindow(null, now), "unknown");
  assert.equal(vacancyPublicWindow(new Date(now - 3 * day).toISOString(), now), "recent");
  assert.equal(vacancyPublicWindow(new Date(now - 40 * day).toISOString(), now), "out_of_date");
  assert.equal(copy.en.vacancyNotConfirmed, "Spots not confirmed yet");
  assert.equal(copy.en.vacancyUpdated, "Spots confirmed");
  assert.equal(copy.en.vacancyMayBeOutOfDate, "May be out of date");
  assert.match(copy.en.vacancyOutOfDateLead, /30 days/);
  assert.match(copy.fr.vacancyNotConfirmed, /pas encore confirmées/);
  assert.doesNotMatch(
    copy.en.vacancyNotConfirmed + copy.en.vacancyMayBeOutOfDate + copy.en.deskUpdatedThisWeek,
    /—|free forever|Winnipeg/i,
  );
  const view = src("src/components/vacancy-freshness.tsx");
  assert.match(view, /vacancyPublicWindow/);
  assert.match(view, /vacancyNotConfirmed/);
  assert.match(view, /vacancyMayBeOutOfDate/);
  assert.match(view, /\$\{t\("vacancyUpdated"\)\}/);
  assert.match(src("src/components/daycare-card.tsx"), /data-ke="vacancy-confirmed"/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /VacancyFreshness/);
});

test("confirmed open spots from the last 30 days sort ahead only after relevance", () => {
  const fresh = row({ lastVacancyUpdatedAt: new Date(now - 20 * day).toISOString() });
  const quiet = row({
    spotsTotal: 0,
    spotsInfant: 0,
    spotsToddler: 0,
    lastVacancyUpdatedAt: new Date(now - 2 * day).toISOString(),
  });
  const never = row();
  const oldOpen = row({ lastVacancyUpdatedAt: new Date(now - 40 * day).toISOString() });

  assert.equal(openSpotsConfirmedRecently(fresh, now), true);
  assert.equal(openSpotsConfirmedRecently(quiet, now), false);
  assert.equal(openSpotsConfirmedRecently(never, now), false);
  assert.equal(openSpotsConfirmedRecently(oldOpen, now), false);
  assert.equal(compareFreshOpenSpots(fresh, never, now), -1);
  assert.equal(compareFreshOpenSpots(never, fresh, now), 1);
  assert.equal(compareFreshOpenSpots(fresh, fresh, now), 0);

  const rank = src("src/lib/vacancy-rank.ts");
  const start = rank.indexOf("export function compareFreshOpenSpots");
  const end = rank.indexOf("export function vacancyUpdatedThisWeek");
  assert.doesNotMatch(rank.slice(start, end), /priority|featuredCity|paid|plan/);

  const proximity = src("src/lib/proximity.ts");
  const compare = proximity.slice(proximity.indexOf("export function compareProximity"));
  const scoreAt = compare.indexOf("proximityScore(b) - proximityScore(a)");
  const freshAt = compare.indexOf("compareFreshOpenSpots");
  const distanceAt = compare.indexOf("a.distanceKm - b.distanceKm");
  assert.ok(scoreAt >= 0 && freshAt > scoreAt && distanceAt > freshAt);

  const search = src("src/lib/server/daycares.ts");
  const sort = search.slice(search.indexOf("compareWithPaidPins(a, b"));
  assert.ok(sort.startsWith("compareWithPaidPins"));
  assert.ok(sort.indexOf("compareFreshOpenSpots") > 0);
  assert.match(src("src/lib/ranking/score.ts"), /compareFreshOpenSpots/);
});

test("desk badge and save path use the real vacancy timestamp", () => {
  assert.equal(vacancyUpdatedThisWeek(row({ lastVacancyUpdatedAt: new Date(now - 2 * day).toISOString() }), now), true);
  assert.equal(vacancyUpdatedThisWeek(row({ lastVacancyUpdatedAt: new Date(now - 10 * day).toISOString() }), now), false);
  assert.equal(copy.en.deskUpdatedThisWeek, "Updated this week");
  assert.match(src("src/components/daycare-desk-home.tsx"), /data-ke="updated-this-week"/);
  assert.match(src("src/lib/server/claims.ts"), /last_vacancy_updated_at = case/);
  assert.match(src("migrations/0024_listing_freshness_reviews.sql"), /last_vacancy_updated_at/);
});
