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
  normalizeFacilityType,
  US_FACILITY_ALIASES,
} from "../src/lib/facility-type.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Canada facility types are centre / family home / group home / nursery / school-age", () => {
  assert.equal(isFacilityType("child_care_centre"), true);
  assert.equal(isFacilityType("family_home"), true);
  assert.equal(isFacilityType("group_home"), true);
  assert.equal(isFacilityType("nursery_preschool"), true);
  assert.equal(isFacilityType("school_age"), true);
  assert.equal(isFacilityType("centre"), false);
  assert.equal(isFacilityType("home"), false);
  assert.equal(isFacilityType("before-after"), false);
  assert.equal(isFacilityType("daycare"), false);
});

test("legacy centre/home enums and US aliases map — they do not stay as chips", () => {
  assert.equal(normalizeFacilityType("centre"), "child_care_centre");
  assert.equal(normalizeFacilityType("home"), "family_home");
  assert.equal(normalizeFacilityType("nursery"), "nursery_preschool");
  assert.equal(normalizeFacilityType("school"), "school_age");
  assert.equal(normalizeFacilityType("center"), "child_care_centre");
  assert.equal(normalizeFacilityType("daycare"), "child_care_centre");
  assert.equal(normalizeFacilityType("preschool"), "nursery_preschool");
  assert.equal(normalizeFacilityType("family_child_care"), "family_home");
  assert.equal(normalizeFacilityType("group_family"), "group_home");
  for (const alias of US_FACILITY_ALIASES) {
    assert.ok(normalizeFacilityType(alias), alias);
    assert.equal(isFacilityType(alias), false, alias);
  }
});

test("Nursery, home, and group home come from amenities or the desk column — names never assign", () => {
  assert.deepEqual(classifyFacilityType({ amenities: "licensed,nursery", name: "Alonsa Nursery School" }), {
    type: "nursery_preschool",
    source: "amenity",
    nameHint: "nursery_preschool",
    gap: false,
  });
  assert.deepEqual(classifyFacilityType({ amenities: "licensed,home", name: "Solid Touch Dayhome" }), {
    type: "family_home",
    source: "amenity",
    nameHint: "family_home",
    gap: false,
  });
  assert.equal(classifyFacilityType({ amenities: "licensed,group-home" }).type, "group_home");
  const dayNursery = classifyFacilityType({
    amenities: "licensed,funded",
    name: "Knox Day Nursery",
  });
  assert.equal(dayNursery.type, "child_care_centre");
  assert.equal(dayNursery.source, "fallback");
  assert.equal(dayNursery.gap, true);
  assert.equal(dayNursery.nameHint, null);
  assert.equal(facilityTypeNameHint("Knox Day Nursery"), null);
  assert.equal(facilityTypeNameHint("West St. Paul Nursery School Co-op Inc."), "nursery_preschool");
  assert.equal(listingFacilityType({ amenities: "licensed", name: "Kims Home Daycare" }), "child_care_centre");
  assert.equal(facilityTypeNameHint("Kims Home Daycare"), "family_home");
  assert.equal(matchesFacilityType({ amenities: "licensed,nursery" }, "nursery"), true);
  assert.equal(matchesFacilityType({ amenities: "licensed,nursery" }, "nursery_preschool"), true);
  assert.equal(matchesFacilityType({ amenities: "licensed,nursery" }, "child_care_centre"), false);
  assert.equal(classifyFacilityType({ amenities: "licensed,in-school" }).type, "school_age");
  assert.equal(classifyFacilityType({ amenities: "licensed", facilityType: "school" }).type, "school_age");
  assert.equal(classifyFacilityType({ amenities: "licensed", facilityType: "school_age" }).source, "column");
  assert.equal(classifyFacilityType({ amenities: "licensed", facilityType: "centre" }).type, "child_care_centre");
  assert.equal(classifyFacilityType({ amenities: "licensed,home", name: "Group Family Home" }).type, "family_home");
});

test("Explore facility chips persist desk types and hide empty US aliases", () => {
  const lib = src("src/lib/parent-listing.ts");
  assert.match(lib, /PARENT_FACILITIES = FACILITY_TYPES/);
  assert.match(lib, /normalizeFacilityType/);
  assert.match(lib, /group_home/);
  assert.match(lib, /Hide options that cannot match/);
  assert.match(src("src/lib/facility-type.ts"), /US_FACILITY_ALIASES/);
  assert.match(src("src/components/explore-filter-chips.tsx"), /visible\.facilities/);
  assert.match(src("src/components/provider-parent-fields.tsx"), /FACILITY_TYPES\.map/);
  assert.doesNotMatch(src("src/lib/parent-listing.ts"), /PARENT_FACILITIES = \["centre"/);
});

test("Explore wires facility-type categories and listing copy", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /ExploreCategoryChips/);
  assert.match(search, /noFacilityTypeResults/);
  assert.doesNotMatch(search, /showCentres/);
  assert.match(src("src/components/listing-badges.tsx"), /data-facility-type/);
  assert.doesNotMatch(src("src/routes/daycare.$slug.tsx"), /FacilityTypeBlurb/);
  assert.doesNotMatch(src("src/routes/daycare.$slug.tsx"), /facilityTypeLeadNursery/);
  assert.match(src("src/routes/verify.tsx"), /facilityTypeLeadNursery/);
  assert.match(src("src/routes/verify.tsx"), /facilityTypeLeadGroupHome/);
  assert.match(src("src/routes/verify.tsx"), /verifyFacilityTitle/);
  assert.match(src("src/lib/copy.ts"), /Show Centres/);
  assert.match(src("src/lib/copy.ts"), /Afficher les nurseries/);
  assert.match(src("src/routes/admin.tsx"), /data-facility-type-taxonomy/);
  const care = src("src/lib/care-type.ts");
  assert.match(care, /nursery/);
  assert.match(care, /classifyFacilityType/);
  const explore = src("src/components/explore-rails.tsx");
  assert.doesNotMatch(explore, /FacilityTypeRails/);
  assert.doesNotMatch(explore, /Popular daycares/);
  assert.doesNotMatch(explore, /Highest rated/);
  assert.doesNotMatch(explore, /Garderies près/);
  assert.doesNotMatch(explore, /Mieux notées/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /railDaycareCentres: "Child care centres"/);
  assert.match(copy, /railNursery: "Nursery schools"/);
  assert.match(copy, /railHome: "Family child care"/);
  assert.match(copy, /railGroupHome: "Group child care homes"/);
  assert.match(copy, /railDaycareCentres: "Centres de garde"/);
  assert.match(copy, /railHome: "Milieux familiaux"/);
  assert.match(copy, /Milieu familial de groupe/);
});
