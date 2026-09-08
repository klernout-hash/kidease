import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  listingSlugFromName,
  listingSlugLookupKeys,
  normalizeListingSlug,
  rememberSlugAliases,
} from "../src/lib/listing-slug.ts";
import { listingCanonicalUrl } from "../src/lib/listing-seo.ts";
import { listingLabelFromSlug } from "../src/lib/listing-meta.ts";
import { hydrateCentre } from "../src/lib/catalog-hydrate.ts";
import { daycareUpsertParams } from "../src/lib/catalog-upsert.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("slug generation cannot turn centre into cetnre", () => {
  assert.equal(
    listingSlugFromName("Little Fox Child Care Centre", "103205"),
    "little-fox-child-care-centre-103205",
  );
  assert.doesNotMatch(listingSlugFromName("Little Fox Child Care Centre", "103205"), /cetnre/);
  assert.equal(
    listingSlugFromName("Little Fox Child Care Cetnre", "103205"),
    "little-fox-child-care-centre-103205",
  );
  assert.equal(normalizeListingSlug("little-fox-child-care-cetnre-103205"), "little-fox-child-care-centre-103205");
  assert.equal(normalizeListingSlug("little-fox-child-care-centre-103205"), "little-fox-child-care-centre-103205");
  assert.equal(normalizeListingSlug("/daycare/little-fox-child-care-cetnre-103205"), "little-fox-child-care-centre-103205");
  assert.equal(normalizeListingSlug("willow-point-children-s-centre-2"), "willow-point-children-s-centre-2");
});

test("old cetnre slugs remap to the same listing keys without extra SEO rewrites", () => {
  assert.deepEqual(listingSlugLookupKeys("little-fox-child-care-cetnre-103205"), [
    "little-fox-child-care-cetnre-103205",
    "little-fox-child-care-centre-103205",
  ]);
  assert.deepEqual(listingSlugLookupKeys("little-fox-child-care-centre-103205"), [
    "little-fox-child-care-centre-103205",
    "little-fox-child-care-cetnre-103205",
  ]);
  assert.equal(listingSlugFromName("KidCare Early Learning Center", "23"), "kidcare-early-learning-center-23");
  const map = rememberSlugAliases([{ slug: "little-fox-child-care-centre-103205", id: "mb-103205" }]);
  assert.equal(map.get("little-fox-child-care-cetnre-103205")?.id, "mb-103205");
  assert.equal(map.get("little-fox-child-care-centre-103205")?.id, "mb-103205");
});

test("hydrate, Neon mapping, and upsert persist centre not cetnre", () => {
  const hydrated = hydrateCentre(
    {
      id: "mb-103205",
      slug: "little-fox-child-care-cetnre-103205",
      name: "Little Fox Child Care Cetnre",
      lat: 49.9,
      lng: -97.1,
    },
    { facts: {}, buildings: {}, wpg: {} },
  );
  assert.equal(hydrated.slug, "little-fox-child-care-centre-103205");
  assert.equal(hydrated.name, "Little Fox Child Care Centre");

  const neon = src("src/lib/server/catalog-neon.ts");
  assert.match(neon, /normalizeListingSlug\(rawSlug\)/);
  assert.match(neon, /correctCentreNameTypos/);

  const params = daycareUpsertParams({
    id: "mb-103205",
    slug: "little-fox-child-care-cetnre-103205",
    name: "Little Fox Child Care Cetnre",
    nameFr: "Little Fox Child Care Cetnre",
    tagline: "",
    taglineFr: "",
    description: "",
    descriptionFr: "",
    address: "",
    city: "Winnipeg",
    province: "MB",
    postalCode: "",
    lat: 49.9,
    lng: -97.1,
    hours: "",
    hoursFr: "",
    ageMinMonths: 0,
    ageMaxMonths: 0,
    infantMonthly: null,
    toddlerMonthly: null,
    preschoolMonthly: null,
    partTimeMonthly: null,
    spotsInfant: 0,
    spotsToddler: 0,
    spotsPreschool: 0,
    waitlist: 0,
    ratingX10: 0,
    licenseNumber: "MB-103205",
    languages: "en",
    amenities: "licensed",
    photos: [],
  });
  assert.equal(params[1], "little-fox-child-care-centre-103205");
  assert.equal(params[2], "Little Fox Child Care Centre");
});

test("known Little Fox listing slug is centre; typo URL remaps", () => {
  const centres = JSON.parse(src("src/lib/data/centres.json"));
  const row = centres.find((d) => d.id === "mb-103205");
  assert.ok(row);
  assert.equal(row.slug, "little-fox-child-care-centre-103205");
  assert.equal(row.name, "Little Fox Child Care Centre");
  assert.doesNotMatch(row.slug, /cetnre/);

  const slugs = JSON.parse(src("src/lib/data/sitemap-listing-slugs.json"));
  assert.ok(slugs.includes("little-fox-child-care-centre-103205"));
  assert.ok(!slugs.includes("little-fox-child-care-cetnre-103205"));

  assert.equal(
    listingCanonicalUrl("little-fox-child-care-cetnre-103205"),
    "https://www.kidease.ca/daycare/little-fox-child-care-centre-103205",
  );
  assert.match(listingLabelFromSlug("little-fox-child-care-cetnre-103205"), /Centre/);
  assert.doesNotMatch(listingLabelFromSlug("little-fox-child-care-cetnre-103205"), /Cetnre/);
});

test("listing route redirects typo slugs; generators and Neon lookup stay remapped", () => {
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /seo\?\.slug !== params\.slug/);
  assert.match(listing, /throw redirect\(/);
  assert.match(listing, /to:\s*"\/daycare\/\$slug"/);
  assert.match(listing, /isRedirect/);

  const vercel = src("vercel.json");
  assert.match(vercel, /little-fox-child-care-cetnre-103205/);
  assert.match(vercel, /little-fox-child-care-centre-103205/);

  const neon = src("src/lib/server/catalog-neon.ts");
  assert.match(neon, /listingSlugLookupKeys/);
  assert.match(neon, /slug = any\(\$1::text\[\]\)/);

  const winnipeg = src("scripts/fetch-winnipeg-centres.py");
  const canada = src("scripts/build-canada-centres.py");
  const rest = src("scripts/merge-canada-rest.py");
  for (const script of [winnipeg, canada, rest]) {
    assert.match(script, /cetnre.*centre/);
    assert.match(script, /fix_slug_tokens/);
  }

  const migration = src("migrations/0041_fix_cetnre_slugs.sql");
  assert.match(migration, /cetnre/);
  assert.match(migration, /centre/);
});
