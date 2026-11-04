import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OSM_ROAD_STYLE, OSM_TILE_HOST, SATELLITE_TILE_HOST } from "../src/lib/osm-map.ts";
import { googleMapsBrowserEnabled, googleMapsBrowserKey } from "./google-maps-client-key.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("Google Maps is the default and OpenFreeMap stays the backup", () => {
  it("keeps OpenFreeMap tiles in the backup with no key", () => {
    const src = read("src/lib/osm-map.ts");
    assert.match(src, /tiles\.openfreemap\.org\/styles\/liberty/);
    assert.equal(OSM_ROAD_STYLE, "https://tiles.openfreemap.org/styles/liberty");
    assert.equal(OSM_TILE_HOST, "https://tiles.openfreemap.org");
    assert.equal(SATELLITE_TILE_HOST, "https://tiles.maps.eox.at");
    assert.match(src, /OpenStreetMap/);
    assert.match(src, /AttributionControl/);
    assert.match(src, /createGoogleKidEaseMap/);
    assert.match(src, /forceMapProvider\("openfreemap"\)/);
    assert.match(src, /whenMapHostVisible/);
    assert.doesNotMatch(src, /maps\.googleapis\.com/);
    assert.doesNotMatch(src, /VITE_GOOGLE_MAPS_API_KEY/);
    assert.doesNotMatch(src, /process\.env\.GOOGLE_MAPS_API_KEY/);
    assert.doesNotMatch(src, /process\.env\.GOOGLE_PLACES_API_KEY/);
    assert.doesNotMatch(src, /AIza[0-9A-Za-z_-]{20,}/);
  });

  it("loads the Maps JS API without Places, Geocoding, or a hardcoded key", () => {
    const google = read("src/lib/google-map.ts");
    const view = read("src/components/map-view.tsx");
    const listing = read("src/components/listing-map.tsx");
    assert.match(google, /maps\.googleapis\.com\/maps\/api\/js/);
    assert.match(google, /gm_authFailure/);
    assert.match(google, /importLibrary\("maps"\)/);
    assert.match(google, /clickableIcons: false/);
    assert.match(google, /streetViewControl: false/);
    assert.doesNotMatch(google, /places\.googleapis\.com/);
    assert.doesNotMatch(google, /maps\/api\/streetview/);
    assert.doesNotMatch(google, /StreetViewPanorama|StreetViewService|searchByText/);
    assert.match(google, /releaseLiveMap|live = \{ destroy \}/);
    assert.doesNotMatch(google, /maps\.places|PlacesService|Autocomplete|importLibrary\("places"\)|importLibrary\("geocoding"\)|new google\.maps\.Geocoder|libraries=places/);
    assert.doesNotMatch(google, /AIza[0-9A-Za-z_-]{20,}/);
    assert.doesNotMatch(google, /process\.env\.GOOGLE_MAPS_API_KEY/);
    assert.match(view, /createKidEaseMap/);
    assert.match(view, /whenMapHostVisible/);
    assert.match(view, /ke-cluster-bubble|markersForMapView/);
    assert.match(listing, /createKidEaseMap/);
    assert.match(listing, /whenMapHostVisible/);
    assert.doesNotMatch(view, /AIza[0-9A-Za-z_-]{20,}/);
    assert.doesNotMatch(listing, /AIza[0-9A-Za-z_-]{20,}/);
    assert.doesNotMatch(view, /mapId:\s*["'`]/);
    assert.doesNotMatch(google, /mapId:\s*["'`]/);
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

  it("ships the browser key only when the provider is google", () => {
    const fake = `AIza${"UnitTestKeyValueNotReal000000"}`;
    const held = { VITE_GOOGLE_MAPS_API_KEY: fake, GOOGLE_MAPS_API_KEY: fake };
    assert.equal(googleMapsBrowserEnabled({}), true);
    assert.equal(googleMapsBrowserEnabled(held), true);
    assert.equal(googleMapsBrowserKey(held), fake);
    assert.equal(googleMapsBrowserKey({ ...held, VITE_MAP_PROVIDER: "openfreemap" }), "");
    assert.equal(googleMapsBrowserKey({ ...held, NEXT_PUBLIC_MAP_PROVIDER: "osm" }), "");
    assert.equal(googleMapsBrowserKey({ ...held, VITE_MAP_PROVIDER: "google" }), fake);
    assert.equal(googleMapsBrowserEnabled({ VITE_MAP_PROVIDER: "openfreemap" }), false);
    const vite = read("vite.config.ts");
    const helper = read("scripts/google-maps-client-key.mjs");
    assert.match(vite, /googleMapsBrowserKey/);
    assert.match(vite, /import\.meta\.env\.VITE_GOOGLE_MAPS_API_KEY/);
    assert.match(helper, /VITE_MAP_PROVIDER/);
    assert.doesNotMatch(vite, /AIza[0-9A-Za-z_-]{20,}/);
    assert.doesNotMatch(helper, /AIza[0-9A-Za-z_-]{20,}/);
    assert.match(read(".env.example"), /^FEATURE_GOOGLE_MAPS=0$/m);
    assert.match(read(".env.example"), /^# VITE_GOOGLE_MAPS_API_KEY=$/m);
    assert.match(read(".env.example"), /VITE_MAP_PROVIDER=google/);
  });

  it("does not call Places API (New) or Street View from the app", () => {
    const forbidden = /places\.googleapis\.com|maps\/api\/streetview|maps\/api\/place|StreetViewPanorama|StreetViewService|searchByText|PlaceAutocompleteElement/;
    const hits = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const next = join(dir, name.name);
        if (name.isDirectory()) {
          if (name.name === "node_modules") continue;
          walk(next);
          continue;
        }
        if (!/\.(ts|tsx|mjs|js|css)$/.test(name.name)) continue;
        const text = readFileSync(next, "utf8");
        if (forbidden.test(text)) hits.push(next.slice(root.length + 1));
      }
    };
    walk(join(root, "src"));
    assert.deepEqual(hits, []);
    assert.match(read("src/lib/google-map.ts"), /clickableIcons: false/);
    assert.match(read("src/lib/google-map.ts"), /streetViewControl: false/);
    assert.doesNotMatch(read("scripts/csp.mjs"), /places\.googleapis\.com/);
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
