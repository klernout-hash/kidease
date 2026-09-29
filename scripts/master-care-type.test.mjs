import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { applyMasterCareType, masterCareCode } from "../src/lib/server/master-care-type.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("master CSV care types classify a known centre, home, and before-and-after program", () => {
  assert.equal(masterCareCode("BC", "V7P 2W8", "Bonnie Bairns Childcare Services"), "c");
  assert.equal(masterCareCode("AB", "T3A 2J7", "Five Star Group Family Childcare"), "g");
  assert.equal(masterCareCode("AB", "T2Z 4B2", "1st Class After Class Clubhouse"), "b");

  const centre = applyMasterCareType({
    name: "Bonnie Bairns Childcare Services",
    province: "BC",
    postalCode: "V7P 2W8",
    amenities: "licensed",
    facilityType: null,
  });
  assert.equal(centre.facilityType, "child_care_centre");

  const home = applyMasterCareType({
    name: "Circles in the Sun Daycare Services PHDC",
    province: "ON",
    postalCode: "M1M 1B6",
    amenities: "licensed",
    facilityType: null,
  });
  assert.equal(home.facilityType, "family_home");

  const kept = applyMasterCareType({
    ...home,
    facilityType: "child_care_centre",
  });
  assert.equal(kept.facilityType, "child_care_centre");

  const after = applyMasterCareType({
    name: "1st Class After Class Clubhouse",
    province: "AB",
    postalCode: "T2Z 4B2",
    amenities: "licensed",
    facilityType: null,
  });
  assert.match(after.amenities, /before-after/);
});

test("header care types open a search URL", () => {
  const rails = readFileSync(join(root, "src/components/facility-type-rails.tsx"), "utf8");
  const shell = readFileSync(join(root, "src/components/shell.tsx"), "utf8");
  assert.match(rails, /export function browseTypeSearch/);
  assert.match(rails, /cat: "before-after"/);
  assert.match(rails, /to="\/search"/);
  assert.match(shell, /toSearch/);
  assert.match(shell, /selectedBrowseType/);
});
