import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("listing map uses browser Google Maps key, not Carto/Leaflet", () => {
  it("loads Maps JS from VITE_GOOGLE_MAPS_API_KEY only", () => {
    const src = read("src/lib/google-maps.ts");
    assert.match(src, /VITE_GOOGLE_MAPS_API_KEY/);
    assert.match(src, /maps\.googleapis\.com\/maps\/api\/js/);
    assert.doesNotMatch(src, /process\.env\.GOOGLE_MAPS_API_KEY/);
    assert.doesNotMatch(src, /process\.env\.GOOGLE_PLACES_API_KEY/);
  });

  it("map view no longer requests Leaflet or Carto tiles", () => {
    const src = read("src/components/map-view.tsx");
    assert.match(src, /loadGoogleMaps/);
    assert.doesNotMatch(src, /leaflet/i);
    assert.doesNotMatch(src, /cartocdn|basemaps\.carto|carto\.com/i);
    assert.doesNotMatch(src, /tile\.openstreetmap|arcgisonline/i);
  });

  it("server Places ratings still use the server-only keys", () => {
    const src = read("src/lib/server/google-places.ts");
    assert.match(src, /process\.env\.GOOGLE_PLACES_API_KEY/);
    assert.match(src, /process\.env\.GOOGLE_MAPS_API_KEY/);
  });
});
