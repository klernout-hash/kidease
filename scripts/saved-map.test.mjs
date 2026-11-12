import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  listPinsForCamera,
  mapViewCacheKey,
  markerCount,
  markersForMapView,
  projectMapRows,
  readMapViewCache,
  resetMapViewCache,
  writeMapViewCache,
} from "../src/lib/map-cluster.ts";

const saved = {
  id: "saved-qa-centre",
  slug: "saved-qa-centre",
  name: "Saved QA centre",
  nameFr: "",
  lat: 49.9,
  lng: -97.14,
  address: "",
  city: "Winnipeg",
  province: "MB",
  postalCode: "",
};

function frame(latSpan, lngSpan, lat = saved.lat) {
  return {
    minLat: lat - latSpan / 2,
    maxLat: lat + latSpan / 2,
    minLng: saved.lng - lngSpan / 2,
    maxLng: saved.lng + lngSpan / 2,
  };
}

function draw(pins, zoom, camera) {
  return markersForMapView({
    view: listPinsForCamera(pins, zoom, camera, { itemsOnly: true }),
    zoom,
    bounds: camera,
    atLat: saved.lat,
  }).markers;
}

test("one saved centre stays one pin at phone/desktop, close, and country zooms", () => {
  for (const [zoom, camera] of [
    [10, frame(0.5, 0.5)],
    [10, frame(0.5, 1.5)],
    [18, frame(0.002, 0.004)],
    [4, frame(20, 40)],
  ]) {
    const markers = draw([saved], zoom, camera);
    assert.equal(markerCount(markers), 1, `zoom ${zoom}`);
    assert.equal(markers.length, 1);
    assert.equal(markers[0].kind, "pin");
    assert.equal(markers[0].item.id, saved.id);
  }
  // Search maps keep their bounded list-seeding behavior.
  assert.equal(listPinsForCamera([saved], 18, frame(0.002, 0.004)), null);
  assert.equal(listPinsForCamera([saved], 4, frame(20, 40)), null);
});

test("cached general results cannot add pins to saved-only panning or an empty shortlist", () => {
  const camera = frame(0.5, 1.5);
  const nearby = { ...saved, id: "not-saved", slug: "not-saved", lat: saved.lat + 0.05 };
  resetMapViewCache();
  const key = mapViewCacheKey(camera, 10);
  writeMapViewCache(key, projectMapRows([saved, nearby], 10, camera));
  assert.equal(readMapViewCache(key)?.total, 2);
  assert.deepEqual(draw([saved], 10, camera).map((marker) => marker.item.id), [saved.id]);
  assert.equal(markerCount(draw([saved], 10, frame(0.5, 1.5, saved.lat + 2))), 0);
  assert.equal(markerCount(draw([saved], 10, camera)), 1);
  assert.equal(markerCount(draw([], 10, camera)), 0);
  resetMapViewCache();
});

test("shortlist opts into item-only data, fetch guard, repainting, and saved labels", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const shortlist = read("src/components/parent-shortlist.tsx");
  const view = read("src/components/map-view.tsx");
  assert.match(shortlist, /<MapView\s+itemsOnly\b/);
  const fetchEffect = view.slice(view.indexOf("const pendingTiles ="), view.indexOf("if (itemsOnly || loadedView.current)"));
  const fetchStart = view.slice(view.lastIndexOf("useEffect(() =>", view.indexOf("const pendingTiles =")), view.indexOf("const pendingTiles ="));
  assert.match(fetchStart, /if \(itemsOnly\) return/);
  assert.match(fetchEffect, /\[ready, mapEpoch, itemsOnly\]/);
  assert.match(view, /const view = itemsOnly \? seeded/);
  assert.match(view, /listPinsForCamera\(searchCardsToMapPins\(items\), zoom, frame, \{ itemsOnly \}\)/);
  assert.match(view, /itemsOnly\s*\? maps\.event\.addListener\(map, "idle", paint\)/);
  assert.match(view, /t\("mapSavedOnly"\)/);
  assert.match(view, /t\("mapSavedCount"\)/);
});
