import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { isMissingCatalogueBuilding } from "../src/lib/catalogue-buildings.ts";
import { LISTING_PLACEHOLDER, listingThumb, mapPinThumb } from "../src/lib/listing-photo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(path) {
  return readFileSync(join(root, path), "utf8");
}

test("catalogue building manifest matches files on disk", () => {
  const listed = JSON.parse(readFileSync(join(root, "src/lib/data/catalogue-building-files.json"), "utf8"));
  const onDisk = readdirSync(join(root, "public/photos/buildings"))
    .filter((name) => name.endsWith(".jpg"))
    .map((name) => `/photos/buildings/${name}`)
    .sort();
  assert.deepEqual(listed, onDisk);
});

test("a mapped building with no file is not a paintable photo", () => {
  assert.equal(isMissingCatalogueBuilding("/photos/buildings/mb-100902.jpg"), true);
  assert.equal(isMissingCatalogueBuilding("/photos/buildings/mb-100902.jpg?v=1"), true);
  assert.equal(isMissingCatalogueBuilding("/photos/buildings/mb-1052.jpg"), false);
  assert.equal(isMissingCatalogueBuilding("/photos/buildings/mb-1.jpg"), false);
  assert.equal(isMissingCatalogueBuilding("/photos/wpg/1201.jpg"), false);
  assert.equal(isMissingCatalogueBuilding("data:image/jpeg;base64,abc"), false);
  assert.equal(
    listingThumb(["/photos/buildings/mb-100902.jpg", "/photos/wpg/100902-logo.jpg"]),
    LISTING_PLACEHOLDER,
  );
  assert.equal(listingThumb(["/photos/wpg/1052.jpg", "/photos/buildings/mb-1052.jpg"]), "/photos/buildings/mb-1052.jpg");
  assert.equal(mapPinThumb(["/photos/buildings/mb-100902.jpg"]), "");
});

test("empty listing photos use the theme wash, not a light-only fill", () => {
  const photo = src("src/components/building-photo.tsx");
  const card = src("src/components/daycare-card.tsx");
  const carousel = src("src/components/photo-carousel.tsx");
  const rail = src("src/components/listing-carousel.tsx");
  const css = src("src/styles.css");

  assert.match(photo, /isMissingCatalogueBuilding/);
  assert.match(photo, /function photoNeedsFallback/);
  assert.match(photo, /ke-unclaimed-wash/);
  assert.match(photo, /data-placeholder=\{quiet \? "loading" : "theme"\}/);
  assert.doesNotMatch(photo, /bg-\[#F7F4EF\]/);
  assert.doesNotMatch(photo, /M8 22 24 10/);
  assert.doesNotMatch(card, /bg-\[#EBEBEB\]/);
  assert.match(carousel, /isMissingCatalogueBuilding/);
  assert.doesNotMatch(rail, /bg-\[#F0EDE8\]/);
  assert.match(rail, /bg-surface-2/);
  assert.match(css, /html\[data-theme="dark"\] \.ke-unclaimed-wash/);
  assert.match(css, /html\[data-resolved-theme="dark"\] \.ke-unclaimed-wash/);
  assert.match(css, /html\[data-theme="dark"\] \.ke-unclaimed-mark/);
});
