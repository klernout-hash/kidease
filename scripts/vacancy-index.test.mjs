import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { LOCALE_PAIRED_PATHS } from "../src/lib/locale-path.ts";
import { SITEMAP_STATIC_PATHS } from "../src/lib/sitemap.ts";
import { buildVacancyIndex, overlapsAge, provinceCodeOf } from "../src/lib/vacancy-index.ts";
import { vacancyIndexCopy } from "../src/lib/vacancy-index-copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("age overlap follows infant, toddler, and preschool bands", () => {
  assert.equal(overlapsAge(0, 18, "infant"), true);
  assert.equal(overlapsAge(0, 18, "toddler"), false);
  assert.equal(overlapsAge(18, 36, "toddler"), true);
  assert.equal(overlapsAge(18, 36, "infant"), false);
  assert.equal(overlapsAge(36, 60, "preschool"), true);
  assert.equal(overlapsAge(10, 10, "infant"), false);
  assert.equal(provinceCodeOf("mb"), "MB");
  assert.equal(provinceCodeOf("Manitoba"), "MB");
  assert.equal(provinceCodeOf("Texas"), null);
});

test("the index uses listing spots and fees and skips blanks", () => {
  const index = buildVacancyIndex(
    [
      {
        province: "MB",
        ageMinMonths: 0,
        ageMaxMonths: 18,
        spotsInfant: 2,
        spotsToddler: 9,
        spotsPreschool: 9,
        infantMonthly: 400,
        toddlerMonthly: null,
        preschoolMonthly: 10,
      },
      {
        province: "MB",
        ageMinMonths: 0,
        ageMaxMonths: 18,
        spotsInfant: 0,
        spotsToddler: null,
        spotsPreschool: null,
        infantMonthly: 0,
        toddlerMonthly: 800,
        preschoolMonthly: null,
      },
      {
        province: "ON",
        ageMinMonths: 18,
        ageMaxMonths: 36,
        spotsInfant: 4,
        spotsToddler: 1,
        spotsPreschool: null,
        infantMonthly: 999,
        toddlerMonthly: 500,
        preschoolMonthly: null,
      },
    ],
    new Date("2026-10-03T12:00:00Z"),
  );
  assert.equal(index.monthKey, "2026-10");
  const mb = index.provinces.find((p) => p.code === "MB");
  assert.ok(mb);
  assert.equal(mb.ages.infant.centres, 2);
  assert.equal(mb.ages.infant.openSpots, 2);
  assert.equal(mb.ages.infant.averageFee, 400);
  assert.equal(mb.ages.toddler.centres, 0);
  assert.equal(mb.ages.toddler.openSpots, 0);
  const on = index.provinces.find((p) => p.code === "ON");
  assert.equal(on?.ages.toddler.centres, 1);
  assert.equal(on?.ages.toddler.openSpots, 1);
  assert.equal(on?.ages.infant.centres, 0);
  assert.equal(on?.ages.infant.openSpots, 0);
  assert.equal(index.provinces.length, 13);
});

test("vacancy index is paired, in the sitemap, and copy invents no dollars", () => {
  assert.ok(SITEMAP_STATIC_PATHS.includes("/vacancy-index"));
  assert.ok(LOCALE_PAIRED_PATHS.includes("/vacancy-index"));
  const sitemap = readFileSync(join(root, "public/sitemap.xml"), "utf8");
  assert.match(sitemap, /https:\/\/www\.kidease\.ca\/vacancy-index</);
  assert.match(sitemap, /https:\/\/www\.kidease\.ca\/fr\/vacancy-index</);
  const en = vacancyIndexCopy("en");
  const fr = vacancyIndexCopy("fr");
  const blob = JSON.stringify(en) + JSON.stringify(fr);
  assert.doesNotMatch(blob, /\$\d|—|free forever|Winnipeg-based/i);
  assert.match(en.title, /Canadian Childcare Vacancy Index/);
  const page = readFileSync(join(root, "src/routes/vacancy-index.tsx"), "utf8");
  assert.match(page, /loadVacancyIndex/);
});
