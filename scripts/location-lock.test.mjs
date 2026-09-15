import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { WINNIPEG } from "../src/lib/geo.ts";
import {
  filterByLocationLock,
  listingMatchesLocationLock,
  resolveLocationLock,
} from "../src/lib/location-lock.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const WINNIPEG_LOCK = resolveLocationLock({
  lat: WINNIPEG.lat,
  lng: WINNIPEG.lng,
  label: WINNIPEG.label,
});

const CALGARY = { lat: 51.0447, lng: -114.0719, label: "Calgary, AB" };
const TORONTO = { lat: 43.6532, lng: -79.3832, label: "Toronto, ON" };

test("locked Winnipeg excludes Edmonton, Toronto, and Vancouver", () => {
  assert.ok(WINNIPEG_LOCK);
  assert.equal(WINNIPEG_LOCK.province, "MB");
  assert.equal(WINNIPEG_LOCK.city, "Winnipeg");

  const local = [
    { id: "mb-1", city: "Winnipeg", province: "MB", distanceKm: 0.8 },
    { id: "mb-2", city: "St. Boniface", province: "MB", distanceKm: 2 },
    { id: "mb-suburb", city: "East St. Paul", province: "MB", distanceKm: 8 },
  ];
  const leaks = [
    { id: "ab-1", city: "Edmonton", province: "AB", distanceKm: 0 },
    { id: "on-1", city: "Toronto", province: "ON", distanceKm: 1 },
    { id: "bc-1", city: "Vancouver", province: "BC", distanceKm: 2 },
    { id: "ab-2", city: "Calgary", province: "AB", distanceKm: 12 },
  ];
  const mixed = [...local, ...leaks];
  const kept = filterByLocationLock(mixed, WINNIPEG_LOCK);
  assert.deepEqual(
    kept.map((row) => row.id),
    local.map((row) => row.id),
  );
  assert.equal(listingMatchesLocationLock({ city: "Edmonton", province: "AB" }, WINNIPEG_LOCK), false);
  assert.equal(listingMatchesLocationLock({ city: "Toronto", province: "ON" }, WINNIPEG_LOCK), false);
  assert.equal(listingMatchesLocationLock({ city: "Vancouver", province: "BC" }, WINNIPEG_LOCK), false);
  assert.equal(listingMatchesLocationLock({ city: "Winnipeg", province: "MB" }, WINNIPEG_LOCK), true);
  assert.equal(listingMatchesLocationLock({ city: "Brandon", province: "MB" }, WINNIPEG_LOCK), false);
  assert.equal(listingMatchesLocationLock({ city: "", province: "" }, WINNIPEG_LOCK), false);
  assert.equal(listingMatchesLocationLock({ city: "Mystery Suburb", province: "" }, WINNIPEG_LOCK), false);
  assert.equal(listingMatchesLocationLock({ city: "", province: "MB" }, WINNIPEG_LOCK), true);
});

test("GPS or saved Winnipeg locks as tightly as an explicit city pick", () => {
  const gps = resolveLocationLock({ lat: WINNIPEG.lat, lng: WINNIPEG.lng, label: WINNIPEG.label });
  const picked = resolveLocationLock({ q: "Winnipeg, MB" });
  assert.equal(gps?.province, "MB");
  assert.equal(gps?.city, "Winnipeg");
  assert.equal(picked?.province, "MB");
  assert.equal(picked?.city, "Winnipeg");
  assert.equal(listingMatchesLocationLock({ city: "Toronto", province: "ON" }, gps), false);
  assert.equal(listingMatchesLocationLock({ city: "Vancouver", province: "BC" }, gps), false);
  assert.equal(listingMatchesLocationLock({ city: "Edmonton", province: "AB" }, gps), false);
});

test("BC lock never backfills Manitoba or Ontario", () => {
  const lock = resolveLocationLock({ lat: 49.2827, lng: -123.1207, label: "Vancouver, BC" });
  assert.equal(lock?.province, "BC");
  assert.equal(lock?.city, "Vancouver");
  assert.equal(listingMatchesLocationLock({ city: "Vancouver", province: "BC" }, lock), true);
  assert.equal(listingMatchesLocationLock({ city: "Winnipeg", province: "MB" }, lock), false);
  assert.equal(listingMatchesLocationLock({ city: "Toronto", province: "ON" }, lock), false);
  assert.equal(listingMatchesLocationLock({ city: "Edmonton", province: "AB" }, lock), false);
});

test("changing city to Calgary unlocks Calgary/AB only", () => {
  const lock = resolveLocationLock(CALGARY);
  assert.equal(lock?.province, "AB");
  assert.equal(lock?.city, "Calgary");
  assert.equal(listingMatchesLocationLock({ city: "Calgary", province: "AB" }, lock), true);
  assert.equal(listingMatchesLocationLock({ city: "Edmonton", province: "AB" }, lock), false);
  assert.equal(listingMatchesLocationLock({ city: "Winnipeg", province: "MB" }, lock), false);
  assert.equal(listingMatchesLocationLock({ city: "Toronto", province: "ON" }, lock), false);
});

test("typing Toronto switches the lock intentionally", () => {
  const lock = resolveLocationLock({
    lat: WINNIPEG.lat,
    lng: WINNIPEG.lng,
    label: WINNIPEG.label,
    q: "Toronto, ON",
  });
  assert.equal(lock?.province, "ON");
  assert.equal(lock?.city, "Toronto");
  assert.equal(listingMatchesLocationLock({ city: "Toronto", province: "ON" }, lock), true);
  assert.equal(listingMatchesLocationLock({ city: "Winnipeg", province: "MB" }, lock), false);
  assert.equal(listingMatchesLocationLock({ city: "Vancouver", province: "BC" }, lock), false);

  const fromTyped = resolveLocationLock(TORONTO);
  assert.equal(fromTyped?.province, "ON");
  assert.equal(fromTyped?.city, "Toronto");
});

test("province-only lock stays in-province and never mixes AB with MB", () => {
  const lock = resolveLocationLock({ label: "Manitoba" });
  assert.equal(lock?.province, "MB");
  assert.equal(listingMatchesLocationLock({ city: "Brandon", province: "MB" }, lock), true);
  assert.equal(listingMatchesLocationLock({ city: "Edmonton", province: "AB" }, lock), false);
});

test("Explore search, rails, and featured apply the location lock", () => {
  const search = src("src/routes/search.tsx");
  const daycares = src("src/lib/server/daycares.ts");
  const rails = src("src/components/explore-category-rails.tsx");
  const css = src("src/styles.css");
  assert.match(search, /resolveLocationLock/);
  assert.match(search, /filterByLocationLock/);
  assert.match(search, /writeExploreSearch\(\{ q: label/);
  assert.match(daycares, /filterByLocationLock/);
  assert.match(daycares, /resolveLocationLock/);
  assert.match(rails, /const pool = items/);
  assert.match(css, /padding-inline-start: 2px/);
  assert.doesNotMatch(css, /\.ke-listing-rail-port::before/);
});
