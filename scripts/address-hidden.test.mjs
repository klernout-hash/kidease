import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HIDDEN_ADDRESS_AREA,
  isAddressHidden,
  stripHiddenAddressText,
  suppressHiddenAddress,
} from "../src/lib/address-hidden.ts";
import { hydrateCentre } from "../src/lib/catalog-hydrate.ts";
import { daycareUpsertParams } from "../src/lib/catalog-upsert.ts";
import { listingJsonLd, listingMetaDescription } from "../src/lib/listing-seo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function listing(over = {}) {
  return {
    id: "mx-09f81152743c",
    slug: "rupinder-singh-1152743c",
    name: "Rupinder Singh",
    nameFr: "Rupinder Singh",
    tagline: "Family child care",
    taglineFr: "Milieu familial",
    description: "Rupinder Singh is a licensed family child care at 72 Rutledge Crescent, Winnipeg R3W 0A4 (MB).",
    descriptionFr: "Rupinder Singh est un milieu familial permis au 72 Rutledge Crescent, Winnipeg R3W0A4 (MB).",
    address: "72 Rutledge Crescent",
    city: "Winnipeg",
    province: "MB",
    postalCode: "R3W 0A4",
    lat: 49.8123,
    lng: -97.0456,
    phone: "204-555-0100",
    hours: "7-5",
    hoursFr: "7-5",
    ageMinMonths: 3,
    ageMaxMonths: 144,
    infantMonthly: null,
    toddlerMonthly: null,
    preschoolMonthly: null,
    partTimeMonthly: null,
    spotsInfant: 0,
    spotsToddler: 0,
    spotsPreschool: 0,
    waitlist: 0,
    ratingX10: 0,
    reviewCount: 0,
    licenseNumber: "MB-1",
    languages: "en",
    amenities: "licensed",
    photos: [],
    ...over,
  };
}

test("Rupinder Singh street and postal stay off the public object", () => {
  assert.equal(isAddressHidden({ id: "mx-09f81152743c" }), true);
  assert.equal(isAddressHidden({ slug: "rupinder-singh-1152743c" }), true);
  assert.equal(isAddressHidden({ id: "mb-1", slug: "other-centre" }), false);

  const row = suppressHiddenAddress(listing());
  assert.equal(row.address, "");
  assert.equal(row.postalCode, "");
  assert.equal(row.city, "Winnipeg");
  assert.equal(row.province, "MB");
  assert.equal(row.lat, HIDDEN_ADDRESS_AREA.lat);
  assert.equal(row.lng, HIDDEN_ADDRESS_AREA.lng);
  assert.equal(row.lat, 49.8951);
  assert.equal(row.lng, -97.1384);
  assert.doesNotMatch(row.description, /Rutledge|R3W/i);
  assert.doesNotMatch(row.descriptionFr, /Rutledge|R3W/i);
  assert.match(row.description, /Winnipeg/);
  assert.match(row.descriptionFr, /Winnipeg/);

  const other = suppressHiddenAddress(listing({
    id: "mb-other",
    slug: "other-centre",
    address: "1 Main Street",
    postalCode: "R3C 0A1",
    description: "at 1 Main Street, Winnipeg R3C 0A1",
    lat: 49.8,
    lng: -97.1,
  }));
  assert.equal(other.address, "1 Main Street");
  assert.equal(other.postalCode, "R3C 0A1");
  assert.equal(other.lat, 49.8);
  assert.match(other.description, /1 Main Street/);
});

test("generated about text and JSON-LD omit the house", () => {
  const hydrated = hydrateCentre(
    {
      id: "mx-09f81152743c",
      slug: "rupinder-singh-1152743c",
      name: "Rupinder Singh",
      address: "72 Rutledge Crescent",
      city: "Winnipeg",
      province: "MB",
      postalCode: "R3W 0A4",
      lat: 49.81,
      lng: -97.04,
      amenities: "licensed",
    },
    { facts: {}, buildings: {}, wpg: {} },
  );
  assert.equal(hydrated.address, "");
  assert.equal(hydrated.postalCode, "");
  assert.equal(hydrated.city, "Winnipeg");
  assert.doesNotMatch(`${hydrated.description} ${hydrated.descriptionFr}`, /Rutledge|R3W/i);

  const safe = suppressHiddenAddress(listing());
  const node = listingJsonLd(safe);
  const blob = JSON.stringify(node);
  assert.doesNotMatch(blob, /Rutledge|R3W|streetAddress|postalCode/i);
  assert.equal(node.address.addressLocality, "Winnipeg");
  assert.equal(node.address.addressRegion, "MB");
  const meta = listingMetaDescription(safe);
  assert.match(meta, /Winnipeg, MB/);
  assert.doesNotMatch(meta, /Rutledge|R3W/i);
  assert.doesNotMatch(stripHiddenAddressText(safe.description), /Rutledge|R3W/i);
});

test("catalogue upsert cannot write the street back", () => {
  const params = daycareUpsertParams(listing());
  assert.equal(params[0], "mx-09f81152743c");
  assert.equal(params[8], "");
  assert.equal(params[9], "Winnipeg");
  assert.equal(params[10], "MB");
  assert.equal(params[11], "");
  assert.equal(params[12], HIDDEN_ADDRESS_AREA.lat);
  assert.equal(params[13], HIDDEN_ADDRESS_AREA.lng);
  assert.doesNotMatch(String(params[6]), /Rutledge|R3W/i);
  assert.doesNotMatch(String(params[7]), /Rutledge|R3W/i);

  const kept = daycareUpsertParams(listing({
    id: "mb-other",
    slug: "other-centre",
    address: "1 Main Street",
    postalCode: "R3C 0A1",
  }));
  assert.equal(kept[8], "1 Main Street");
  assert.equal(kept[11], "R3C 0A1");
  assert.equal(kept[12], 49.8123);
});

test("readers, the listing page, and the SQL file honour the list", () => {
  const files = [
    "src/lib/catalog-upsert.ts",
    "src/lib/catalog-hydrate.ts",
    "src/lib/server/catalog-neon.ts",
    "src/lib/server/map-row.ts",
    "src/lib/server/map-pins.ts",
    "src/lib/server/daycares.ts",
    "src/lib/server/search-alerts.ts",
    "src/routes/daycare.$slug.tsx",
    "src/components/map-view.tsx",
  ];
  for (const file of files) {
    const src = readFileSync(join(root, file), "utf8");
    assert.match(src, /address-hidden/);
  }
  const pins = readFileSync(join(root, "src/lib/server/map-pins.ts"), "utf8");
  assert.match(pins, /isAddressHidden/);
  assert.match(pins, /addressHiddenMapSql/);
  const sql = readFileSync(join(root, "migrations/0098_hide_rupinder_singh_address.sql"), "utf8");
  assert.match(sql, /mx-09f81152743c/);
  assert.match(sql, /rupinder-singh-1152743c/);
  assert.match(sql, /72 Rutledge Crescent/);
  assert.match(sql, /R3W 0A4/);
  assert.match(sql, /49\.8951/);
  assert.match(sql, /-97\.1384/);
  assert.match(sql, /address = ''/);
  assert.match(sql, /postal_code = ''/);
});
