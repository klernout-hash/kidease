import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { topRatedEnabled } from "../src/lib/features.ts";
import { evaluateTopRated, topRatedRevoked } from "../src/lib/top-rated.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = Date.parse("2026-11-04T15:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function passing(extra = {}) {
  return {
    now: NOW,
    rating12mo: 4.8,
    reviewCount12mo: 10,
    licencesValid: true,
    certificatesValid: true,
    screeningsValid: true,
    repliesWithin24hPct: 90,
    spotsConfirmedAt: NOW - 14 * DAY,
    upheldSafetyReports12mo: 0,
    ...extra,
  };
}

test("FEATURE_TOP_RATED_BADGE stays off and is not a government rating", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_TOP_RATED_BADGE, false);
  assert.equal(topRatedEnabled({}), false);
  assert.equal(topRatedEnabled({ FEATURE_TOP_RATED_BADGE: "1" }), true);
  assert.match(src(".env.example"), /^FEATURE_TOP_RATED_BADGE=0$/m);
  assert.match(src("src/lib/copy-en.ts"), /not a government rating/);
  assert.match(src("src/lib/copy-fr.ts"), /pas une note du gouvernement/);
  assert.match(src("src/components/daycare-card.tsx"), /TopRatedBadge/);
});

test("the mark needs every rule, and the boundaries fail closed", () => {
  assert.equal(evaluateTopRated(passing()).pass, true);
  assert.equal(evaluateTopRated(passing({ rating12mo: 4.79 })).pass, false);
  assert.equal(evaluateTopRated(passing({ reviewCount12mo: 9 })).pass, false);
  assert.equal(evaluateTopRated(passing({ repliesWithin24hPct: 89 })).pass, false);
  assert.equal(evaluateTopRated(passing({ spotsConfirmedAt: NOW - 15 * DAY })).pass, false);
  assert.equal(evaluateTopRated(passing({ rating12mo: null })).pass, false);
  assert.equal(evaluateTopRated(passing({ licencesValid: false })).pass, false);
  assert.equal(evaluateTopRated(passing({ upheldSafetyReports12mo: 1 })).pass, false);
});

test("an expired certificate or an upheld safety report removes the mark now", () => {
  assert.equal(topRatedRevoked({ certificateExpired: true }), true);
  assert.equal(topRatedRevoked({ safetyUpheld: true }), true);
  assert.equal(topRatedRevoked({}), false);
  assert.match(src("src/lib/desk-nav.ts"), /topRated === true/);
});
