import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compareDistanceKm, compareDistancePoint, compareFeeAfterSubsidy } from "../src/lib/compare-parent-fields.ts";
import { parentCompareMax } from "../src/lib/parent-plus-access.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";

test("compare stays open for two or three centres while subscriptions are off", () => {
  assert.equal(FLAG_DEFAULTS.SUBSCRIPTIONS_ENABLED, false);
  const guest = parentCompareMax({ subscriptionsOn: false, role: null, paid: false });
  const parent = parentCompareMax({ subscriptionsOn: false, role: "parent", paid: false });
  assert.ok(guest >= 3);
  assert.ok(parent >= 3);
  assert.equal(guest, 5);
  assert.equal(parent, 10);
});

test("fee after the program shows only a listing-level cited fee; a published daily amount is a program, not a fee", () => {
  const confirmed = compareFeeAfterSubsidy(
    {
      preschoolMonthly: 1200,
      factSource: "Centre fee sheet",
      feeConfirmed: true,
      feeConfidence: "centre",
      province: "ON",
    },
    "en",
  );
  assert.match(confirmed, /1,200/);
  assert.doesNotMatch(confirmed, /Ask the centre/);

  const programOnly = compareFeeAfterSubsidy(
    {
      preschoolMonthly: 900,
      feeConfirmed: true,
      feeConfidence: "centre",
      province: "MB",
      city: "Winnipeg",
      name: "Example Centre",
      feeProgram: "mb-10-day",
      agesKnown: true,
      ageMinMonths: 12,
      ageMaxMonths: 48,
    },
    "en",
  );
  assert.match(programOnly, /\$10 a day/);
  assert.doesNotMatch(programOnly, /900/);

  // KB-55: a "confirmed" flag without a fee citation, or a provincial page as the citation, is not a fee.
  const uncited = { preschoolMonthly: 1200, feeConfirmed: true, feeConfidence: "centre", province: "ON" };
  assert.equal(compareFeeAfterSubsidy(uncited, "en"), "Ask the centre");
  assert.equal(compareFeeAfterSubsidy({ ...uncited, factSource: "https://www.ontario.ca/page/child-care-fees" }, "fr"), "Renseignez-vous auprès du centre");

  const unknown = compareFeeAfterSubsidy({ province: "ON", preschoolMonthly: 218 }, "fr");
  assert.equal(unknown, "Renseignez-vous auprès du centre");
});

test("distance uses the saved commute address before the home pin", () => {
  const home = { lat: 49.8951, lng: -97.1384, label: "Home" };
  const commute = { lat: 49.9, lng: -97.14, label: "Work" };
  const centre = { lat: 49.8844, lng: -97.147 };
  const fromWork = compareDistancePoint({ home, commute, located: true });
  assert.equal(fromWork?.from, "commute");
  const km = compareDistanceKm(fromWork, centre);
  assert.equal(typeof km, "number");
  assert.ok((km ?? 0) > 0);
  const fromHome = compareDistancePoint({ home, commute: null, located: true });
  assert.equal(fromHome?.from, "home");
  assert.equal(compareDistancePoint({ home, commute: null, located: false }), null);
});

test("the compare page shows the fee and commute rows", () => {
  const page = readFileSync(new URL("../src/routes/compare.tsx", import.meta.url), "utf8");
  assert.match(page, /compareFeeAfterSubsidy/);
  assert.match(page, /compareDistancePoint/);
  assert.match(page, /compare-fee-after/);
  assert.match(page, /compare-commute-distance/);
});
