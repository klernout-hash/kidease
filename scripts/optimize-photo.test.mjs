import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { listingSrcToR2Key, r2ReadOriginalsEnabled } from "../src/lib/server/r2.ts";
import { optimizePhoto } from "../src/lib/server/optimize-photo.ts";
import { isSafeSitemapSlug } from "../src/lib/sitemap.ts";
import { decideListingLoader, isReservedListingSlug } from "../src/lib/listing-not-found.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("/img dual-reads R2 then Git and still allow-lists /photos paths", () => {
  const source = readFileSync(join(root, "src/lib/server/optimize-photo.ts"), "utf8");
  assert.match(source, /readListingOriginal/);
  assert.match(source, /r2ReadOriginalsEnabled/);
  assert.match(source, /getR2Object/);
  assert.match(source, /readPublicMediaOriginal/);
  assert.match(source, /media\.kidease\.ca\/photos/);
  assert.match(source, /public\/photos|public", src\.slice/);
  assert.match(source, /ALLOW = \/\^\\\/photos\\\//);
  assert.doesNotMatch(source, /BUILDING_ON_DISK/);
  assert.match(source, /shouldReplaceWithPerListingPlaceholder/);
  assert.match(source, /encodePerListingPlaceholder/);
  assert.match(source, /x-kidease-photo/);
  assert.doesNotMatch(source, /Photo coming soon/);
  assert.doesNotMatch(source, /font-family/);

  const src = "/photos/storefront-placeholder-480.webp";
  assert.equal(listingSrcToR2Key(src), "originals/storefront-placeholder-480.webp");
  assert.equal(existsSync(join(root, "public", src.slice(1))), true);
  assert.equal(r2ReadOriginalsEnabled({}), false);
});

test("a missing /photos original is a placeholder image, not a 404", async () => {
  const src = "/photos/buildings/mb-missing-scorecard.jpg";
  assert.equal(existsSync(join(root, "public", src.slice(1))), false);
  const res = await optimizePhoto(
    new Request(`http://kidease.test/img?src=${encodeURIComponent(src)}&w=480`, {
      headers: { accept: "image/webp" },
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/webp");
  assert.equal(res.headers.get("x-kidease-photo"), "per-listing-placeholder");
  const body = Buffer.from(await res.arrayBuffer());
  assert.ok(body.byteLength > 32);
});

test("listings do not link /daycare/null", () => {
  assert.equal(isSafeSitemapSlug("null"), false);
  assert.equal(isSafeSitemapSlug("undefined"), false);
  assert.equal(isSafeSitemapSlug("winnipeg-centre"), true);
  assert.equal(isReservedListingSlug("null"), true);
  assert.deepEqual(decideListingLoader("null", { slug: "null" }, null), { type: "not-found" });
  assert.deepEqual(decideListingLoader("undefined", null, null), { type: "not-found" });
  const card = readFileSync(join(root, "src/components/daycare-card.tsx"), "utf8");
  assert.match(card, /isSafeSitemapSlug\(slug\)/);
  assert.match(card, /function ListingAnchor/);
});
