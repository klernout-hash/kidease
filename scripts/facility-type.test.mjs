import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  classifyFacilityType,
  facilityTypeNameHint,
  isFacilityType,
  listingFacilityType,
  matchesFacilityType,
} from "../src/lib/facility-type.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("facility types are Centre / Nursery / Home with stable slugs", () => {
  assert.equal(isFacilityType("centre"), true);
  assert.equal(isFacilityType("nursery"), true);
  assert.equal(isFacilityType("home"), true);
  assert.equal(isFacilityType("before-after"), false);
  assert.equal(isFacilityType("daycare"), false);
});

test("Nursery and Home come from amenities only — names never assign", () => {
  assert.deepEqual(classifyFacilityType({ amenities: "licensed,nursery", name: "Alonsa Nursery School" }), {
    type: "nursery",
    source: "amenity",
    nameHint: "nursery",
    gap: false,
  });
  assert.deepEqual(classifyFacilityType({ amenities: "licensed,home", name: "Solid Touch Dayhome" }), {
    type: "home",
    source: "amenity",
    nameHint: "home",
    gap: false,
  });
  const dayNursery = classifyFacilityType({
    amenities: "licensed,funded",
    name: "Knox Day Nursery",
  });
  assert.equal(dayNursery.type, "centre");
  assert.equal(dayNursery.source, "fallback");
  assert.equal(dayNursery.gap, true);
  assert.equal(dayNursery.nameHint, null);
  assert.equal(facilityTypeNameHint("Knox Day Nursery"), null);
  assert.equal(facilityTypeNameHint("West St. Paul Nursery School Co-op Inc."), "nursery");
  assert.equal(listingFacilityType({ amenities: "licensed", name: "Kims Home Daycare" }), "centre");
  assert.equal(facilityTypeNameHint("Kims Home Daycare"), "home");
  assert.equal(matchesFacilityType({ amenities: "licensed,nursery" }, "nursery"), true);
  assert.equal(matchesFacilityType({ amenities: "licensed,nursery" }, "centre"), false);
});

test("Explore wires three facility-type categories and listing copy", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /showCentres/);
  assert.match(search, /showNurseries/);
  assert.match(search, /showHomes/);
  assert.match(search, /FACILITY_TYPES/);
  assert.match(search, /noFacilityTypeResults/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /FacilityTypeBlurb/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /facilityTypeLeadNursery/);
  assert.match(src("src/lib/copy.ts"), /Show Centres/);
  assert.match(src("src/lib/copy.ts"), /Afficher les nurseries/);
  assert.match(src("src/routes/admin.tsx"), /data-facility-type-taxonomy/);
  const care = src("src/lib/care-type.ts");
  assert.match(care, /nursery/);
  assert.match(care, /classifyFacilityType/);
  const explore = src("src/components/explore-rails.tsx");
  assert.match(explore, /FacilityTypeRails/);
  assert.doesNotMatch(explore, /Popular daycares/);
  assert.doesNotMatch(explore, /Highest rated/);
  assert.doesNotMatch(explore, /Garderies près/);
  assert.doesNotMatch(explore, /Mieux notées/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /railDaycareCentres: "Daycare Centres"/);
  assert.match(copy, /railNursery: "Nursery"/);
  assert.match(copy, /railHome: "Home"/);
  assert.match(copy, /railDaycareCentres: "Centres de garde"/);
  assert.match(copy, /railHome: "Milieux familiaux"/);
});
