import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { haversineKm, WINNIPEG } from "../src/lib/geo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function parseAnchorMode(value) {
  return value === "work" || value === "both" ? value : "home";
}

function resolveSearchAnchors(input) {
  const requested = parseAnchorMode(input.mode);
  const work = input.work && Number.isFinite(input.work.lat) && Number.isFinite(input.work.lng) ? input.work : null;
  if (requested === "work" && work) {
    return { primary: work, secondary: null, intersect: false, mode: "work" };
  }
  if (requested === "both" && work) {
    return { primary: input.home, secondary: work, intersect: true, mode: "both" };
  }
  return { primary: input.home, secondary: null, intersect: false, mode: "home" };
}

const HOME = { lat: WINNIPEG.lat, lng: WINNIPEG.lng };
/** ~8 km west of downtown Winnipeg — still inside a 15 km home circle. */
const WORK = { lat: 49.882, lng: -97.25 };
const NEAR_BOTH = { lat: 49.89, lng: -97.2, id: "both" };
const HOME_ONLY = { lat: 49.9, lng: -97.05, id: "home" };
const WORK_ONLY = { lat: 49.87, lng: -97.32, id: "work" };
const FAR = { lat: 49.7, lng: -96.8, id: "far" };

describe("dual-anchor resolve keeps single-origin as the default", () => {
  it("parses modes and falls back to home", () => {
    assert.equal(parseAnchorMode("both"), "both");
    assert.equal(parseAnchorMode("work"), "work");
    assert.equal(parseAnchorMode("home"), "home");
    assert.equal(parseAnchorMode("nope"), "home");
    assert.equal(parseAnchorMode(undefined), "home");
  });

  it("uses home when work is missing", () => {
    const both = resolveSearchAnchors({ home: HOME, work: null, mode: "both" });
    assert.equal(both.intersect, false);
    assert.equal(both.mode, "home");
    assert.equal(both.primary.lat, HOME.lat);
    const work = resolveSearchAnchors({ home: HOME, work: null, mode: "work" });
    assert.equal(work.mode, "home");
    assert.equal(work.intersect, false);
  });

  it("work-only searches the second point without intersecting", () => {
    const resolved = resolveSearchAnchors({ home: HOME, work: WORK, mode: "work" });
    assert.equal(resolved.mode, "work");
    assert.equal(resolved.intersect, false);
    assert.equal(resolved.primary.lng, WORK.lng);
    assert.equal(resolved.secondary, null);
  });

  it("both mode intersects the two radii", () => {
    const resolved = resolveSearchAnchors({ home: HOME, work: WORK, mode: "both" });
    assert.equal(resolved.mode, "both");
    assert.equal(resolved.intersect, true);
    assert.equal(resolved.primary.lat, HOME.lat);
    assert.equal(resolved.secondary?.lng, WORK.lng);
  });
});

function km(a, b) {
  return Math.round(haversineKm(a, b) * 10) / 10;
}

function idsInside(origin, radius, points) {
  return points.filter((p) => km(origin, p) <= radius).map((p) => p.id);
}

describe("withinBothRadii is the intersection of two circles", () => {
  it("keeps only points inside both radii", () => {
    const radius = 12;
    const points = [NEAR_BOTH, HOME_ONLY, WORK_ONLY, FAR];
    const homeHits = idsInside(HOME, radius, points);
    const workHits = idsInside(WORK, radius, points);
    const dual = points.filter((p) => homeHits.includes(p.id) && workHits.includes(p.id));
    assert.ok(homeHits.includes("home"));
    assert.ok(homeHits.includes("both"));
    assert.ok(!homeHits.includes("far"));
    assert.deepEqual(
      dual.map((p) => p.id),
      ["both"],
    );
    assert.ok(km(HOME, HOME_ONLY) <= radius);
    assert.ok(km(WORK, HOME_ONLY) > radius);
    const src = read("src/lib/proximity.ts");
    assert.match(src, /export function withinBothRadii/);
    assert.match(src, /distanceKmB/);
  });
});

describe("search stack keeps single-anchor and adds dual PostGIS", () => {
  it("dual SQL is two ST_DWithin calls; single nearbyListings stays", () => {
    const neon = read("src/lib/server/catalog-neon.ts");
    const nearby = read("src/lib/server/nearby.ts");
    const search = read("src/lib/server/daycares.ts");
    const lib = read("src/lib/dual-anchor.ts");
    assert.match(lib, /export function resolveSearchAnchors/);
    assert.match(lib, /export function parseAnchorMode/);
    assert.match(neon, /NEON_NEAR_SQL/);
    assert.match(neon, /NEON_DUAL_NEAR_SQL/);
    assert.match(neon, /st_makepoint\(\$4, \$5\)/);
    assert.match(nearby, /nearbyListingsDual/);
    assert.match(nearby, /NEARBY_DUAL_SQL/);
    assert.match(search, /nearbyListings\(/);
    assert.match(search, /nearbyListingsDual/);
    assert.match(search, /resolveSearchAnchors/);
    assert.doesNotMatch(search, /mapbox/i);
  });

  it("Explore shows Home / Work / Both and dual empty copy", () => {
    const page = read("src/routes/search.tsx");
    const copy = read("src/lib/copy.ts");
    const map = read("src/components/map-view.tsx");
    assert.match(page, /DualAnchorBar/);
    const bar = read("src/components/dual-anchor-bar.tsx");
    assert.match(bar, /resolveLocationQuery/);
    assert.match(bar, /PlaceSearch/);
    assert.match(bar, /anchorWorkMiss/);
    assert.match(bar, /overflow-visible/);
    const places = read("src/components/place-search.tsx");
    assert.match(places, /data-place-suggestions/);
    assert.match(places, /absolute left-0 right-0 top-\[calc\(100%/);
    assert.doesNotMatch(places, /createPortal/);
    assert.match(places, /suggestPlacesBrowser/);
    assert.match(places, /geocodeWithBrowser/);
    assert.match(places, /suggestLocalPlaces/);
    assert.match(read("src/lib/copy.ts"), /anchorWorkMiss: "We couldn’t find that address/);
    assert.match(page, /noDualResults/);
    assert.match(page, /secondOrigin/);
    assert.match(page, /getMySearchAnchors/);
    assert.match(copy, /noDualResultsBody/);
    assert.match(copy, /anchorBoth/);
    assert.match(map, /circle2Ref/);
    assert.match(map, /secondOrigin/);
    assert.match(read("src/lib/store.ts"), /workOrigin/);
    assert.match(read("migrations/0037_search_anchors.sql"), /work_lat/);
  });
});
