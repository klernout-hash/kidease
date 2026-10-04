import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SITEMAP_STATIC_PATHS } from "../src/lib/sitemap.ts";
import {
  VACANCY_SPOT_CAP,
  boundedSpots,
  buildVacancyIndex,
  provinceCodeOf,
  usableAgeRange,
} from "../src/lib/vacancy-index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("province codes and spot caps stay inside the real data", () => {
  assert.equal(provinceCodeOf("manitoba"), "MB");
  assert.equal(provinceCodeOf("QC"), "QC");
  assert.equal(provinceCodeOf("not a place"), "");
  assert.equal(boundedSpots(3), 3);
  assert.equal(boundedSpots(0), 0);
  assert.equal(boundedSpots(VACANCY_SPOT_CAP + 1), null);
  assert.equal(boundedSpots(-1), null);
  assert.equal(usableAgeRange({ agesKnown: false, ageMinMonths: 0, ageMaxMonths: 18 }), null);
  assert.deepEqual(usableAgeRange({ ageMinMonths: 0, ageMaxMonths: 36 }), { min: 0, max: 36 });
});

test("the index counts public centres and only confirmed spots", () => {
  const index = buildVacancyIndex(
    [
      {
        province: "MB",
        ageMinMonths: 0,
        ageMaxMonths: 72,
        agesKnown: true,
        spotsInfant: 2,
        spotsToddler: 0,
        spotsPreschool: 1,
        vacancyConfirmed: true,
      },
      {
        province: "MB",
        ageMinMonths: 0,
        ageMaxMonths: 18,
        agesKnown: true,
        spotsInfant: 9,
        spotsToddler: 9,
        spotsPreschool: 9,
        vacancyConfirmed: false,
      },
      {
        province: "MB",
        spotsInfant: 40,
        vacancyConfirmed: false,
      },
      {
        province: "ON",
        ageMinMonths: 0,
        ageMaxMonths: 144,
        agesKnown: true,
        spotsInfant: 900,
        vacancyConfirmed: true,
      },
      { province: "ZZ", spotsInfant: 4, vacancyConfirmed: true },
    ],
    "2026-10-04",
  );
  assert.equal(index.countedOn, "2026-10-04");
  assert.equal(index.totalCentres, 5);
  assert.equal(index.unplaced, 1);
  const mb = index.provinces.find((row) => row.code === "MB");
  assert.equal(mb.centres, 3);
  assert.equal(mb.agesUnknown, 1);
  const infant = mb.bands.find((band) => band.band === "infant");
  const toddler = mb.bands.find((band) => band.band === "toddler");
  const school = mb.bands.find((band) => band.band === "school-age");
  assert.equal(infant.centres, 2);
  assert.equal(infant.openSpots, 2);
  assert.equal(toddler.centres, 1);
  assert.equal(toddler.openSpots, 0);
  assert.equal(school.centres, 0);
  assert.equal(school.openSpots, null);
  assert.equal(school.spotsTracked, false);
  const on = index.provinces.find((row) => row.code === "ON");
  const onInfant = on.bands.find((band) => band.band === "infant");
  assert.equal(onInfant.centres, 1);
  assert.equal(onInfant.openSpots, null);
  const pe = index.provinces.find((row) => row.code === "PE");
  assert.equal(pe.centres, 0);
  assert.equal(pe.bands.every((band) => band.openSpots == null), true);
});

test("the vacancy page is public, sourced, and has no upgrade path", () => {
  const page = src("src/routes/vacancy-index.tsx");
  assert.match(page, /createFileRoute\("\/vacancy-index"\)/);
  assert.match(page, /loadVacancyIndex/);
  assert.match(page, /vacancyIndexMethodT/);
  assert.match(page, /to="\/search"/);
  assert.match(page, /to="\/cities"/);
  assert.match(page, /to="\/contact"/);
  assert.doesNotMatch(page, /\/plans/);
  assert.doesNotMatch(page, /upgrade/i);
  assert.doesNotMatch(page, /free forever/i);
  const server = src("src/lib/server/vacancy-index.ts");
  assert.match(server, /PUBLIC_LISTING_SQL/);
  assert.match(server, /ages_confirmed/);
  assert.match(server, /last_vacancy_updated_at/);
  assert.doesNotMatch(server, /infant_monthly|toddler_monthly|preschool_monthly/);
  assert.ok(SITEMAP_STATIC_PATHS.includes("/vacancy-index"));
  assert.match(src("public/sitemap.xml"), /https:\/\/www\.kidease\.ca\/vacancy-index/);
  assert.match(src("src/routes/cities.tsx"), /to="\/vacancy-index"/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /vacancyIndexTitle: "Open spots by province"/);
  assert.match(copy, /Fees are not on this page/);
  assert.doesNotMatch(copy.slice(copy.indexOf("vacancyIndexTitle"), copy.indexOf("vacancyIndexContact") + 40), /—/);
});
