import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { directionsUrl, placePinPopup } from "../src/lib/maps.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mapView = readFileSync(join(root, "src/components/map-view.tsx"), "utf8");

test("pin popup sits above the logo and flips below when the pin is near the top", () => {
  const above = placePinPopup({
    pointX: 200,
    pointY: 220,
    width: 240,
    height: 120,
    mapWidth: 400,
    mapHeight: 500,
  });
  assert.equal(above.placement, "above");
  assert.equal(above.top, 220 - 44 - 8 - 120);
  assert.equal(above.left, 80);

  const below = placePinPopup({
    pointX: 200,
    pointY: 30,
    width: 240,
    height: 120,
    mapWidth: 400,
    mapHeight: 500,
  });
  assert.equal(below.placement, "below");
  assert.equal(below.top, 38);
});

test("pin popup stays inside the map and the caret still points at the pin", () => {
  const box = placePinPopup({
    pointX: 20,
    pointY: 220,
    width: 240,
    height: 120,
    mapWidth: 400,
    mapHeight: 500,
  });
  assert.equal(box.left, 8);
  assert.equal(box.caretX, 16);
  assert.ok(box.top >= 8);
  assert.ok(box.top + 120 <= 492);
});

test("directions use the centre point, Apple Maps when asked, Google Maps otherwise", () => {
  const google = directionsUrl(53.54, -113.49, "Kids World", { apple: false });
  assert.match(google, /^https:\/\/www\.google\.com\/maps\/dir\/\?/);
  assert.match(google, /destination=53\.54%2C-113\.49/);
  assert.match(google, /travelmode=driving/);

  const apple = directionsUrl(53.54, -113.49, "Kids World", { apple: true });
  assert.match(apple, /^https:\/\/maps\.apple\.com\/\?/);
  assert.match(apple, /daddr=53\.54%2C-113\.49/);
  assert.match(apple, /dirflg=d/);

  const fallback = directionsUrl(Number.NaN, Number.NaN, "123 Main St, Edmonton", { apple: false });
  assert.match(fallback, /destination=123\+Main\+St%2C\+Edmonton/);
});

test("search map opens one listing popup from a KidEase logo pin", () => {
  assert.match(mapView, /ke-logo-pin/);
  assert.match(mapView, /data-ke="map-selected-card"/);
  assert.match(mapView, /data-ke="map-pin-directions"/);
  assert.match(mapView, /data-ke="map-pin-popup-close"/);
  assert.match(mapView, /t\("getDirections"\)/);
  assert.match(mapView, /openDirections\(/);
  assert.match(mapView, /addListener\(map, "click"/);
  assert.match(mapView, /publicApprovalEligible/);
  assert.doesNotMatch(mapView, /TrustSignals/);
  assert.doesNotMatch(mapView, /feeBadgeKey/);
});
