import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LISTING_PLACEHOLDER,
  STOCK_CREATE_PHOTOS,
  applyStorefrontPhoto,
  isOfficialBuildingPhoto,
  isStockListingPhoto,
  listingPhotosFor,
  listingThumb,
  resolveListingStorefront,
} from "../src/lib/listing-photo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("listing photos prefer official buildings over /photos/wpg/", () => {
  const official = JSON.parse(readFileSync(join(root, "src/lib/data/real-storefronts.json"), "utf8"));
  const wpg = JSON.parse(readFileSync(join(root, "src/lib/data/storefronts.json"), "utf8"));
  const catalog = readFileSync(join(root, "src/lib/catalog.ts"), "utf8");

  it("maps all official Winnipeg IDs in real-storefronts.json", () => {
    const ids = Object.keys(official);
    assert.ok(ids.length >= 50);
    for (const id of ids) {
      assert.match(String(official[id]), /^\/photos\/buildings\//);
    }
    for (const id of ["mb-1052", "mb-1054", "mb-1206", "mb-1012"]) {
      assert.equal(official[id], `/photos/buildings/${id}.jpg`);
    }
  });

  it("does not gate official photos on a hardcoded BUILDING_ON_DISK allowlist", () => {
    assert.doesNotMatch(catalog, /BUILDING_ON_DISK/);
    assert.match(catalog, /listingPhotosFor/);
  });

  it("uses real-storefronts even when a /photos/wpg/ path exists", () => {
    const id = "mb-1052";
    assert.ok(wpg[id], "fixture expects a wpg fallback for this id");
    assert.equal(resolveListingStorefront(id, official, wpg), `/photos/buildings/${id}.jpg`);
    assert.equal(listingPhotosFor(id, ["/photos/wpg/1052.jpg", "/photos/wpg/1052-logo.png"], official, wpg)[0], `/photos/buildings/${id}.jpg`);
  });

  it("keeps /photos/wpg/ or placeholder for unmapped centres", () => {
    assert.equal(resolveListingStorefront("mb-100034", official, wpg), "/photos/wpg/100034.jpg");
    assert.equal(resolveListingStorefront("mb-unknown", official, {}), LISTING_PLACEHOLDER);
  });

  it("listingThumb prefers /photos/buildings/ over wpg and logos", () => {
    assert.equal(
      listingThumb(["/photos/wpg/1052.jpg", "/photos/buildings/mb-1052.jpg", "/photos/wpg/1052-logo.png"]),
      "/photos/buildings/mb-1052.jpg",
    );
    assert.equal(listingThumb(["/photos/wpg/1052-logo.png"]), LISTING_PLACEHOLDER);
    assert.ok(isOfficialBuildingPhoto("/photos/buildings/mb-1206.jpg"));
    assert.equal(isOfficialBuildingPhoto("/photos/wpg/1206.jpg"), false);
  });

  it("applyStorefrontPhoto prepends a real photo and drops stock placeholders", () => {
    const uploaded = "data:image/jpeg;base64,abc";
    assert.equal(applyStorefrontPhoto(STOCK_CREATE_PHOTOS), STOCK_CREATE_PHOTOS);
    assert.equal(applyStorefrontPhoto(STOCK_CREATE_PHOTOS, ""), STOCK_CREATE_PHOTOS);
    assert.equal(applyStorefrontPhoto(STOCK_CREATE_PHOTOS, uploaded), uploaded);
    assert.equal(
      applyStorefrontPhoto("/photos/community.jpg,/photos/playroom.jpg,/photos/buildings/mb-1.jpg", uploaded),
      `${uploaded},/photos/buildings/mb-1.jpg`,
    );
    assert.equal(isStockListingPhoto("/photos/community.jpg"), true);
    assert.equal(isStockListingPhoto("/photos/storefront-placeholder-480.webp"), true);
    assert.equal(isStockListingPhoto("/photos/buildings/mb-1.jpg"), false);
  });

  it("DaycareCard and catalog both call listingThumb / listingPhotosFor", () => {
    const card = readFileSync(join(root, "src/components/daycare-card.tsx"), "utf8");
    const catalog = readFileSync(join(root, "src/lib/catalog.ts"), "utf8");
    const map = readFileSync(join(root, "src/components/map-view.tsx"), "utf8");
    assert.match(card, /PhotoCarousel/);
    assert.match(catalog, /listingPhotosFor/);
    assert.match(map, /listingThumb/);
  });
});

describe("official building JPEGs on disk", () => {
  const official = JSON.parse(readFileSync(join(root, "src/lib/data/real-storefronts.json"), "utf8"));
  const dir = join(root, "public/photos/buildings");
  const files = new Set(readdirSync(dir).filter((n) => n.endsWith(".jpg")).map((n) => n.replace(/\.jpg$/, "")));

  it("every building JPEG is a mapped Winnipeg id", () => {
    for (const id of files) {
      assert.equal(official[id], `/photos/buildings/${id}.jpg`);
      assert.ok(existsSync(join(dir, `${id}.jpg`)));
    }
  });

  it("includes Drive batch files for 1052, 1054, 1057, 1061, 1206, 1214", () => {
    for (const id of ["mb-1052", "mb-1054", "mb-1057", "mb-1061", "mb-1206", "mb-1214"]) {
      assert.ok(files.has(id), `missing ${id}.jpg`);
    }
  });

  it("includes documented operator-source files for 1012, 1013, 1017, 1074, 1147", () => {
    for (const id of ["mb-1012", "mb-1013", "mb-1017", "mb-1074", "mb-1147"]) {
      assert.ok(files.has(id), `missing ${id}.jpg`);
    }
  });
});
