import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listingMapRendererExtras, ROAD_STYLES } from "../src/lib/google-maps.ts";

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

  it("reads an optional public Map ID from VITE_GOOGLE_MAPS_MAP_ID and never hardcodes one", () => {
    const loader = read("src/lib/google-maps.ts");
    const view = read("src/components/map-view.tsx");
    assert.match(loader, /GOOGLE_MAPS_MAP_ID_ENV = "VITE_GOOGLE_MAPS_MAP_ID"/);
    assert.match(loader, /import\.meta\.env\.VITE_GOOGLE_MAPS_MAP_ID/);
    assert.match(view, /googleMapsMapId\(\)/);
    assert.doesNotMatch(loader, /mapId:\s*["'`]/);
    assert.doesNotMatch(view, /mapId:\s*["'`]/);
    assert.doesNotMatch(loader, /AIza[0-9A-Za-z_-]{20,}/);
    assert.doesNotMatch(view, /AIza[0-9A-Za-z_-]{20,}/);
  });

  it("stays on the quarterly channel (weekly without a Map ID was a gray canvas)", async () => {
    const loader = read("src/lib/google-maps.ts");
    assert.match(loader, /GOOGLE_MAPS_SCRIPT_VERSION = "quarterly"/);
    assert.match(loader, /v=\$\{GOOGLE_MAPS_SCRIPT_VERSION\}/);
    assert.doesNotMatch(loader, /GOOGLE_MAPS_SCRIPT_VERSION = "weekly"/);
    assert.doesNotMatch(loader, /[?&]v=weekly/);
    const { googleMapsScriptSrc } = await import("../src/lib/google-maps.ts");
    const vector = googleMapsScriptSrc("test-key", "KidEaseMap");
    const raster = googleMapsScriptSrc("test-key", "");
    assert.match(vector, /v=quarterly/);
    assert.match(vector, /libraries=marker/);
    assert.match(raster, /v=quarterly/);
    assert.doesNotMatch(raster, /libraries=marker/);
    assert.doesNotMatch(raster, /v=weekly/);
  });

  it("vector extras pass mapId; empty Map ID keeps raster styles + RASTER", () => {
    assert.deepEqual(listingMapRendererExtras("KidEaseNavy"), { mapId: "KidEaseNavy" });
    assert.deepEqual(listingMapRendererExtras("  "), {
      styles: ROAD_STYLES,
      renderingType: "RASTER",
    });
    assert.deepEqual(listingMapRendererExtras(""), {
      styles: ROAD_STYLES,
      renderingType: "RASTER",
    });
    const extras = listingMapRendererExtras("");
    assert.ok("styles" in extras);
    assert.ok(
      extras.styles.some((rule) => rule.featureType === "poi.business"),
      "raster path still hides business POIs",
    );
  });

  it("map constructor uses extras so raster is forced only without a Map ID", () => {
    const loader = read("src/lib/google-maps.ts");
    const view = read("src/components/map-view.tsx");
    assert.match(loader, /listingMapRendererExtras/);
    assert.match(loader, /listingMapConstructorOptions/);
    assert.match(loader, /RenderingType[\s\S]*RASTER/);
    assert.match(view, /listingMapConstructorOptions\(/);
    assert.doesNotMatch(view, /renderingType:\s*googleMapsRasterRenderingType\(maps\)/);
    assert.match(loader, /if \("mapId" in extras\)/);
    assert.match(loader, /renderingType:\s*googleMapsRasterRenderingType\(input\.maps\)/);
  });

  it("uses Advanced Markers when the marker library is available, else HTML overlays", () => {
    const loader = read("src/lib/google-maps.ts");
    const view = read("src/components/map-view.tsx");
    assert.match(loader, /loadAdvancedMarkerElement/);
    assert.match(loader, /importLibrary\("marker"\)/);
    assert.match(loader, /AdvancedMarkerElement/);
    assert.match(loader, /createListingOverlayFactory/);
    assert.match(loader, /defineHtmlOverlay/);
    assert.match(view, /loadAdvancedMarkerElement/);
    assert.match(view, /createListingOverlayFactory/);
    assert.match(loader, /libraries=marker/);
  });

  it("createListingOverlayFactory prefers Advanced Markers and falls back to OverlayView", async () => {
    const { createListingOverlayFactory, loadAdvancedMarkerElement } = await import(
      "../src/lib/google-maps.ts"
    );
    assert.equal(await loadAdvancedMarkerElement({}, ""), null);
    assert.equal(await loadAdvancedMarkerElement({ importLibrary: async () => ({}) }, "abc"), null);

    const constructed = [];
    class FakeAdvanced {
      map;
      position;
      content;
      constructor(opts) {
        constructed.push(opts);
        this.map = opts.map;
        this.position = opts.position;
        this.content = opts.content;
      }
      addListener() {}
    }
    const map = { __map: true };
    const content = { style: {}, classList: { add() {} }, addEventListener() {} };
    const factory = createListingOverlayFactory({}, FakeAdvanced);
    const overlay = factory({
      map,
      position: { lat: 49.9, lng: -97.1 },
      content,
      onClick() {},
    });
    assert.equal(constructed.length, 1);
    assert.equal(constructed[0].map, map);
    assert.equal(constructed[0].gmpClickable, true);
    overlay.setMap(null);
    assert.equal(constructed[0].map == null || overlay.getElement() === content, true);
    assert.equal(overlay.getElement(), content);
  });

  it("map view no longer requests Leaflet or Carto tiles", () => {
    const src = read("src/components/map-view.tsx");
    assert.match(src, /loadGoogleMaps/);
    assert.doesNotMatch(src, /leaflet/i);
    assert.doesNotMatch(src, /cartocdn|basemaps\.carto|carto\.com/i);
    assert.doesNotMatch(src, /tile\.openstreetmap|arcgisonline/i);
  });

  it("does not constrain Google Maps raster tile images", () => {
    const css = read("src/styles.css");
    assert.match(css, /\.gm-style img[\s\S]*max-width:\s*none\s*!important/);
  });

  it("server Places ratings still use the server-only keys", () => {
    const src = read("src/lib/server/google-places.ts");
    assert.match(src, /process\.env\.GOOGLE_PLACES_API_KEY/);
    assert.match(src, /process\.env\.GOOGLE_MAPS_API_KEY/);
  });
});
