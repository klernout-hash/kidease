import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LISTING_PLACEHOLDER,
  listingPhotosFor,
  resolveListingStorefront,
} from "../src/lib/listing-photo.ts";
import {
  R2_PUBLIC_DEV_ORIGIN,
  R2_PUBLIC_MEDIA_ORIGIN,
  normalizeR2PublicBase,
  photoSrcSet,
  photoUrl,
  publicPhotoUrl,
  r2PublicBaseUrl,
} from "../src/lib/photo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const official = JSON.parse(readFileSync(join(root, "src/lib/data/real-storefronts.json"), "utf8"));
const wpg = JSON.parse(readFileSync(join(root, "src/lib/data/storefronts.json"), "utf8"));

const PUBLIC = {
  R2_PUBLIC_BASE_URL: R2_PUBLIC_MEDIA_ORIGIN,
};
const VITE_PUBLIC = {
  VITE_R2_PUBLIC_BASE_URL: `${R2_PUBLIC_MEDIA_ORIGIN}/`,
};
const DEV_PUBLIC = {
  R2_PUBLIC_BASE_URL: R2_PUBLIC_DEV_ORIGIN,
};

describe("public R2 photo URL helper", () => {
  it("keeps same-origin /photos paths when the public base is unset", () => {
    assert.equal(r2PublicBaseUrl({}), "");
    assert.equal(r2PublicBaseUrl({ R2_PUBLIC_BASE_URL: "" }), "");
    assert.equal(publicPhotoUrl("/photos/wpg/1001.jpg", {}), "/photos/wpg/1001.jpg");
    assert.equal(publicPhotoUrl("/photos/buildings/mb-1001.jpg", {}), "/photos/buildings/mb-1001.jpg");
    assert.equal(
      photoUrl("/photos/wpg/1001.jpg", 480, {}),
      "/img?src=%2Fphotos%2Fwpg%2F1001.jpg&w=480",
    );
    assert.match(photoSrcSet("/photos/wpg/1001.jpg", [320, 480], {}), /\/img\?src=/);
  });

  it("prefixes /photos paths when R2_PUBLIC_BASE_URL or VITE_R2_PUBLIC_BASE_URL is set", () => {
    assert.equal(R2_PUBLIC_MEDIA_ORIGIN, "https://media.kidease.ca");
    assert.equal(r2PublicBaseUrl(PUBLIC), R2_PUBLIC_MEDIA_ORIGIN);
    assert.equal(r2PublicBaseUrl(VITE_PUBLIC), R2_PUBLIC_MEDIA_ORIGIN);
    assert.equal(r2PublicBaseUrl(DEV_PUBLIC), R2_PUBLIC_DEV_ORIGIN);
    assert.equal(
      publicPhotoUrl("/photos/buildings/mb-1001.jpg", PUBLIC),
      `${R2_PUBLIC_MEDIA_ORIGIN}/photos/buildings/mb-1001.jpg`,
    );
    assert.equal(
      publicPhotoUrl("/photos/wpg/1001.jpg", VITE_PUBLIC),
      `${R2_PUBLIC_MEDIA_ORIGIN}/photos/wpg/1001.jpg`,
    );
    assert.equal(
      publicPhotoUrl("/photos/wpg/1001.jpg", DEV_PUBLIC),
      `${R2_PUBLIC_DEV_ORIGIN}/photos/wpg/1001.jpg`,
    );
    assert.equal(
      photoUrl("/photos/buildings/mb-1001.jpg", 768, PUBLIC),
      `${R2_PUBLIC_MEDIA_ORIGIN}/photos/buildings/mb-1001.jpg`,
    );
    assert.equal(photoSrcSet("/photos/wpg/1001.jpg", [320, 480], PUBLIC), undefined);
  });

  it("does not invent or remap listing id→path assignments", () => {
    assert.equal(official["mb-1001"], "/photos/buildings/mb-1001.jpg");
    assert.equal(wpg["mb-1001"], "/photos/wpg/1001.jpg");
    assert.equal(resolveListingStorefront("mb-1001", official, wpg), "/photos/buildings/mb-1001.jpg");
    assert.equal(listingPhotosFor("mb-1001", ["/photos/wpg/1001.jpg"], official, wpg)[0], "/photos/buildings/mb-1001.jpg");
    assert.equal(resolveListingStorefront("mb-100034", official, wpg), "/photos/wpg/100034.jpg");
    const mapped = listingPhotosFor("mb-1001", [], official, wpg)[0];
    assert.equal(mapped, "/photos/buildings/mb-1001.jpg");
    assert.equal(publicPhotoUrl(mapped, PUBLIC), `${R2_PUBLIC_MEDIA_ORIGIN}/photos/buildings/mb-1001.jpg`);
    assert.deepEqual(listingPhotosFor("mb-unknown", [], official, {}), [LISTING_PLACEHOLDER]);
  });

  it("rejects non-https, random domains, other kidease hosts, and S3 API hosts", () => {
    assert.equal(normalizeR2PublicBase("https://media.kidease.ca"), R2_PUBLIC_MEDIA_ORIGIN);
    assert.equal(normalizeR2PublicBase("https://media.kidease.ca/"), R2_PUBLIC_MEDIA_ORIGIN);
    assert.equal(normalizeR2PublicBase(R2_PUBLIC_DEV_ORIGIN), R2_PUBLIC_DEV_ORIGIN);
    assert.equal(normalizeR2PublicBase("http://media.kidease.ca"), "");
    assert.equal(normalizeR2PublicBase("http://pub-x.r2.dev"), "");
    assert.equal(normalizeR2PublicBase("https://evil.example/photos"), "");
    assert.equal(normalizeR2PublicBase("https://www.kidease.ca"), "");
    assert.equal(normalizeR2PublicBase("https://kidease.ca"), "");
    assert.equal(normalizeR2PublicBase("https://cdn.kidease.ca"), "");
    assert.equal(normalizeR2PublicBase("https://acct.r2.cloudflarestorage.com"), "");
    assert.equal(normalizeR2PublicBase("https://user:pass@media.kidease.ca"), "");
    assert.equal(normalizeR2PublicBase("https://media.kidease.ca/photos"), "");
    assert.equal(normalizeR2PublicBase("https://r2.dev"), "");
    assert.equal(publicPhotoUrl("/photos/wpg/1001.jpg", { R2_PUBLIC_BASE_URL: "https://evil.example" }), "/photos/wpg/1001.jpg");
    assert.equal(publicPhotoUrl("https://cdn.example/x.jpg", PUBLIC), "https://cdn.example/x.jpg");
    assert.equal(publicPhotoUrl("/photos/../etc/passwd", PUBLIC), "/photos/../etc/passwd");
  });
});
