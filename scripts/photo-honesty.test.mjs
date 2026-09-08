import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { collectUnflaggedSharedFallbacks } from "./photo-honesty.mjs";
import {
  INTENTIONAL_SHARED_PHOTO_SHA256,
  UNFLAGGED_SHARED_FALLBACK_SHA256,
  UNFLAGGED_SHARED_FALLBACK_SRCS,
  isExplicitSharedPlaceholder,
  isUnflaggedSharedFallbackSrc,
  listingStemFromSrc,
  shouldReplaceWithPerListingPlaceholder,
} from "../src/lib/photo-honesty.ts";
import {
  LISTING_PLACEHOLDER,
  honestListingSrc,
  listingPhotosFor,
  listingThumb,
  resolveListingStorefront,
} from "../src/lib/listing-photo.ts";
import { photoSrcSet, photoUrl } from "../src/lib/photo.ts";
import { optimizePhoto } from "../src/lib/server/optimize-photo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const official = JSON.parse(readFileSync(join(root, "src/lib/data/real-storefronts.json"), "utf8"));
const wpg = JSON.parse(readFileSync(join(root, "src/lib/data/storefronts.json"), "utf8"));

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

describe("unflagged shared listing photos stay in sync with disk", () => {
  const live = collectUnflaggedSharedFallbacks(root, INTENTIONAL_SHARED_PHOTO_SHA256);

  it("committed hash/src lists match the on-disk inventory", () => {
    assert.deepEqual(live.hashes, [...UNFLAGGED_SHARED_FALLBACK_SHA256].sort());
    assert.deepEqual(live.srcs, [...UNFLAGGED_SHARED_FALLBACK_SRCS].sort());
  });

  it("the cited Portage & Main street-view is an unflagged shared fallback", () => {
    for (const src of ["/photos/wpg/2121.jpg", "/photos/wpg/2029.jpg", "/photos/wpg/101693.jpg"]) {
      assert.equal(isUnflaggedSharedFallbackSrc(src), true);
      const bytes = readFileSync(join(root, "public", src.slice(1)));
      assert.equal(shouldReplaceWithPerListingPlaceholder(src, sha256(bytes)), true);
    }
    assert.equal(
      sha256(readFileSync(join(root, "public/photos/wpg/2121.jpg"))),
      sha256(readFileSync(join(root, "public/photos/wpg/2029.jpg"))),
    );
  });

  it("unique listing JPEGs are not remapped", () => {
    assert.equal(isUnflaggedSharedFallbackSrc("/photos/wpg/1001.jpg"), false);
    assert.equal(isUnflaggedSharedFallbackSrc("/photos/wpg/100034.jpg"), false);
    assert.equal(isExplicitSharedPlaceholder(LISTING_PLACEHOLDER), true);
    assert.equal(shouldReplaceWithPerListingPlaceholder(LISTING_PLACEHOLDER, "abc"), false);
  });
});

describe("listing maps prefer unique assets or the official placeholder", () => {
  it("drops the cited shared street-view onto the flagged placeholder", () => {
    assert.equal(resolveListingStorefront("mb-2121", official, wpg), LISTING_PLACEHOLDER);
    assert.equal(resolveListingStorefront("mb-2029", official, wpg), LISTING_PLACEHOLDER);
    assert.equal(resolveListingStorefront("mb-101693", official, wpg), LISTING_PLACEHOLDER);
    assert.equal(listingPhotosFor("mb-2121", ["/photos/wpg/2121.jpg"], official, wpg)[0], LISTING_PLACEHOLDER);
    assert.equal(honestListingSrc("/photos/wpg/2121.jpg"), LISTING_PLACEHOLDER);
    assert.equal(listingThumb(["/photos/wpg/2121.jpg"]), LISTING_PLACEHOLDER);
  });

  it("keeps unique wpg / official paths", () => {
    assert.equal(resolveListingStorefront("mb-100034", official, wpg), "/photos/wpg/100034.jpg");
    assert.equal(resolveListingStorefront("mb-1052", official, wpg), "/photos/buildings/mb-1052.jpg");
  });

  it("skips a shared official building when a unique wpg asset exists", () => {
    assert.equal(isUnflaggedSharedFallbackSrc("/photos/buildings/mb-1014.jpg"), true);
    assert.equal(resolveListingStorefront("mb-1014", official, wpg), "/photos/wpg/1014.jpg");
  });

  it("photoUrl does not emit CF transforms or /img for unflagged shared srcs", () => {
    assert.equal(photoUrl("/photos/wpg/2121.jpg", 480, {}), LISTING_PLACEHOLDER);
    assert.equal(photoSrcSet("/photos/wpg/2121.jpg", [320, 480], {}), undefined);
    assert.equal(
      photoUrl("/photos/wpg/2121.jpg", 480, {
        R2_PUBLIC_BASE_URL: "https://media.kidease.ca",
        CF_IMAGE_RESIZE: "1",
      }),
      "https://media.kidease.ca/photos/storefront-placeholder-480.webp",
    );
    assert.match(photoUrl("/photos/wpg/1001.jpg", 480, {}), /\/img\?src=/);
  });
});

describe("/img does not return identical bytes for distinct unflagged IDs", () => {
  async function getImg(src) {
    return optimizePhoto(
      new Request(`http://kidease.test/img?src=${encodeURIComponent(src)}&w=480`, {
        headers: { accept: "image/webp" },
      }),
    );
  }

  it("encodes unique per-listing placeholders for 2121 / 2029 / 101693", async () => {
    const a = await getImg("/photos/wpg/2121.jpg");
    const b = await getImg("/photos/wpg/2029.jpg");
    const c = await getImg("/photos/wpg/101693.jpg");
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(c.status, 200);
    assert.equal(a.headers.get("x-kidease-photo"), "per-listing-placeholder");
    assert.equal(b.headers.get("x-kidease-photo"), "per-listing-placeholder");
    assert.equal(c.headers.get("x-kidease-photo"), "per-listing-placeholder");
    const ha = sha256(Buffer.from(await a.arrayBuffer()));
    const hb = sha256(Buffer.from(await b.arrayBuffer()));
    const hc = sha256(Buffer.from(await c.arrayBuffer()));
    assert.notEqual(ha, hb);
    assert.notEqual(ha, hc);
    assert.notEqual(hb, hc);
  });

  it("keeps unique originals distinct and unflagged", async () => {
    const a = await getImg("/photos/wpg/1001.jpg");
    const b = await getImg("/photos/wpg/100034.jpg");
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.headers.get("x-kidease-photo"), null);
    const ha = sha256(Buffer.from(await a.arrayBuffer()));
    const hb = sha256(Buffer.from(await b.arrayBuffer()));
    assert.notEqual(ha, hb);
  });

  it("allows the official shared placeholder path", async () => {
    const res = await getImg(LISTING_PLACEHOLDER);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-kidease-photo"), null);
    assert.equal(listingStemFromSrc("/photos/wpg/2121.jpg"), "2121");
  });
});
