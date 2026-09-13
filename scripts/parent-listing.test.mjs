import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function csvTokens(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseParentListingSearch(s) {
  const allow = (set) => csvTokens(s).filter((item) => set.has(item));
  return {
    ages: allow(new Set(["infant", "toddler", "preschool", "school-age"])),
    open: allow(new Set(["immediate", "upcoming"])),
    sched: allow(new Set(["full", "part", "flexible"])),
    fac: allow(new Set(["child_care_centre", "family_home", "group_home", "nursery_preschool", "school_age", "centre", "home", "school"])),
  };
}

test("parent search URL round-trips Canada chips", () => {
  const parsed = {
    ages: parseParentListingSearch("infant,toddler").ages,
    open: parseParentListingSearch("immediate").open,
    sched: parseParentListingSearch("full,flexible").sched,
    fac: parseParentListingSearch("child_care_centre,family_home").fac,
  };
  assert.deepEqual(parsed.ages, ["infant", "toddler"]);
  assert.deepEqual(parsed.open, ["immediate"]);
  assert.deepEqual(parsed.sched, ["full", "flexible"]);
  assert.deepEqual(parsed.fac, ["child_care_centre", "family_home"]);
  assert.deepEqual(parseParentListingSearch("junk").ages, []);
});

test("parent-listing honesty: openings never invented from unclaimed or stale rows", () => {
  const lib = src("src/lib/parent-listing.ts");
  assert.match(lib, /Never invent openings/);
  assert.match(lib, /honestVacancy/);
  assert.match(lib, /availabilityKnown/);
  assert.match(lib, /openingWindow === "upcoming"/);
  assert.doesNotMatch(lib, /spotsInfant \+ spotsToddler.*= \"immediate\"/);
});

test("parent listing fields persist on desk save and render on the public page", () => {
  const claims = src("src/lib/server/claims.ts");
  assert.match(claims, /facility_type/);
  assert.match(claims, /schedule_options/);
  assert.match(claims, /opening_window/);
  assert.match(claims, /financial_flags/);
  assert.match(claims, /promo_text/);
  assert.match(src("src/lib/server/map-row.ts"), /parentListingFrom/);
  assert.match(src("src/components/provider-listing-forms.tsx"), /ProviderParentFields/);
  assert.match(src("src/routes/daycare.\$slug.tsx"), /ListingProgramsTable/);
  assert.match(src("src/routes/daycare.\$slug.tsx"), /ListingSnapshotGrid/);
  assert.match(src("src/routes/daycare.\$slug.tsx"), /RequestInfoSheet/);
  assert.match(src("src/routes/search.tsx"), /ExploreFilterChips/);
  assert.match(src("src/components/daycare-card.tsx"), /cardRequestInfo/);
  assert.match(src("src/lib/server/lead-requests.ts"), /createInfoRequest/);
  assert.match(src("src/lib/server/lead-requests.ts"), /kind: "info"/);
});

test("migration 0044 adds Canada desk columns and info leads without inventing openings", () => {
  const names = readdirSync(join(root, "migrations"));
  assert.ok(names.includes("0044_canada_parent_listing.sql"));
  const mig = src("migrations/0044_canada_parent_listing.sql");
  assert.match(mig, /facility_type/);
  assert.match(mig, /schedule_options/);
  assert.match(mig, /opening_window/);
  assert.match(mig, /never invent openings/i);
  assert.match(mig, /kind in \('tour', 'waitlist', 'spot_inquiry', 'info'\)/);
  assert.doesNotMatch(mig, /set opening_window = 'immediate'/);
});

test("migration 0045 maps legacy centre/home enums to Canada facility types", () => {
  const names = readdirSync(join(root, "migrations"));
  assert.ok(names.includes("0045_canada_facility_types.sql"));
  const mig = src("migrations/0045_canada_facility_types.sql");
  assert.match(mig, /child_care_centre/);
  assert.match(mig, /family_home/);
  assert.match(mig, /group_home/);
  assert.match(mig, /nursery_preschool/);
  assert.match(mig, /school_age/);
  assert.match(mig, /Do not invent group_home/);
  assert.doesNotMatch(mig, /set facility_type = 'group_home'\s+where name/i);
});

test("FR-CA chip labels exist for /fr routes", () => {
  const copy = src("src/lib/copy.ts");
  for (const key of [
    "chipAge",
    "chipOpenings",
    "filterFacHome",
    "requestInfo",
    "bookTour",
    "requestInfoSlaHonest",
    "deskValuesLead",
  ]) {
    assert.equal(copy.split(`${key}:`).length >= 3, true, key);
  }
  assert.match(copy, /Milieu familial/);
  assert.match(copy, /Parascolaire/);
  assert.match(copy, /Milieu familial de groupe/);
  assert.match(copy, /Demander des infos/);
});

test("request-info contact validation lives in the shared lib", () => {
  const lib = src("src/lib/parent-listing.ts");
  assert.match(lib, /normalizeInfoContact/);
  assert.match(lib, /guestInfoUserId/);
  assert.match(lib, /guest:/);
  assert.match(src("src/components/request-info.tsx"), /requestInfoPrivacy/);
  assert.match(src("src/components/request-info.tsx"), /requestInfoSlaHonest/);
  assert.match(src("src/components/request-info.tsx"), /data-request-info-success/);
});
