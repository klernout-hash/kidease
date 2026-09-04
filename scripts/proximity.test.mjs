import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultDistanceUnit,
  displayDistance,
  kmToMi,
  miToKm,
} from "../src/lib/units.ts";
import { isBackgroundLocationRequested } from "../src/lib/location-consent.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("distance units default to km for Canada", () => {
  it("converts km and miles", () => {
    assert.equal(kmToMi(16.09344), 10);
    assert.equal(miToKm(10), 16.1);
    assert.equal(displayDistance(25, "km"), "25");
    assert.equal(displayDistance(16.09344, "mi"), "10");
  });

  it("defaults to km except en-US", () => {
    assert.equal(defaultDistanceUnit("en-CA"), "km");
    assert.equal(defaultDistanceUnit("fr-CA"), "km");
    assert.equal(defaultDistanceUnit("en"), "km");
    assert.equal(defaultDistanceUnit("en-US"), "mi");
  });
});

describe("nearby uses PostGIS ST_DWithin with a catalogue fallback", () => {
  it("SQL is geography + ST_DWithin and never hardcodes a key", () => {
    const nearby = read("src/lib/server/nearby.ts");
    assert.match(nearby, /st_dwithin/i);
    assert.match(nearby, /st_makepoint\(\$1, \$2\)/);
    assert.match(nearby, /postgis/);
    const migration = read("migrations/0011_listing_geography.sql");
    assert.match(migration, /create extension if not exists postgis/i);
    assert.match(migration, /geography\(Point, 4326\)/);
    assert.match(migration, /gist \(location\)/);
    assert.doesNotMatch(migration, /AIza[0-9A-Za-z_-]{20,}/);
  });

  it("search prefers nearbyListings and still imports from centres.json", () => {
    const search = read("src/lib/server/daycares.ts");
    const nearby = read("src/lib/server/nearby.ts");
    assert.match(search, /nearbyListings/);
    assert.match(nearby, /catalogNear/);
    assert.match(nearby, /dbSource === "neon"/);
    assert.match(nearby, /importCatalogSlice/);
  });

  it("PGLite skips the PostGIS migration; Neon migrate.mjs still applies it", () => {
    const db = read("src/lib/db.ts");
    assert.match(db, /geography|postgis/);
    assert.match(read("scripts/migrate.mjs"), /migrations/);
  });
});

describe("Places autocomplete stays on the server key", () => {
  it("uses GOOGLE_PLACES_API_KEY / GOOGLE_MAPS_API_KEY only on the server", () => {
    const src = read("src/lib/server/google-places.ts");
    assert.match(src, /process\.env\.GOOGLE_PLACES_API_KEY/);
    assert.match(src, /process\.env\.GOOGLE_MAPS_API_KEY/);
    assert.match(src, /place\/autocomplete\/json/);
    assert.match(src, /place\/details\/json/);
    assert.match(src, /geocode\/json/);
    assert.match(src, /country:ca/);
    assert.doesNotMatch(src, /AIza[0-9A-Za-z_-]{20,}/);
    assert.doesNotMatch(read("src/components/place-search.tsx"), /process\.env\.GOOGLE_/);
    assert.doesNotMatch(read("src/lib/google-maps.ts"), /process\.env\.GOOGLE_PLACES_API_KEY/);
  });

  it("search and home use PlaceSearch", () => {
    assert.match(read("src/routes/search.tsx"), /PlaceSearch/);
    assert.match(read("src/routes/index.tsx"), /PlaceSearch/);
  });
});

describe("precise location is when-in-use only", () => {
  it("does not request background location", () => {
    assert.equal(isBackgroundLocationRequested("when-in-use"), false);
    assert.equal(isBackgroundLocationRequested("always"), true);
    const native = read("src/lib/native.ts");
    assert.match(native, /enableHighAccuracy: true/);
    assert.doesNotMatch(native, /watchPosition\([\s\S]*background|ACCESS_BACKGROUND_LOCATION/);
    assert.doesNotMatch(read("capacitor.config.ts"), /ACCESS_BACKGROUND_LOCATION|NSLocationAlways/);
    assert.match(read("src/components/native-boot.tsx"), /readLocationConsent/);
    assert.match(read("src/lib/use-presence.ts"), /locationConsent !== "granted"/);
    assert.match(read("src/routes/search.tsx"), /LocationConsentCard/);
  });
});

describe("dual chrome and map clustering stay in place", () => {
  it("keeps app sheet + website side-by-side and existing clusters", () => {
    const search = read("src/routes/search.tsx");
    assert.match(search, /data-channel=app/);
    assert.match(search, /ExploreSheet/);
    assert.match(search, /ke-gutter mx-auto max-w-7xl/);
    const map = read("src/components/map-view.tsx");
    assert.match(map, /clusterItems/);
    assert.match(map, /ke-count-cluster/);
    assert.match(map, /listingMapConstructorOptions/);
    assert.match(map, /googleMapsMapId\(\)/);
    assert.doesNotMatch(map, /mapId:\s*["'`]/);
  });
});
