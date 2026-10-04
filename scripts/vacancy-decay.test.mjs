import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  VACANCY_DECAY_FLOOR,
  VACANCY_UNCONFIRMED_FACTOR,
  compareVacancyDecay,
  vacancyDecayFactor,
  vacancyRankWeight,
  vacancyUnconfirmed,
} from "../src/lib/vacancy-decay.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const now = Date.parse("2026-10-03T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function stamp(daysAgo) {
  if (daysAgo == null) return { lastVacancyUpdatedAt: null, spotsUpdatedAt: null };
  return { lastVacancyUpdatedAt: new Date(now - daysAgo * day).toISOString(), spotsUpdatedAt: null };
}

test("vacancy rank drops as a confirmation ages and never reaches zero", () => {
  const fresh = vacancyDecayFactor(stamp(0), now);
  const month = vacancyDecayFactor(stamp(30), now);
  const old = vacancyDecayFactor(stamp(200), now);
  const missing = vacancyDecayFactor(stamp(null), now);
  assert.equal(fresh, 1);
  assert.ok(month < fresh && month > 0.6 && month < 0.7);
  assert.equal(old, VACANCY_DECAY_FLOOR);
  assert.equal(missing, VACANCY_UNCONFIRMED_FACTOR);
  assert.ok(vacancyRankWeight(stamp(200), now) > 0.9);
  assert.ok(vacancyRankWeight(stamp(null), now) > 0);
  assert.equal(vacancyUnconfirmed(stamp(null), now), true);
  assert.equal(vacancyUnconfirmed(stamp(10), now), false);
  assert.equal(vacancyUnconfirmed(stamp(30), now), true);
  assert.ok(compareVacancyDecay(stamp(0), stamp(40), now) < 0);
  assert.equal(compareVacancyDecay(stamp(null), stamp(null), now), 0);
});

test("a fresh confirm outranks a stale one, and the weight stays above zero", () => {
  const freshWeight = vacancyRankWeight(stamp(1), now);
  const oldWeight = vacancyRankWeight(stamp(90), now);
  const missingWeight = vacancyRankWeight(stamp(null), now);
  assert.ok(freshWeight > oldWeight);
  assert.ok(oldWeight > 0.9);
  assert.ok(missingWeight > oldWeight);
  assert.ok(missingWeight < freshWeight);
});

test("search keeps unconfirmed listings and the admin desk flags 30 days", () => {
  const proximity = src("src/lib/proximity.ts");
  const compare = proximity.slice(proximity.indexOf("export function compareProximity"));
  const scoreAt = compare.indexOf("proximityScore(b) - proximityScore(a)");
  const freshAt = compare.indexOf("compareFreshOpenSpots");
  const distanceAt = compare.indexOf("a.distanceKm - b.distanceKm");
  const decayAt = compare.indexOf("compareVacancyDecay");
  assert.ok(scoreAt >= 0 && decayAt > scoreAt && freshAt > decayAt && distanceAt > freshAt);
  assert.match(proximity, /quality \* near \* vacancyRankWeight/);
  assert.doesNotMatch(proximity.slice(proximity.indexOf("export function proximityScore")), /vacancyDecayFactor/);

  const search = src("src/lib/server/daycares.ts");
  assert.doesNotMatch(search, /vacancyUnconfirmed|VACANCY_STALE_DAYS/);
  assert.match(search, /compareProximity\(left, right\)/);

  const admin = src("src/routes/admin-vacancies.tsx");
  assert.match(admin, /data-ke="vacancy-unconfirmed"/);
  assert.match(admin, /Unconfirmed for 30 days or more/);
  assert.match(admin, /stay in search/);
  const query = src("src/lib/server/vacancy-stale.ts");
  assert.match(query, /interval '30 days'/);
  assert.match(query, /does not remove anyone from search/);
  assert.doesNotMatch(query, /d_d85jtifbkh2t/);
});
