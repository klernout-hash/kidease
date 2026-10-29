import assert from "node:assert/strict";
import { test } from "node:test";
import { MapBounds, circleRing } from "../src/lib/osm-map.ts";
import {
  CANADA_BBOX,
  decodePhotonPlaceId,
  encodePhotonPlaceId,
  photonSearchUrl,
  photonSuggestions,
  photonToPlace,
  photonWaitMs,
} from "../src/lib/photon.ts";

test("a search circle stays near its centre and closes", () => {
  const ring = circleRing({ lat: 49.895, lng: -97.138 }, 5000, 16);
  assert.equal(ring.length, 17);
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  for (const [lng, lat] of ring) {
    assert.ok(Math.abs(lat - 49.895) < 0.08);
    assert.ok(Math.abs(lng + 97.138) < 0.12);
  }
});

test("bounds extend and report north-east and south-west", () => {
  const box = new MapBounds({ lat: 49, lng: -98 }, { lat: 50, lng: -96 });
  assert.equal(box.isEmpty(), false);
  box.extend({ lat: 51, lng: -95 });
  assert.equal(box.getNorthEast().lat(), 51);
  assert.equal(box.getNorthEast().lng(), -95);
  assert.equal(box.getSouthWest().lat(), 49);
  assert.equal(box.getSouthWest().lng(), -98);
  assert.equal(new MapBounds().isEmpty(), true);
});

test("Photon urls stay in Canada and place ids round-trip", () => {
  const url = photonSearchUrl("123 Main Street Winnipeg", { lat: 49.9, lng: -97.1 }, 5);
  assert.match(url, /photon\.komoot\.io\/api\//);
  assert.match(url, /bbox=-141\.0/);
  assert.equal(CANADA_BBOX.startsWith("-141"), true);
  const place = { lat: 49.88895, lng: -97.13427, label: "123 Main Street, Winnipeg, Manitoba" };
  const id = encodePhotonPlaceId(place);
  const back = decodePhotonPlaceId(id);
  assert.equal(back.label, place.label);
  assert.ok(Math.abs(back.lat - place.lat) < 0.00002);
  assert.ok(Math.abs(back.lng - place.lng) < 0.00002);
  assert.equal(decodePhotonPlaceId("ChIJnot-photon"), null);
  assert.equal(photonWaitMs(0, 1_000), 0);
  assert.equal(photonWaitMs(1_000, 1_500, 1100), 600);
});

test("Photon suggestions keep Canadian cities and skip other countries", () => {
  const rows = photonSuggestions([
    {
      geometry: { coordinates: [-97.14, 49.9] },
      properties: { name: "Winnipeg", state: "Manitoba", countrycode: "CA", type: "city" },
    },
    {
      geometry: { coordinates: [-93.26, 44.98] },
      properties: { name: "Minneapolis", state: "Minnesota", countrycode: "US", type: "city" },
    },
  ]);
  assert.equal(rows.length, 1);
  assert.match(rows[0].label, /Winnipeg/);
  assert.match(rows[0].placeId, /^photon:/);
  assert.equal(
    photonToPlace(
      {
        geometry: { coordinates: [-97.13, 49.89] },
        properties: { housenumber: "123", street: "Main Street", city: "Winnipeg", state: "Manitoba", countrycode: "CA" },
      },
      "query",
    ).label,
    "123 Main Street, Winnipeg, Manitoba",
  );
});
