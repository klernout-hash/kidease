import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WINNIPEG } from "../src/lib/geo.ts";
import { MAP_RADIUS_FIT_PAD, radiusFitPadding } from "../src/lib/maps.ts";
import {
  DEFAULT_SEARCH_RADIUS_KM,
  RADIUS_CIRCLE_STYLE,
  boundsCoverRadiusFrame,
  radiusCircleFrame,
  radiusFrameKey,
  searchRadiusKm,
  shouldRefitSearchCamera,
} from "../src/lib/map-radius-frame.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const view = readFileSync(join(root, "src/components/map-view.tsx"), "utf8");

function spanKm(frame) {
  return {
    lat: (frame.maxLat - frame.minLat) * 110.574,
    lng: (frame.maxLng - frame.minLng) * 111.32 * Math.cos((WINNIPEG.lat * Math.PI) / 180),
  };
}

test("the search circle is the selected radius, centred on the city", () => {
  for (const radius of [5, 10, 25]) {
    const frame = radiusCircleFrame(WINNIPEG, radius);
    assert.equal(frame.radiusKm, radius);
    assert.equal(frame.meters, radius * 1000);
    const midLat = (frame.minLat + frame.maxLat) / 2;
    const midLng = (frame.minLng + frame.maxLng) / 2;
    assert.ok(Math.abs(midLat - WINNIPEG.lat) < 1e-9);
    assert.ok(Math.abs(midLng - WINNIPEG.lng) < 1e-9);
    const span = spanKm(frame);
    assert.ok(Math.abs(span.lat - radius * 2) < 0.05, `lat span ${span.lat}`);
    assert.ok(Math.abs(span.lng - radius * 2) < 0.2, `lng span ${span.lng}`);
  }
  const five = radiusCircleFrame(WINNIPEG, 5);
  const ten = radiusCircleFrame(WINNIPEG, 10);
  const twentyFive = radiusCircleFrame(WINNIPEG, 25);
  assert.ok(ten.maxLat - ten.minLat > five.maxLat - five.minLat);
  assert.ok(twentyFive.maxLat - twentyFive.minLat > ten.maxLat - ten.minLat);
});

test("a missing radius uses the app default, and a change of radius or city refits", () => {
  assert.equal(DEFAULT_SEARCH_RADIUS_KM, 25);
  assert.equal(searchRadiusKm(undefined), 25);
  assert.equal(searchRadiusKm(null), 25);
  assert.equal(searchRadiusKm(Number.NaN), 25);
  assert.equal(radiusCircleFrame(WINNIPEG, Number.NaN).radiusKm, 25);

  const city = radiusFrameKey(WINNIPEG, 25);
  const tighter = radiusFrameKey(WINNIPEG, 10);
  const five = radiusFrameKey(WINNIPEG, 5);
  const moved = radiusFrameKey({ lat: WINNIPEG.lat + 0.2, lng: WINNIPEG.lng }, 25);
  assert.equal(shouldRefitSearchCamera(city, city), false);
  assert.equal(shouldRefitSearchCamera(city, tighter), true);
  assert.equal(shouldRefitSearchCamera(tighter, five), true);
  assert.equal(shouldRefitSearchCamera(city, moved), true);
  assert.notEqual(five, tighter);
});

test("phone padding still frames the circle, and the desktop pad is unchanged", () => {
  assert.deepEqual(radiusFitPadding(1280), MAP_RADIUS_FIT_PAD);
  const phone = radiusFitPadding(390);
  assert.ok(phone.right < MAP_RADIUS_FIT_PAD.right);
  assert.ok(phone.top >= 48 && phone.top <= MAP_RADIUS_FIT_PAD.top);
  assert.ok(phone.left > 0 && phone.bottom > 0);
  const frame = radiusCircleFrame(WINNIPEG, 25);
  const padded = {
    minLat: frame.minLat - 0.02,
    maxLat: frame.maxLat + 0.02,
    minLng: frame.minLng - 0.02,
    maxLng: frame.maxLng + 0.02,
  };
  assert.equal(boundsCoverRadiusFrame(padded, frame), true);
  assert.equal(boundsCoverRadiusFrame(frame, padded), false);
});

test("the outline is faint and the camera refits only when the search frame changes", () => {
  assert.equal(RADIUS_CIRCLE_STYLE.clickable, false);
  assert.ok(RADIUS_CIRCLE_STYLE.strokeOpacity <= 0.4);
  assert.ok(RADIUS_CIRCLE_STYLE.fillOpacity <= 0.06);
  assert.ok(RADIUS_CIRCLE_STYLE.strokeWeight <= 2);
  assert.match(view, /radiusCircleFrame/);
  assert.match(view, /bboxFromRadius/);
  assert.match(view, /MAP_RADIUS_FIT_PAD/);
  assert.match(view, /radiusFitPadding/);
  assert.match(view, /userMovedRef/);
  assert.match(view, /dragstart/);
  assert.match(view, /RADIUS_CIRCLE_STYLE/);
  assert.match(view, /mapZoomForRadius/);
  assert.match(view, /originRef/);
  assert.match(view, /loadGoogleMaps\(/);
  assert.doesNotMatch(view, /setZoom\(minZoom\)/);
});
