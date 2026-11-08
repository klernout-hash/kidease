import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CARE_CATEGORY_SOURCES, careCategoryArt } from "../src/lib/care-category-art.ts";
import { feePillPulses } from "../src/lib/card-photo-pills.ts";
import { listingSubsidy } from "../src/lib/fee-program.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("category pictures are the existing KidEase stills, drawn as gifs", () => {
  for (const [id, file] of Object.entries(CARE_CATEGORY_SOURCES)) {
    const art = careCategoryArt(id);
    assert.ok(art);
    assert.equal(art.source, `/photos/${file}`);
    assert.equal(art.gif, `/photos/care-cats/${id}.gif`);
    assert.equal(art.still, `/photos/care-cats/${id}.jpg`);
    assert.equal(readFileSync(join(root, "public", art.source)).length > 0, true);
    const gif = readFileSync(join(root, "public", art.gif));
    assert.equal(gif.subarray(0, 6).toString("ascii"), "GIF89a");
    assert.doesNotMatch(art.gif, /\/photos\/demo\//);
  }
  assert.equal(careCategoryArt("not-a-centre"), null);
});

test("animated category pictures stay on the home row, not the header or tab bar", () => {
  const home = src("src/components/airbnb-screens.tsx");
  const shell = src("src/components/shell.tsx");
  const tabs = src("src/components/app-tab-bar.tsx");
  assert.match(home, /careCategoryArt\(cat\.id\)/);
  assert.match(home, /className="ke-care-gif"/);
  assert.match(home, /className="ke-care-still"/);
  assert.doesNotMatch(shell, /HomeCareTypeRow|care-cats|ke-care-gif/);
  assert.doesNotMatch(tabs, /care-cats|AirbnbCareCategories|ke-care-gif/);
  assert.match(src("src/routes/index.tsx"), /<AirbnbCareCategories/);
  assert.match(src("src/styles.css"), /prefers-reduced-motion: reduce[\s\S]*\.ke-care-gif \{ display: none/);
});

test("$10/day pulses only for a sourced ten-dollar program", () => {
  assert.equal(feePillPulses("ten"), true);
  assert.equal(feePillPulses("ten_max"), true);
  assert.equal(feePillPulses("qc_965"), false);
  assert.equal(feePillPulses("reduced"), false);
  assert.equal(feePillPulses(null), false);
  assert.equal(listingSubsidy({ province: "ON", city: "Mississauga", name: "Brightpath Dixie" }), null);
  assert.equal(feePillPulses(listingSubsidy({ province: "ON" })?.subsidy_type), false);
  const sk = listingSubsidy({
    province: "SK",
    facilityType: "child_care_centre",
    agesKnown: true,
    ageMinMonths: 0,
    ageMaxMonths: 60,
  });
  assert.equal(sk?.subsidy_label, "$10/day");
  assert.equal(feePillPulses(sk?.subsidy_type), true);
  assert.match(src("src/components/subsidy-pill.tsx"), /feePillPulses\(subsidy\.subsidy_type\)/);
  assert.match(src("src/components/subsidy-pill.tsx"), /ke-priority-pill/);
  assert.match(src("src/components/airbnb-screens.tsx"), /feePillPulses\(subsidy\.subsidy_type\)/);
});
