import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { directionsUrl, placePinPopup } from "../src/lib/maps.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mapView = readFileSync(join(root, "src/components/map-view.tsx"), "utf8");
const listingPage = readFileSync(join(root, "src/routes/daycare.$slug.tsx"), "utf8");
const share = readFileSync(join(root, "src/components/free-listing-share.tsx"), "utf8");
const daycares = readFileSync(join(root, "src/lib/server/daycares.ts"), "utf8");

/** Winnipeg city centroid from geo.ts. QA street is the ghost claim-lab lane, not a live centre. */
const WINNIPEG_CENTROID = { lat: 49.8951, lng: -97.1384 };
const QA_STREET = {
  apple: false,
  address: "100 KidEase Test Lane",
  city: "Winnipeg",
  province: "MB",
  postalCode: "R3C 0A1",
};

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

test("directions prefer a street address over a city centroid when both exist", () => {
  const google = directionsUrl(WINNIPEG_CENTROID.lat, WINNIPEG_CENTROID.lng, "TEST Ghost Claim Lab", QA_STREET);
  assert.match(google, /^https:\/\/www\.google\.com\/maps\/dir\/\?/);
  assert.match(google, /destination=100\+KidEase\+Test\+Lane%2C\+Winnipeg%2C\+MB\+R3C\+0A1/);
  assert.match(google, /travelmode=driving/);
  assert.doesNotMatch(google, /49\.8951%2C-97\.1384/);

  const apple = directionsUrl(WINNIPEG_CENTROID.lat, WINNIPEG_CENTROID.lng, "TEST Ghost Claim Lab", {
    ...QA_STREET,
    apple: true,
  });
  assert.match(apple, /^https:\/\/maps\.apple\.com\/\?/);
  assert.match(apple, /daddr=100\+KidEase\+Test\+Lane%2C\+Winnipeg%2C\+MB\+R3C\+0A1/);
  assert.doesNotMatch(apple, /49\.8951%2C-97\.1384/);

  const precisePin = directionsUrl(49.8992, -97.1391, "TEST Ghost Claim Lab", QA_STREET);
  assert.match(precisePin, /destination=100\+KidEase\+Test\+Lane%2C\+Winnipeg%2C\+MB\+R3C\+0A1/);
  assert.doesNotMatch(precisePin, /49\.8992%2C-97\.1391/);

  const withBox = directionsUrl(WINNIPEG_CENTROID.lat, WINNIPEG_CENTROID.lng, "TEST Ghost Claim Lab", {
    ...QA_STREET,
    address: "100 KidEase Test Lane, PO Box 4",
  });
  assert.match(withBox, /destination=100\+KidEase\+Test\+Lane%2C\+Winnipeg%2C\+MB\+R3C\+0A1/);
  assert.doesNotMatch(withBox, /PO\+Box/);
  assert.doesNotMatch(withBox, /49\.8951%2C-97\.1384/);
});

test("directions fall back without inventing a street when the address is only a city", () => {
  const centroid = directionsUrl(WINNIPEG_CENTROID.lat, WINNIPEG_CENTROID.lng, "TEST Ghost Claim Lab", {
    apple: false,
    address: "Winnipeg, MB R3C 0A1",
    city: "Winnipeg",
    province: "MB",
    postalCode: "R3C 0A1",
  });
  assert.match(centroid, /destination=TEST\+Ghost\+Claim\+Lab%2C\+Winnipeg%2C\+MB\+R3C\+0A1/);
  assert.doesNotMatch(centroid, /49\.8951%2C-97\.1384/);
  assert.doesNotMatch(centroid, /KidEase\+Test\+Lane/);

  const named = directionsUrl(Number.NaN, Number.NaN, "TEST Ghost Claim Lab", {
    apple: false,
    address: "General Delivery",
    city: "Winnipeg",
    province: "MB",
  });
  assert.match(named, /destination=TEST\+Ghost\+Claim\+Lab%2C\+Winnipeg%2C\+MB/);
  assert.doesNotMatch(named, /General\+Delivery/);
});

test("blank street uses the centre name, city, province code, and postal", () => {
  const google = directionsUrl(WINNIPEG_CENTROID.lat, WINNIPEG_CENTROID.lng, "Little Oaks Daycare", {
    apple: false,
    address: "",
    city: "Winnipeg",
    province: "Manitoba",
    postalCode: "R3T 2N2",
  });
  assert.match(google, /destination=Little\+Oaks\+Daycare%2C\+Winnipeg%2C\+MB\+R3T\+2N2/);
  assert.doesNotMatch(google, /49\.8951%2C-97\.1384/);
  assert.doesNotMatch(google, /Manitoba/);

  const precise = directionsUrl(49.807, -97.153, "Little Oaks Daycare", {
    apple: false,
    address: "   ",
    city: "Winnipeg",
    province: "MB",
    postalCode: "r3t2n2",
  });
  assert.match(precise, /destination=Little\+Oaks\+Daycare%2C\+Winnipeg%2C\+MB\+R3T\+2N2/);
  assert.doesNotMatch(precise, /49\.807%2C-97\.153/);
});

test("placeholder postal is left out of the directions query", () => {
  const blank = directionsUrl(WINNIPEG_CENTROID.lat, WINNIPEG_CENTROID.lng, "Little Oaks Daycare", {
    apple: false,
    address: "",
    city: "Winnipeg",
    province: "MB",
    postalCode: "R3K 0Z8",
  });
  assert.match(blank, /destination=Little\+Oaks\+Daycare%2C\+Winnipeg%2C\+MB&/);
  assert.doesNotMatch(blank, /R3K/);
  assert.doesNotMatch(blank, /49\.8951%2C-97\.1384/);

  const withStreet = directionsUrl(49.8819, -97.3077, "St. James Y Family Child Care", {
    apple: false,
    address: "3550 Portage Avenue",
    city: "Winnipeg",
    province: "MB",
    postalCode: "R3K 0Z8",
  });
  assert.match(withStreet, /destination=3550\+Portage\+Avenue%2C\+Winnipeg%2C\+MB&/);
  assert.doesNotMatch(withStreet, /R3K/);
});

test("a room description is not a street address", () => {
  const room = directionsUrl(WINNIPEG_CENTROID.lat, WINNIPEG_CENTROID.lng, "Little Oaks Daycare", {
    apple: false,
    address: "Room 104",
    city: "Winnipeg",
    province: "MB",
    postalCode: "R3T 2N2",
  });
  assert.match(room, /destination=Little\+Oaks\+Daycare%2C\+Winnipeg%2C\+MB\+R3T\+2N2/);
  assert.doesNotMatch(room, /Room/);
  assert.doesNotMatch(room, /49\.8951%2C-97\.1384/);

  const school = directionsUrl(51.15, -100.05, "Dauphin Magical Horizons School age - MacNeill", {
    apple: false,
    address: "Room 7-312 Sandy Street",
    city: "Dauphin",
    province: "MB",
    postalCode: "R7N 0K9",
  });
  assert.match(school, /destination=Room\+7-312\+Sandy\+Street%2C\+Dauphin%2C\+MB\+R7N\+0K9/);
});

test("coordinates are the last resort and a city centroid is never the destination", () => {
  const coordsOnly = directionsUrl(53.54, -113.49, "Kids World", { apple: false });
  assert.match(coordsOnly, /destination=53\.54%2C-113\.49/);
  assert.doesNotMatch(coordsOnly, /Kids\+World/);

  const centroidOnly = directionsUrl(WINNIPEG_CENTROID.lat, WINNIPEG_CENTROID.lng, "Little Oaks Daycare", {
    apple: false,
  });
  assert.match(centroidOnly, /destination=Little\+Oaks\+Daycare&/);
  assert.doesNotMatch(centroidOnly, /49\.8951%2C-97\.1384/);

  const nothing = directionsUrl(WINNIPEG_CENTROID.lat, WINNIPEG_CENTROID.lng, "", { apple: false });
  assert.equal(nothing, "https://www.google.com/maps");
});

test("search map opens one listing popup from a KidEase logo pin", () => {
  assert.match(mapView, /ke-logo-pin/);
  assert.match(mapView, /data-ke="map-selected-card"/);
  assert.match(mapView, /data-ke="map-pin-directions"/);
  assert.match(mapView, /data-ke="map-pin-popup-close"/);
  assert.match(mapView, /t\("getDirections"\)/);
  assert.match(mapView, /openDirections\(/);
  assert.match(mapView, /address:\s*item\.address/);
  assert.match(mapView, /postalCode:\s*item\.postalCode/);
  const slim = daycares.slice(daycares.indexOf("function slimCard"), daycares.indexOf("function alignedSearchInput"));
  assert.match(slim, /description:\s*""/);
  assert.match(slim, /phone:\s*null/);
  assert.doesNotMatch(slim, /address:\s*""/);
  assert.match(listingPage, /address:\s*d\.address/);
  assert.match(listingPage, /openDirections\(d\.lat,\s*d\.lng,\s*name,\s*directionsPlace\)/);
  assert.match(share, /address,\s*city,\s*province,\s*postalCode/);
  assert.match(mapView, /addListener\(map, "click"/);
  assert.match(mapView, /publicApprovalEligible/);
  assert.doesNotMatch(mapView, /TrustSignals/);
  assert.doesNotMatch(mapView, /feeBadgeKey/);
  assert.match(mapView, /mapPinThumb/);
  assert.match(mapView, /data-ke="map-pin-photo"/);
  assert.match(mapView, /sizes="64px"/);
  assert.doesNotMatch(mapView, /storefront-placeholder/);
  assert.doesNotMatch(mapView, /sizes="112px"/);
});
