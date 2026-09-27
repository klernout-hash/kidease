import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { WINNIPEG } from "../src/lib/geo.ts";
import {
  cardAwayLabel,
  cityMislabeledOnCentroid,
  doorDistanceKm,
  includeCardInRadius,
  isDoorPin,
} from "../src/lib/card-distance.ts";
import { VERIFIED_BUILDING_PHOTOS } from "../src/lib/data/verified-building-photos.ts";
import {
  isRequestableListingPhoto,
  isVerifiedBuildingPhoto,
  listingThumb,
} from "../src/lib/listing-photo.ts";
import { optimizePhoto } from "../src/lib/server/optimize-photo.ts";
import { buildContentSecurityPolicy } from "./csp.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("featured distance uses a door pin and hides a missing reference", () => {
  const beach = { lat: 49.895136, lng: -97.138374, city: "Winnipeg Beach" };
  assert.equal(isDoorPin(beach.lat, beach.lng), false);
  assert.equal(cityMislabeledOnCentroid(beach.city, beach.lat, beach.lng), true);
  assert.equal(includeCardInRadius(beach, WINNIPEG, 25), false);
  assert.equal(
    cardAwayLabel({
      origin: WINNIPEG,
      lat: beach.lat,
      lng: beach.lng,
      referenceKnown: true,
      awayLabel: "km away",
    }),
    "",
  );
  assert.equal(
    cardAwayLabel({
      origin: WINNIPEG,
      lat: 49.89,
      lng: -97.14,
      referenceKnown: false,
      awayLabel: "km away",
    }),
    "",
  );
  assert.equal(
    cardAwayLabel({
      origin: { lat: 0, lng: 0 },
      lat: 49.89,
      lng: -97.14,
      referenceKnown: true,
      awayLabel: "km away",
    }),
    "",
  );

  const door = { lat: 49.818503, lng: -97.186041, city: "Winnipeg" };
  assert.equal(isDoorPin(door.lat, door.lng), true);
  assert.equal(includeCardInRadius(door, WINNIPEG, 25), true);
  const km = doorDistanceKm(WINNIPEG, door);
  assert.ok(km != null && km > 1);
  const label = cardAwayLabel({
    origin: WINNIPEG,
    lat: door.lat,
    lng: door.lng,
    referenceKnown: true,
    awayLabel: "km away",
  });
  assert.match(label, /^\d+(\.\d)? km away$/);
  assert.notEqual(label, "0 km away");

  const sameCityCentroid = { lat: 49.895136, lng: -97.138374, city: "Winnipeg" };
  assert.equal(cityMislabeledOnCentroid("Winnipeg", sameCityCentroid.lat, sameCityCentroid.lng), false);
  assert.equal(includeCardInRadius(sameCityCentroid, WINNIPEG, 25), true);
  assert.equal(doorDistanceKm(WINNIPEG, sameCityCentroid), null);
});

test("Promote hint matches the catalogue name", () => {
  const copy = readFileSync(join(root, "src/lib/copy.ts"), "utf8");
  const nav = readFileSync(join(root, "src/lib/desk-nav.ts"), "utf8");
  assert.match(copy, /deskNavPromoteHint: "Promote & add-ons"/);
  assert.match(copy, /deskNavPromoteHint: "Promotion et ajouts"/);
  assert.match(nav, /hint: "Promote & add-ons", labelKey: "deskNavPromote"/);
  assert.doesNotMatch(nav, /hint: "Priority placement"/);
});

test("Maps font hosts are the only CSP additions", () => {
  const csp = buildContentSecurityPolicy("abc+123/XYZ=");
  assert.match(csp, /style-src [^;]*https:\/\/fonts\.googleapis\.com/);
  assert.match(csp, /font-src 'self' data: https:\/\/fonts\.gstatic\.com/);
  assert.doesNotMatch(csp, /style-src[^;]*https:\/\/fonts\.gstatic\.com/);
  assert.doesNotMatch(csp, /font-src[^;]*https:\/\/fonts\.googleapis\.com/);
  assert.doesNotMatch(csp, /(?:^|; )style-src [^;]*\*/);
  assert.doesNotMatch(csp, /(?:^|; )font-src [^;]*\*/);
});

test("nearby cards do not request building photos that are not on file", () => {
  const manifest = VERIFIED_BUILDING_PHOTOS;
  const onDisk = readdirSync(join(root, "public/photos/buildings"))
    .filter((name) => /\.(jpe?g|png|webp|avif)$/i.test(name))
    .map((name) => `/photos/buildings/${name}`)
    .sort();
  assert.deepEqual([...manifest].sort(), onDisk);
  for (const path of manifest) assert.equal(existsSync(join(root, "public", path.slice(1))), true);
  assert.equal(manifest.includes("/photos/buildings/mb-100801.jpg"), false);
  assert.equal(isVerifiedBuildingPhoto("/photos/buildings/mb-100801.jpg"), false);
  assert.equal(isRequestableListingPhoto("/photos/buildings/mb-100801.jpg"), false);
  assert.equal(isVerifiedBuildingPhoto("/photos/buildings/mb-1052.jpg"), true);
  assert.equal(isRequestableListingPhoto("/photos/buildings/mb-1052.jpg"), true);
  const carousel = readFileSync(join(root, "src/components/photo-carousel.tsx"), "utf8");
  const photo = readFileSync(join(root, "src/components/building-photo.tsx"), "utf8");
  assert.match(carousel, /isRequestableListingPhoto/);
  assert.match(photo, /isRequestableListingPhoto/);
  assert.equal(
    listingThumb(["/photos/wpg/1052.jpg", "/photos/buildings/mb-1052.jpg"]),
    "/photos/buildings/mb-1052.jpg",
  );
});

test("/img signals a missing original without a 404 body", async () => {
  const res = await optimizePhoto(
    new Request("http://127.0.0.1:9/img?src=%2Fphotos%2Fbuildings%2Fmb-100801.jpg&w=480", {
      headers: { accept: "image/webp" },
    }),
  );
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("x-kidease-photo"), "missing");
  assert.equal(await res.text(), "");
});
