import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { test } from "node:test";
import { SEARCH_PAGE_SIZE, sliceSearchPage } from "../src/lib/search-page.ts";

await register(new URL("./alias-loader.mjs", import.meta.url), import.meta.url);
const { filterSearchResults, hasSearchCoordinates, normalizeSearchResultFilters, projectSearchMapPins } = await import("../src/lib/search-result-filters.ts");
const { GUEST_HOME_VIEWER, sealHomeRecords } = await import("../src/lib/home-address-seal.ts");
const { projectMapRows } = await import("../src/lib/map-cluster.ts");
const { CITIES, haversineKm } = await import("../src/lib/geo.ts");

const NOW = Date.parse("2026-11-12T12:00:00Z");
const ORIGIN = { lat: 49.5, lng: -117.28 };
const SCOPE = { origin: ORIGIN, radiusKm: 25 };
function card(id, extra = {}) {
  return {
    id, slug: id, name: "Cornerstone Childcare", nameFr: "Garderie Cornerstone",
    lat: ORIGIN.lat + 0.01, lng: ORIGIN.lng + 0.01, city: "Nelson", province: "BC",
    address: "123 Care Street", postalCode: "V1L 1A1", languages: "English,French",
    staffLanguages: [], amenities: "", hours: "08:00-17:00", photos: [],
    ageMinMonths: 0, ageMaxMonths: 60, agesKnown: true,
    claimed: true, claimStatus: "verified", live: true, isTest: false,
    availabilityKnown: true, lastVacancyUpdatedAt: new Date(NOW).toISOString(), spotsUpdatedAt: null,
    spotsInfant: 1, spotsToddler: 1, spotsPreschool: 1,
    feeConfirmed: false, feeProgram: null, licenseNumber: "BC-123",
    facilityType: "child_care_centre", financial: {}, scheduleOptions: [],
    ...extra,
  };
}
function match(rows, filters = {}, scope = SCOPE) {
  return filterSearchResults(rows, { ...scope, filters }, NOW);
}
function ids(rows) { return rows.map((row) => row.id); }

test("French filtering precedes pagination and the full map has the same result total", () => {
  // The first 96 raw rows deliberately do not speak French. Filtering a page
  // instead of the full set would incorrectly produce an empty first page.
  const english = Array.from({ length: 110 }, (_, i) => card(`en-${i}`, { languages: "English" }));
  const french = Array.from({ length: 125 }, (_, i) => card(`fr-${i}`));
  const negatives = [
    card("fr-outside", { lat: ORIGIN.lat + 0.4 }),
    card("unknown-language", { languages: "", staffLanguages: [] }),
  ];
  const rows = match([...english, ...french, ...negatives], { pioneer: { spoken: "fr" } });
  const first = sliceSearchPage(rows, 1);
  const second = sliceSearchPage(rows, 2);
  const pins = projectSearchMapPins(rows);
  assert.equal(rows.length, 125);
  assert.equal(first.items.length, SEARCH_PAGE_SIZE);
  assert.equal(second.items.length, 29);
  assert.equal(first.total, pins.length);
  assert.equal(second.total, pins.length);
  assert.equal(first.items[0].id, "fr-0");
  assert.equal(second.items[0].id, "fr-96");
  assert.deepEqual(ids([...first.items, ...second.items]), ids(pins));
  // A repeated filter change cannot consume a previously filtered cached set.
  assert.equal(match([...english, ...french, ...negatives]).length, 236);
  assert.deepEqual(ids(match([...english, ...french, ...negatives], { pioneer: { spoken: "fr" } })), ids(rows));
});

test("radius is a circle, and same-city catalogue centroids have no distant exemption", () => {
  const corner = card("bbox-corner", { lat: ORIGIN.lat + 0.2, lng: ORIGIN.lng + 0.3 });
  assert.ok(haversineKm(ORIGIN, corner) > 25);
  const winnipeg = CITIES.find((city) => city.label === "Winnipeg, MB");
  assert.ok(winnipeg);
  const rows = [card("near"), corner, card("remote-centroid", { ...winnipeg, id: "remote-centroid", city: "Winnipeg", province: "MB" })];
  assert.deepEqual(ids(match(rows)), ["near"]);
  assert.deepEqual(ids(match(rows, {}, { ...SCOPE, radiusKm: 1 })), []);
  assert.deepEqual(ids(match(rows)), ["near"]);
});

test("name and location predicates both apply, including national name hits", () => {
  const rows = [
    card("wanted"), card("wrong-name", { name: "Happy Penguins", nameFr: "Les Pingouins" }),
    card("remote-name-hit", { lat: 43.65, lng: -79.38, city: "Toronto", province: "ON" }),
  ];
  assert.deepEqual(ids(match(rows, { name: "Cornerstone" })), ["wanted"]);
  assert.deepEqual(ids(match(rows, { name: "Nonexistent centre" })), []);
  assert.deepEqual(projectSearchMapPins(match(rows, { name: "Nonexistent centre" })), []);
});

test("map projection/clusters contain only matched IDs at every zoom", () => {
  const rows = match([card("fr"), card("en", { languages: "English" }), card("remote", { lat: 51 })], { pioneer: { spoken: "fr" } });
  const pins = projectSearchMapPins(rows);
  const box = { minLat: 40, maxLat: 60, minLng: -130, maxLng: -90 };
  for (const zoom of [5, 12, 17]) {
    const view = projectMapRows(pins, zoom, box);
    assert.equal(view.total, rows.length);
    if (view.mode === "pins") assert.deepEqual(ids(view.pins), ["fr"]);
    else assert.equal(view.clusters.reduce((sum, cluster) => sum + cluster.count, 0), rows.length);
  }
});

test("unknown ages stay discoverable while the existing start-window gate excludes stale known ages", () => {
  const rows = [
    card("fresh"), card("stale", { lastVacancyUpdatedAt: "2020-01-01T00:00:00Z" }),
    card("unknown", { agesKnown: false, ageMinMonths: 0, ageMaxMonths: 0, claimed: false, live: false }),
    card("school", { ageMinMonths: 72, ageMaxMonths: 120 }),
  ];
  assert.deepEqual(ids(match(rows, { ages: ["infant"], start: "now" })), ["fresh", "unknown"]);
  assert.deepEqual(ids(match(rows, { ages: ["infant"], start: "this-month" })), ["fresh", "stale", "unknown"]);
  assert.deepEqual(ids(match(rows, { ages: ["infant"], openings: true })), ["fresh"]);
});

test("home, work and both preserve the two-circle plus commute-corridor behavior", () => {
  const home = { lat: 49, lng: -117 };
  const work = { lat: 49.6, lng: -117 };
  const rows = [
    card("home", { ...home }), card("work", { ...work }),
    card("corridor", { lat: 49.3, lng: -117.01 }),
    card("off-corridor", { lat: 49.3, lng: -116.6 }),
    card("past-work", { lat: 49.9, lng: -117 }),
  ];
  const scope = { origin: home, secondOrigin: work, radiusKm: 10 };
  assert.deepEqual(ids(match(rows, {}, { ...scope, mode: "home" })), ["home"]);
  assert.deepEqual(ids(match(rows, {}, { ...scope, mode: "work" })), ["work"]);
  assert.deepEqual(ids(match(rows, {}, { ...scope, mode: "both" })), ["home", "work", "corridor"]);
  // Short commute also keeps intersection points off the narrow corridor.
  const closeWork = { lat: 49.1, lng: -117 };
  const intersection = card("intersection", { lat: 49.05, lng: -116.87 });
  assert.deepEqual(ids(match([intersection], {}, { origin: home, secondOrigin: closeWork, radiusKm: 20, mode: "both" })), ["intersection"]);
});

test("untrusted filters normalize without enabling false flags or unknown predicates", () => {
  const filters = normalizeSearchResultFilters({
    liveOnly: "false", openings: "1", licensedOnly: true, availability: "anything",
    careType: "invented", licence: "invented", category: "invented", start: "invented",
    ages: ["infant", "bogus", "infant", {}], pioneer: { spoken: "fr,bogus", meals: "false" },
    parent: { ages: ["infant", "bogus"], fac: ["family_home", "bogus"] },
    diet: "halal,bogus", name: 34, needBy: "2026-02-31", admin: true,
  });
  assert.equal(filters.liveOnly, false);
  assert.equal(filters.openings, true);
  assert.equal(filters.licensedOnly, true);
  assert.equal(filters.availability, "any");
  assert.equal(filters.careType, "any");
  assert.equal(filters.licence, null);
  assert.equal(filters.category, undefined);
  assert.equal(filters.start, undefined);
  assert.equal(filters.name, "");
  assert.equal(filters.needBy, undefined);
  assert.deepEqual(filters.ages, ["infant"]);
  assert.deepEqual(filters.pioneer, { spoken: "fr" });
  assert.deepEqual(filters.parent.ages, ["infant"]);
  assert.deepEqual(filters.parent.fac, ["family_home"]);
  assert.equal(filters.admin, undefined);
  assert.doesNotThrow(() => normalizeSearchResultFilters(null));
});

test("homes are matched before sealing; map pins retain only the protected area", () => {
  const home = card("home-private", { facilityType: "family_home", amenities: "home", showPublicAddress: false });
  const matched = match([home], { name: "Cornerstone" });
  const sealed = sealHomeRecords(matched.filter(hasSearchCoordinates), GUEST_HOME_VIEWER);
  const pins = projectSearchMapPins(sealed);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].address, "");
  assert.equal(pins[0].postalCode, "V1L");
  assert.equal(pins[0].protectedHome, true);
  assert.ok(pins[0].radiusM >= 500);
  assert.notEqual(pins[0].lat, home.lat);
  assert.notEqual(pins[0].lng, home.lng);
  assert.equal(pins[0].contactEmail, undefined);
  assert.equal(home.address, "123 Care Street");
});

test("missing coordinates remain in list totals but never become fabricated map pins", () => {
  const rows = match([card("zero", { lat: 0, lng: 0 }), card("nan", { lat: Number.NaN }), card("valid")]);
  assert.equal(rows.length, 3);
  assert.deepEqual(ids(projectSearchMapPins(rows)), ["valid"]);
  const missingHome = card("missing-home", { lat: 0, lng: 0, facilityType: "family_home", amenities: "home" });
  const sealed = sealHomeRecords([missingHome].filter(hasSearchCoordinates), GUEST_HOME_VIEWER);
  assert.deepEqual(projectSearchMapPins(sealed), []);
});

test("server list and map share pre-pagination matching and seal before map projection", () => {
  const source = readFileSync(new URL("../src/lib/server/daycares.ts", import.meta.url), "utf8");
  const page = source.slice(source.indexOf("export const searchDaycarePage"), source.indexOf("export const searchDaycareMap"));
  const map = source.slice(source.indexOf("export const searchDaycareMap"), source.indexOf("const HOME_TYPE_POOL"));
  assert.match(page, /const narrowed = await filteredSearchRows\(query\)/);
  assert.match(page, /sliceSearchPage\(narrowed\.rows, page\)/);
  assert.match(page, /evidence: narrowed\.evidence/);
  assert.match(map, /const matched = await filteredSearchRows/);
  assert.ok(map.indexOf("sealPublicHomes(") < map.indexOf("projectSearchMapPins(sealed)"));
  assert.match(map, /evidence: matched\.evidence/);
  assert.match(source, /filters\.name = query\.name \|\| filters\.name/);
});
