import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  MAX_INTERIOR_PHOTOS,
  applyInteriorPhotos,
  classifyListingPhotos,
  listingPhotosFor,
  splitPhotoList,
} from "../src/lib/listing-photo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("updateListing persists interiors through applyInteriorPhotos, not a raw append", () => {
  const claims = src("src/lib/server/claims.ts");
  assert.match(claims, /applyInteriorPhotos\(photos, data\.interiors\)/);
  assert.doesNotMatch(claims, /photos = \[\.\.\.cur, \.\.\.extras\]\.join/);
});

test("provider listing form and public listing expose interiors", () => {
  const forms = src("src/components/provider-listing-forms.tsx");
  const detail = src("src/routes/daycare.$slug.tsx");
  const copy = src("src/lib/copy.ts");
  assert.match(forms, /t\("interiors"\)/);
  assert.match(forms, /t\("interiorCta"\)/);
  assert.match(forms, /into: "storefront" \| "interiors" \| "license"/);
  assert.match(detail, /classifyListingPhotos/);
  assert.match(detail, /t\("interiors"\)/);
  assert.match(copy, /interiorCta: "Add interior photo"/);
  assert.match(copy, /interiorCta: "Ajouter une photo intérieure"/);
  assert.match(copy, /interiors: "Interior photos"/);
  assert.match(copy, /interiors: "Photos intérieures"/);
});

test("empty interiors on a fee save do not wipe existing rooms", () => {
  const play = "data:image/jpeg;base64,cGxheQ==";
  const current = `/photos/buildings/mb-1.jpg,${play},/photos/wpg/1-logo.png`;
  assert.equal(applyInteriorPhotos(current, []), current);
  assert.equal(applyInteriorPhotos(current, undefined), current);
  const again = applyInteriorPhotos(current, [play]);
  assert.equal(again, current);
});

test("photo CSV split keeps data-URL interiors intact", () => {
  const play = "data:image/jpeg;base64,cGxheQ==";
  const yard = "data:image/jpeg;base64,eWFyZA==";
  assert.deepEqual(splitPhotoList(`/photos/buildings/mb-1.jpg,${play},${yard},/photos/wpg/1-logo.png`), [
    "/photos/buildings/mb-1.jpg",
    play,
    yard,
    "/photos/wpg/1-logo.png",
  ]);
  assert.match(src("src/lib/server/map-row.ts"), /splitPhotoList\(r\.photos\)/);
  assert.match(src("src/lib/server/catalog-neon.ts"), /splitPhotoList\(row\.photos\)/);
});

test("catalogue hydrate keeps storefront honesty when no interiors exist", () => {
  const official = { "mb-1052": "/photos/buildings/mb-1052.jpg" };
  const wpg = { "mb-1052": "/photos/wpg/1052.jpg" };
  assert.deepEqual(listingPhotosFor("mb-1052", ["/photos/wpg/1052.jpg", "/photos/wpg/1052-logo.png"], official, wpg), [
    "/photos/buildings/mb-1052.jpg",
    "/photos/wpg/1052-logo.png",
  ]);
  assert.equal(classifyListingPhotos(["/photos/community.jpg", "/photos/playroom.jpg"]).interiors.length, 0);
  assert.equal(MAX_INTERIOR_PHOTOS, 5);
});
