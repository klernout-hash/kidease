import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ageMonthsFromBirthdate,
  bandsThatOpened,
  planSavedCentreAgeAlerts,
} from "../src/lib/saved-centre-age-alert.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";

test("only the age band that gained a spot is an opening", () => {
  assert.deepEqual(
    bandsThatOpened({ infant: 0, toddler: 1, preschool: 0 }, { infant: 1, toddler: 1, preschool: 0 }),
    ["infant"],
  );
  assert.deepEqual(
    bandsThatOpened({ infant: 1, toddler: 1, preschool: 2 }, { infant: 1, toddler: 0, preschool: 2 }),
    [],
  );
});

test("a saved centre alerts the parent whose child is that age", () => {
  const plan = planSavedCentreAgeAlerts({
    enabled: true,
    opened: ["toddler"],
    priorToday: [],
    parents: [
      { userId: "infant-parent", childMonths: [8] },
      { userId: "toddler-parent", childMonths: [24] },
      { userId: "no-age", childMonths: null },
    ],
  });
  assert.deepEqual(plan.matches, [{ userId: "toddler-parent", band: "toddler" }]);
  assert.deepEqual(plan.skipped, ["infant-parent"]);
  assert.deepEqual(plan.unknown, ["no-age"]);
  assert.equal(plan.capped.length, 0);
});

test("the daily cap holds a fourth opening alert", () => {
  const plan = planSavedCentreAgeAlerts({
    enabled: true,
    opened: ["preschool"],
    priorToday: [
      { userId: "parent" },
      { userId: "parent" },
      { userId: "parent" },
    ],
    parents: [{ userId: "parent", childMonths: [48] }],
  });
  assert.deepEqual(plan.matches, []);
  assert.deepEqual(plan.capped, ["parent"]);
});

test("the flag is on and mail still follows the existing open-spot flag", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_SAVED_CENTRE_AGE_ALERTS, true);
  assert.equal(FLAG_DEFAULTS.FEATURE_OPEN_SPOT_ALERTS, false);
  const fanout = readFileSync(new URL("../src/lib/server/alert-fanout.ts", import.meta.url), "utf8");
  assert.match(fanout, /planSavedCentreAgeAlerts/);
  assert.match(fanout, /child_age/);
  assert.match(fanout, /openSpotAlertsEnabled/);
  const copy = readFileSync(new URL("../src/lib/alert-push.ts", import.meta.url), "utf8");
  assert.match(copy, /Opening for your child's age/);
  assert.match(copy, /Place pour l'âge de votre enfant/);
});

test("a birthdate becomes an age in months", () => {
  assert.equal(ageMonthsFromBirthdate("2024-11-16", new Date("2026-11-16T12:00:00Z")), 24);
  assert.equal(ageMonthsFromBirthdate("not-a-date"), null);
});
