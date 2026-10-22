import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  listingStandardGroups,
  provinceAgeSourceText,
  provinceCodeFromFacilityId,
  sourceCategoryGroups,
  spotAgeForMonths,
  standardAgeLabel,
  standardGroupsForRange,
  summarizeAgeGroupCoverage,
} from "../src/lib/standard-age-groups.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function groups(min, max) {
  return standardGroupsForRange(min, max);
}

test("parent labels use months for the first three groups and years for school-age", () => {
  assert.equal(standardAgeLabel("infant", "en"), "Infant: 0\u201318 months");
  assert.equal(standardAgeLabel("toddler", "en"), "Toddler: 18\u201336 months");
  assert.equal(standardAgeLabel("preschool", "en"), "Preschool: 36\u201360 months");
  assert.equal(standardAgeLabel("school-age", "en"), "School-age: 6\u201312 years");
  assert.equal(standardAgeLabel("infant", "fr"), "Nourrisson : 0\u201318 mois");
  assert.equal(standardAgeLabel("toddler", "fr"), "Tout-petit : 18\u201336 mois");
  assert.equal(standardAgeLabel("preschool", "fr"), "Pr\u00e9scolaire : 36\u201360 mois");
  assert.equal(standardAgeLabel("school-age", "fr"), "\u00c2ge scolaire : 6\u201312 ans");
});

test("a listing gets every standard group its months overlap", () => {
  assert.deepEqual(groups(0, 18), ["infant"]);
  assert.deepEqual(groups(18, 36), ["toddler"]);
  assert.deepEqual(groups(0, 36), ["infant", "toddler"]);
  assert.deepEqual(groups(30, 72), ["toddler", "preschool"]);
  assert.deepEqual(groups(36, 60), ["preschool"]);
  assert.deepEqual(groups(44, 84), ["preschool", "school-age"]);
  assert.deepEqual(groups(72, 144), ["school-age"]);
  assert.deepEqual(groups(48, 156), ["preschool", "school-age"]);
  assert.deepEqual(groups(60, 144), ["school-age"]);
  assert.deepEqual(groups(68, 156), ["school-age"]);
  assert.deepEqual(groups(0, 156), ["infant", "toddler", "preschool", "school-age"]);
  assert.deepEqual(groups(60, 72), []);
  assert.equal(spotAgeForMonths(18), "toddler");
  assert.equal(spotAgeForMonths(36), "preschool");
  assert.equal(spotAgeForMonths(60), null);
  assert.equal(spotAgeForMonths(72), null);
});

test("missing ages and a false confirmation show nothing", () => {
  assert.deepEqual(listingStandardGroups({ agesKnown: false, ageMinMonths: 0, ageMaxMonths: 18 }), []);
  assert.deepEqual(listingStandardGroups({ ageMinMonths: 0, ageMaxMonths: 0 }), []);
  assert.deepEqual(listingStandardGroups({ agesKnown: true, ageMinMonths: 12, ageMaxMonths: 12 }), []);
  assert.deepEqual(
    listingStandardGroups({ agesKnown: true, ageMinMonths: 84, ageMaxMonths: 120, ageGroups: "infant", province: "PE" }),
    ["school-age"],
  );
});

test("each province's source categories map onto the same four groups", () => {
  assert.deepEqual(sourceCategoryGroups("AB", "daycare"), ["infant", "toddler", "preschool"]);
  assert.deepEqual(sourceCategoryGroups("AB", "school-age"), ["preschool", "school-age"]);
  assert.deepEqual(sourceCategoryGroups("BC", "kindergarten"), []);
  assert.deepEqual(sourceCategoryGroups("BC", "multi-age"), ["infant", "toddler", "preschool", "school-age"]);
  assert.deepEqual(sourceCategoryGroups("MB", "nursery"), ["toddler", "preschool"]);
  assert.deepEqual(sourceCategoryGroups("MB", "kindergarten"), []);
  assert.deepEqual(sourceCategoryGroups("NB", "school-age"), ["school-age"]);
  assert.deepEqual(sourceCategoryGroups("ON", "kindergarten"), ["preschool", "school-age"]);
  assert.deepEqual(sourceCategoryGroups("ON", "full-day program (age groups not published)"), null);
  assert.deepEqual(sourceCategoryGroups("QC", "infant (poupon <18 mo)"), ["infant"]);
  assert.deepEqual(sourceCategoryGroups("QC", "preschool (18 mo to kindergarten)"), ["toddler", "preschool"]);
  assert.deepEqual(sourceCategoryGroups("PEI", "infant"), ["infant"]);
  assert.deepEqual(sourceCategoryGroups("NL", "school age"), ["school-age"]);
  assert.equal(sourceCategoryGroups("NT", "infant"), null);
  assert.equal(sourceCategoryGroups("NU", "preschool"), null);
  assert.equal(provinceCodeFromFacilityId("nl|5515087"), "NL");
  assert.equal(provinceCodeFromFacilityId("ON|58456"), "ON");
});

test("province caption keeps the official wording after the machine prefix", () => {
  const nb =
    "licensing_groups+regulation: infant 12, school age 30 (Early Childhood Services Act s.1; designated facility)";
  assert.match(provinceAgeSourceText(nb), /designated facility/);
  assert.match(provinceAgeSourceText(nb), /infant 12, school age 30/);
  assert.doesNotMatch(provinceAgeSourceText(nb), /licensing_groups/);
  assert.equal(provinceAgeSourceText(""), "");
  assert.equal(provinceAgeSourceText("website_stated: 6 months to 4 years"), "6 months to 4 years");
});

test("coverage counts groups from months and lists unmapped tokens", () => {
  const report = summarizeAgeGroupCoverage([
    { facilityId: "ON|1", ageMinMonths: 0, ageMaxMonths: 18, ageGroups: "infant", agesKnown: true },
    { facilityId: "ON|2", ageMinMonths: 44, ageMaxMonths: 84, ageGroups: "kindergarten", agesKnown: true },
    {
      facilityId: "ON|3",
      ageMinMonths: 0,
      ageMaxMonths: 72,
      ageGroups: "full-day program (age groups not published)",
      agesKnown: true,
    },
    { facilityId: "BC|1", ageMinMonths: 60, ageMaxMonths: 72, ageGroups: "kindergarten", agesKnown: true },
    { facilityId: "PE|1", ageMinMonths: 84, ageMaxMonths: 120, ageGroups: "infant", agesKnown: true },
    { facilityId: "AB|1", ageMinMonths: 0, ageMaxMonths: 18, ageGroups: "infant", agesKnown: false },
  ]);
  const on = report.provinces.find((row) => row.province === "ON");
  assert.equal(on.listings, 3);
  assert.equal(on.infant, 2);
  assert.equal(on.toddler, 1);
  assert.equal(on.preschool, 2);
  assert.equal(on["school-age"], 1);
  const bc = report.provinces.find((row) => row.province === "BC");
  assert.equal(bc.noGroup, 1);
  assert.equal(bc["school-age"], 0);
  const pe = report.provinces.find((row) => row.province === "PE");
  assert.equal(pe["school-age"], 1);
  assert.equal(pe.infant, 0);
  const ab = report.provinces.find((row) => row.province === "AB");
  assert.equal(ab.noGroup, 1);
  assert.equal(ab.infant, 0);
  assert.ok(report.unmapped.some((row) => row.province === "ON" && row.reason === "unknown"));
  assert.ok(report.unmapped.some((row) => row.province === "BC" && row.token === "kindergarten" && row.reason === "no-overlap"));
  assert.deepEqual(report.noSourcedRows, ["MB", "NB", "NL", "NS", "NT", "NU", "QC", "SK", "YT"]);
});

test("the dry-run report only reads the sourced file", () => {
  const script = readFileSync(join(root, "scripts/age-group-dry-run.mjs"), "utf8");
  assert.match(script, /ages-sourced-20261002\.csv/);
  assert.match(script, /summarizeAgeGroupCoverage/);
  assert.doesNotMatch(script, /insert|update|delete|DATABASE_URL|getSql|neon/i);
});
