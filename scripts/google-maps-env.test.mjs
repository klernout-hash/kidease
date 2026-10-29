import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OSM_ROAD_STYLE, OSM_TILE_HOST, SATELLITE_TILE_HOST } from "../src/lib/osm-map.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("maps use OpenFreeMap, not a Google Maps key", () => {
  it("loads MapLibre from the bundle and OpenFreeMap tiles with no key", () => {
    const src = read("src/lib/osm-map.ts");
    assert.match(src, /tiles\.openfreemap\.org\/styles\/liberty/);
    assert.equal(OSM_ROAD_STYLE, "https://tiles.openfreemap.org/styles/liberty");
    assert.equal(OSM_TILE_HOST, "https://tiles.openfreemap.org");
    assert.equal(SATELLITE_TILE_HOST, "https://tiles.maps.eox.at");
    assert.match(src, /OpenStreetMap/);
    assert.match(src, /AttributionControl/);
    assert.doesNotMatch(src, /maps\.googleapis\.com/);
    assert.doesNotMatch(src, /VITE_GOOGLE_MAPS_API_KEY/);
    assert.doesNotMatch(src, /process\.env\.GOOGLE_MAPS_API_KEY/);
    assert.doesNotMatch(src, /process\.env\.GOOGLE_PLACES_API_KEY/);
    assert.doesNotMatch(src, /AIza[0-9A-Za-z_-]{20,}/);
  });

  it("does not ship the Google loader or a hardcoded key", () => {
    assert.throws(() => read("src/lib/google-maps.ts"));
    const view = read("src/components/map-view.tsx");
    const listing = read("src/components/listing-map.tsx");
    assert.match(view, /createKidEaseMap/);
    assert.match(view, /preloadOsmMap|createKidEaseMap/);
    assert.match(listing, /createKidEaseMap/);
    assert.doesNotMatch(view, /loadGoogleMaps/);
    assert.doesNotMatch(listing, /loadGoogleMaps/);
    assert.doesNotMatch(view, /AIza[0-9A-Za-z_-]{20,}/);
    assert.doesNotMatch(listing, /AIza[0-9A-Za-z_-]{20,}/);
    assert.doesNotMatch(view, /mapId:\s*["'`]/);
  });

  it("keeps logo pins, clusters, radius fit, and a retry", () => {
    const view = read("src/components/map-view.tsx");
    assert.match(view, /ke-logo-pin/);
    assert.match(view, /PIN_SVG/);
    assert.match(view, /ke-cluster-bubble/);
    assert.match(view, /bboxFromRadius/);
    assert.match(view, /MAP_RADIUS_FIT_PAD/);
    assert.match(view, /mapLoading/);
    assert.match(view, /mapRetry/);
    assert.match(view, /ke-map-host/);
    assert.match(view, /fitBounds/);
    assert.match(view, /createYouAreHereDot/);
    assert.doesNotMatch(view, /leaflet/i);
    assert.doesNotMatch(view, /cartocdn|basemaps\.carto|carto\.com/i);
    assert.doesNotMatch(view, /tile\.openstreetmap\.org/i);
  });

  it("listing preview shares the same map helper and is not an iframe", () => {
    const src = read("src/components/listing-map.tsx");
    assert.match(src, /createKidEaseMap/);
    assert.match(src, /ke-map-host/);
    assert.match(src, /ke-logo-pin/);
    assert.doesNotMatch(src, /<iframe/);
    assert.doesNotMatch(src, /maps\.google\.com/);
    assert.doesNotMatch(src, /AIza[0-9A-Za-z_-]{20,}/);
  });

  it("does not squash map tiles, and shows OpenStreetMap attribution", () => {
    const css = read("src/styles.css");
    assert.match(css, /\.maplibregl-map img[\s\S]*max-width:\s*none\s*!important/);
    assert.match(css, /\.maplibregl-map img[\s\S]*height:\s*unset\s*!important/);
    assert.match(css, /color-scheme:\s*only light/);
    assert.match(css, /\.ke-map-skel/);
    assert.match(css, /\.maplibregl-ctrl-attrib/);
  });

  it("address lookup uses Photon, not the Google Geocoding API", () => {
    const src = read("src/lib/server/google-places.ts");
    const photon = read("src/lib/photon.ts");
    assert.match(photon, /photon\.komoot\.io/);
    assert.match(src, /photonSearchUrl/);
    assert.match(photon, /PHOTON_MIN_INTERVAL_MS = 1100/);
    assert.match(photon, /CANADA_BBOX/);
    assert.doesNotMatch(src, /maps\.googleapis\.com/);
    assert.doesNotMatch(src, /process\.env\.GOOGLE_MAPS_API_KEY/);
    assert.doesNotMatch(src, /process\.env\.GOOGLE_PLACES_API_KEY/);
    assert.doesNotMatch(src, /AIza[0-9A-Za-z_-]{20,}/);
    assert.doesNotMatch(read("src/lib/place-suggest.ts"), /loadGoogleMaps/);
  });
});
