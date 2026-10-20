import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  UNMEASURED_DISTANCE_KM,
  cardSortKm,
  cityMislabeledOnCentroid,
  doorDistanceKm,
  includeCardInRadius,
  isDoorPin,
} from "../src/lib/card-distance.ts";
import { parentDistanceLabel } from "../src/lib/distance-label.ts";
import { WINNIPEG } from "../src/lib/geo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("featured distance uses a door pin and hides a city-centre stand-in", () => {
  const beach = { lat: 49.895136, lng: -97.138374, city: "Winnipeg Beach" };
  assert.equal(isDoorPin(beach.lat, beach.lng), false);
  assert.equal(cityMislabeledOnCentroid(beach.city, beach.lat, beach.lng), true);
  assert.equal(includeCardInRadius(beach, WINNIPEG, 25), false);
  assert.equal(doorDistanceKm(WINNIPEG, beach), null);
  assert.equal(cardSortKm(WINNIPEG, beach), UNMEASURED_DISTANCE_KM);
  assert.equal(parentDistanceLabel({ km: doorDistanceKm(WINNIPEG, beach), away: "km away", show: true }), "");

  const door = { lat: 49.818503, lng: -97.186041, city: "Winnipeg" };
  assert.equal(isDoorPin(door.lat, door.lng), true);
  assert.equal(includeCardInRadius(door, WINNIPEG, 25), true);
  const km = doorDistanceKm(WINNIPEG, door);
  assert.ok(km != null && km > 1);
  assert.notEqual(parentDistanceLabel({ km, away: "km away", show: true }), "0 km away");
  assert.match(parentDistanceLabel({ km, away: "km away", show: true }), /^\d+(\.\d)? km away$/);
  assert.ok(cardSortKm(WINNIPEG, door) < cardSortKm(WINNIPEG, beach));

  const sameCityCentroid = { lat: 49.8951, lng: -97.1384, city: "Winnipeg" };
  assert.equal(cityMislabeledOnCentroid("Winnipeg", sameCityCentroid.lat, sameCityCentroid.lng), false);
  assert.equal(includeCardInRadius(sameCityCentroid, WINNIPEG, 25), true);
  assert.equal(doorDistanceKm(WINNIPEG, sameCityCentroid), null);
  assert.equal(
    parentDistanceLabel({ km: doorDistanceKm(WINNIPEG, sameCityCentroid), away: "km away", show: true }),
    "",
  );

  const neighbourhood = { lat: 49.8114, lng: -97.162, city: "Winnipeg" };
  assert.equal(isDoorPin(neighbourhood.lat, neighbourhood.lng), false);
  assert.equal(cityMislabeledOnCentroid("Winnipeg", neighbourhood.lat, neighbourhood.lng), false);
  assert.equal(includeCardInRadius(neighbourhood, WINNIPEG, 25), true);
});

test("card and map copy only measure a door pin", () => {
  const card = readFileSync(join(root, "src/components/daycare-card.tsx"), "utf8");
  const map = readFileSync(join(root, "src/components/map-view.tsx"), "utf8");
  const search = readFileSync(join(root, "src/lib/server/daycares.ts"), "utf8");
  assert.match(card, /isDoorPin\(item\.lat, item\.lng\)/);
  assert.match(map, /isDoorPin\(item\.lat, item\.lng\)/);
  assert.match(map, /UNMEASURED_DISTANCE_KM/);
  assert.match(search, /cardSortKm\(origin/);
  assert.match(search, /includeCardInRadius\(card, origin, radius\)/);
});
