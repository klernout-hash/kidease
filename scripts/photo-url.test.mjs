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
  CARD_WIDTHS,
  CF_IMAGE_TRANSFORM_OPTS,
  HERO_WIDTHS,
  R2_PUBLIC_DEV_ORIGIN,
  R2_PUBLIC_MEDIA_ORIGIN,
  canCfTransformBase,
  cfImageResizeEnabled,
  cfImageTransformUrl,
  isCfImageTransformUrl,
  normalizeR2PublicBase,
  photoSrcSet,
  photoUrl,
  publicPhotoUrl,
  r2PublicBaseUrl,
  srcsetWidthsFor,
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

const RESIZE = {
  R2_PUBLIC_BASE_URL: R2_PUBLIC_MEDIA_ORIGIN,
  CF_IMAGE_RESIZE: "1",
};
const RESIZE_VITE = {
  VITE_R2_PUBLIC_BASE_URL: R2_PUBLIC_MEDIA_ORIGIN,
  VITE_CF_IMAGE_RESIZE: "1",
};
const RESIZE_DEV = {
  R2_PUBLIC_BASE_URL: R2_PUBLIC_DEV_ORIGIN,
  CF_IMAGE_RESIZE: "1",
};

describe("Cloudflare Image Transformations on media.kidease.ca", () => {
  it("defaults off and keeps the original R2 URL when the flag is unset", () => {
    assert.equal(cfImageResizeEnabled({}), false);
    assert.equal(cfImageResizeEnabled({ CF_IMAGE_RESIZE: "" }), false);
    assert.equal(cfImageResizeEnabled({ CF_IMAGE_RESIZE: "0" }), false);
    assert.equal(cfImageResizeEnabled({ CF_IMAGE_RESIZE: "false" }), false);
    assert.equal(
      photoUrl("/photos/buildings/mb-1001.jpg", 768, PUBLIC),
      `${R2_PUBLIC_MEDIA_ORIGIN}/photos/buildings/mb-1001.jpg`,
    );
    assert.equal(photoSrcSet("/photos/wpg/1001.jpg", [320, 480], PUBLIC), undefined);
    assert.equal(
      publicPhotoUrl("/photos/buildings/mb-1001.jpg", RESIZE),
      `${R2_PUBLIC_MEDIA_ORIGIN}/photos/buildings/mb-1001.jpg`,
    );
  });

  it("wraps catalogue /photos paths on media.kidease.ca when the flag is on", () => {
    assert.equal(cfImageResizeEnabled(RESIZE), true);
    assert.equal(cfImageResizeEnabled(RESIZE_VITE), true);
    assert.equal(canCfTransformBase(R2_PUBLIC_MEDIA_ORIGIN), true);
    assert.equal(canCfTransformBase(R2_PUBLIC_DEV_ORIGIN), false);
    const card = photoUrl("/photos/buildings/mb-1001.jpg", 400, RESIZE);
    assert.equal(
      card,
      `${R2_PUBLIC_MEDIA_ORIGIN}/cdn-cgi/image/width=480,${CF_IMAGE_TRANSFORM_OPTS}/photos/buildings/mb-1001.jpg`,
    );
    assert.equal(isCfImageTransformUrl(card), true);
    assert.equal(
      photoUrl("/photos/wpg/1001.jpg", 768, RESIZE_VITE),
      `${R2_PUBLIC_MEDIA_ORIGIN}/cdn-cgi/image/width=768,${CF_IMAGE_TRANSFORM_OPTS}/photos/wpg/1001.jpg`,
    );
    const set = photoSrcSet("/photos/wpg/1001.jpg", CARD_WIDTHS, RESIZE);
    assert.match(set ?? "", /cdn-cgi\/image\/width=320/);
    assert.match(set ?? "", /cdn-cgi\/image\/width=480/);
    assert.match(set ?? "", / 320w/);
    assert.doesNotMatch(set ?? "", /\/img\?src=/);
  });

  it("does not transform r2.dev, placeholders, or remapped ids", () => {
    assert.equal(
      photoUrl("/photos/wpg/1001.jpg", 480, RESIZE_DEV),
      `${R2_PUBLIC_DEV_ORIGIN}/photos/wpg/1001.jpg`,
    );
    assert.equal(photoSrcSet("/photos/wpg/1001.jpg", [320], RESIZE_DEV), undefined);
    assert.equal(
      photoUrl("/photos/storefront-placeholder-480.webp", 480, RESIZE),
      `${R2_PUBLIC_MEDIA_ORIGIN}/photos/storefront-placeholder-480.webp`,
    );
    assert.equal(
      photoUrl("/photos/buildings/mb-1001.jpg", 480, { CF_IMAGE_RESIZE: "1" }),
      "/img?src=%2Fphotos%2Fbuildings%2Fmb-1001.jpg&w=480",
    );
    assert.equal(listingPhotosFor("mb-1001", [], official, wpg)[0], "/photos/buildings/mb-1001.jpg");
    assert.equal(srcsetWidthsFor(480), CARD_WIDTHS);
    assert.equal(srcsetWidthsFor(768), HERO_WIDTHS);
    assert.equal(
      cfImageTransformUrl("/photos/buildings/mb-1001.jpg", 160, R2_PUBLIC_MEDIA_ORIGIN),
      `${R2_PUBLIC_MEDIA_ORIGIN}/cdn-cgi/image/width=320,${CF_IMAGE_TRANSFORM_OPTS}/photos/buildings/mb-1001.jpg`,
    );
  });
});
