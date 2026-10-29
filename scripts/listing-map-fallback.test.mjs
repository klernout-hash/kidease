import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LISTING_MAP_TILE_WAIT_MS,
  MAP_STYLE_WAIT_MS,
  listingMapGiveUp,
  webglMapAvailable,
} from "../src/lib/osm-map.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("listing map gives up within 5s when tiles, WebGL, or a sized host never arrive", () => {
  assert.equal(LISTING_MAP_TILE_WAIT_MS, 5_000);
  assert.ok(MAP_STYLE_WAIT_MS > LISTING_MAP_TILE_WAIT_MS);
  assert.equal(webglMapAvailable(), false);
  assert.equal(
    listingMapGiveUp({
      validCoords: false,
      webgl: true,
      hostSized: true,
      sawTile: false,
      elapsedMs: 0,
      errored: false,
    }),
    true,
  );
  assert.equal(
    listingMapGiveUp({
      validCoords: true,
      webgl: false,
      hostSized: true,
      sawTile: false,
      elapsedMs: 0,
      errored: false,
    }),
    true,
  );
  assert.equal(
    listingMapGiveUp({
      validCoords: true,
      webgl: true,
      hostSized: true,
      sawTile: false,
      elapsedMs: 0,
      errored: true,
    }),
    true,
  );
  assert.equal(
    listingMapGiveUp({
      validCoords: true,
      webgl: true,
      hostSized: false,
      sawTile: false,
      elapsedMs: LISTING_MAP_TILE_WAIT_MS,
      errored: false,
    }),
    true,
  );
  assert.equal(
    listingMapGiveUp({
      validCoords: true,
      webgl: true,
      hostSized: true,
      sawTile: false,
      elapsedMs: LISTING_MAP_TILE_WAIT_MS - 1,
      errored: false,
    }),
    false,
  );
  assert.equal(
    listingMapGiveUp({
      validCoords: true,
      webgl: true,
      hostSized: true,
      sawTile: true,
      elapsedMs: LISTING_MAP_TILE_WAIT_MS + 1_000,
      errored: false,
    }),
    false,
  );
  assert.equal(
    listingMapGiveUp({
      validCoords: true,
      webgl: true,
      hostSized: false,
      sawTile: true,
      elapsedMs: LISTING_MAP_TILE_WAIT_MS,
      errored: false,
    }),
    true,
  );
  assert.equal(
    listingMapGiveUp({
      validCoords: true,
      webgl: true,
      hostSized: false,
      sawTile: true,
      elapsedMs: LISTING_MAP_TILE_WAIT_MS - 1,
      errored: false,
    }),
    false,
  );
});

test("listing map waits for real tiles and uses a WKWebView-safe WebGL context", () => {
  const map = read("src/lib/osm-map.ts");
  const listing = read("src/components/listing-map.tsx");
  const css = read("src/styles.css");
  assert.match(map, /powerPreference: "default"/);
  assert.match(map, /preserveDrawingBuffer: true/);
  assert.match(map, /failIfMajorPerformanceCaveat: false/);
  assert.match(map, /requireTiles/);
  assert.match(listing, /requireTiles: true/);
  assert.match(listing, /LISTING_MAP_TILE_WAIT_MS/);
  assert.match(listing, /webglMapAvailable/);
  assert.match(listing, /MapUnavailable/);
  assert.match(listing, /waitForMapHost/);
  assert.doesNotMatch(listing, /<iframe/);
  assert.match(css, /translateZ\(0\)/);
  assert.match(css, /\.ke-map-host\.maplibregl-map/);
  assert.match(css, /position:\s*absolute\s*!important/);
  assert.match(css, /height:\s*100%\s*!important/);
  assert.match(listing, /mapHostStyle/);
  assert.match(read("src/components/map-view.tsx"), /mapHostStyle/);
  assert.match(read("src/components/qc-area-map.tsx"), /mapHostStyle/);
  assert.match(map, /if \(!mapHostHasSize\(el\)\)/);
  assert.match(read("src/components/map-unavailable.tsx"), /Open in Maps/);
  assert.match(read("src/components/map-unavailable.tsx"), /Map unavailable/);
});
