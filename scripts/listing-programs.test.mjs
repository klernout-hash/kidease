import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { decodeHtml } from "../src/lib/html-text.ts";
import { formatPublicAgeRange } from "../src/lib/listing-ages.ts";
import {
  clipAgeBand,
  formatMonthlyFee,
  generatedAgeBands,
  listingFeeNotes,
  partTimeMonthlyFee,
} from "../src/lib/public-programs.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("age bands clip to the centre and drop zero-width and younger-band edges", () => {
  assert.equal(clipAgeBand(72, 144, "preschool"), null);
  assert.deepEqual(clipAgeBand(72, 144, "school-age"), { min: 72, max: 144 });
  assert.equal(clipAgeBand(24, 72, "school-age"), null);
  assert.equal(clipAgeBand(3, 36, "preschool"), null);
  assert.deepEqual(clipAgeBand(3, 72, "preschool"), { min: 30, max: 72 });
  assert.equal(clipAgeBand(60, 72, "school-age"), null);
  assert.deepEqual(clipAgeBand(60, 144, "school-age"), { min: 60, max: 144 });
});

test("part-time is its own fee and never a school-age amount", () => {
  const paradise = generatedAgeBands({
    ageMinMonths: 24,
    ageMaxMonths: 72,
    preschoolMonthly: 1025,
  });
  assert.equal(paradise.some((row) => row.band === "school-age"), false);
  assert.equal(paradise.find((row) => row.band === "preschool")?.monthlyFee, 1025);
  assert.equal(paradise.some((row) => row.monthlyFee === 700), false);
  assert.equal(partTimeMonthlyFee(700), 700);
  assert.equal(partTimeMonthlyFee(0), null);

  const casa = generatedAgeBands({ ageMinMonths: 3, ageMaxMonths: 36 });
  assert.deepEqual(casa.map((row) => row.band), ["infant", "toddler"]);
  assert.equal(partTimeMonthlyFee(800), 800);

  const aleph = generatedAgeBands({ ageMinMonths: 72, ageMaxMonths: 144 });
  assert.deepEqual(aleph.map((row) => row.band), ["school-age"]);
  assert.equal(aleph[0].monthlyFee, null);
  assert.deepEqual(
    { min: aleph[0].ageMinMonths, max: aleph[0].ageMaxMonths },
    { min: 72, max: 144 },
  );

  const programs = src("src/lib/parent-listing.ts");
  assert.doesNotMatch(programs, /school-age", d\.partTimeMonthly/);
  assert.match(programs, /generatedAgeBands/);
  assert.match(src("src/components/listing-parent-pack.tsx"), /data-program-line="part-time"/);
  assert.match(src("src/components/listing-parent-pack.tsx"), /partTimeHalfDay/);
});

test("monthly fees use CAD and an explicit month unit", () => {
  assert.equal(formatMonthlyFee(1960, "en"), "$1,960/month");
  assert.equal(formatMonthlyFee(1025, "en"), "$1,025/month");
  const fr = formatMonthlyFee(700, "fr");
  assert.match(fr, /700/);
  assert.match(fr, /\$/);
  assert.match(fr, /\/mois$/);
  assert.doesNotMatch(formatMonthlyFee(800, "en"), /\/mo$/);
});

test("known fees do not also say they are confirmed after claim", () => {
  const sourced = listingFeeNotes({
    live: false,
    preschoolMonthly: 1025,
    partTimeMonthly: 700,
    factSource: "https://paradise.example.ca/fees",
    province: "MB",
  });
  assert.equal(sourced.unconfirmed, false);
  assert.equal(sourced.mb10, false);
  assert.equal(sourced.priceList, false);
  assert.equal(sourced.source, "website");

  const unknown = listingFeeNotes({ live: false, province: "MB", city: "Winnipeg" });
  assert.equal(unknown.unconfirmed, true);
  assert.equal(unknown.source, null);

  const mb = listingFeeNotes({
    live: false,
    province: "MB",
    feeProgram: "mb-10-day",
    factSource: "https://www.gov.mb.ca/education/childcare/",
    preschoolMonthly: 400,
  });
  assert.equal(mb.mb10, true);
  assert.equal(mb.unconfirmed, false);
  assert.equal(mb.source, null);
  assert.equal(mb.priceList, false);

  const live = listingFeeNotes({ live: true, province: "MB", preschoolMonthly: 1025 });
  assert.equal(live.priceList, true);
  assert.equal(live.unconfirmed, false);
});

test("public ages use months under 2 years and years from 2 up", () => {
  assert.equal(formatPublicAgeRange(3, 18, "en"), "3\u201318 months");
  assert.equal(formatPublicAgeRange(30, 72, "en"), "2\u00bd\u20136 years");
  assert.equal(formatPublicAgeRange(72, 144, "en"), "6\u201312 years");
  assert.equal(formatPublicAgeRange(6, 72, "en"), "6 months \u2013 6 years");
  assert.equal(formatPublicAgeRange(3, 18, "fr"), "3\u201318 mois");
  assert.equal(formatPublicAgeRange(30, 72, "fr"), "2,5\u20136 ans");
  assert.equal(formatPublicAgeRange(72, 144, "fr"), "6\u201312 ans");
});

test("listing text decodes HTML entities, including a second pass", () => {
  assert.equal(decodeHtml("Casa Montessori &amp; Orff"), "Casa Montessori & Orff");
  assert.equal(decodeHtml("A &amp;amp; B"), "A & B");
  assert.equal(decodeHtml("Tom&#39;s"), "Tom's");
  assert.equal(decodeHtml("no entities"), "no entities");
  assert.match(src("src/routes/daycare.$slug.tsx"), /displayListingText/);
  assert.match(src("src/lib/utils.ts"), /decodeHtml/);
});
