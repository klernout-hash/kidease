import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("image resize runbook is dashboard + env only — no invented tokens", () => {
  const docs = src("docs/image-resizing.md");
  const envExample = src(".env.example");
  const publicPhotos = src("scripts/r2-public-photos.md");
  assert.match(docs, /cdn-cgi\/image/);
  assert.match(docs, /media\.kidease\.ca/);
  assert.match(docs, /Images.*Transformations/s);
  assert.match(docs, /CF_IMAGE_RESIZE/);
  assert.match(docs, /VITE_CF_IMAGE_RESIZE/);
  assert.match(docs, /Leave the flag \*\*unset\*\*/);
  assert.match(docs, /No Images API token/);
  assert.match(docs, /https:\/\/media\.kidease\.ca\/photos\/buildings\/mb-1001\.jpg/);
  assert.doesNotMatch(docs, /cfait_|sk_live_|imagedelivery\.net\/[a-zA-Z0-9]/);
  assert.doesNotMatch(docs, /CLOUDFLARE_API_TOKEN=/);
  assert.match(publicPhotos, /docs\/image-resizing\.md/);
  assert.match(envExample, /# CF_IMAGE_RESIZE=/);
  assert.match(envExample, /# VITE_CF_IMAGE_RESIZE=/);
  assert.doesNotMatch(envExample, /CF_IMAGE_RESIZE=1/);
});

test("BuildingPhoto falls back to the original R2 URL when a transform 404s", () => {
  const photo = src("src/components/building-photo.tsx");
  const detail = src("src/routes/daycare.$slug.tsx");
  const map = src("src/components/map-view.tsx");
  assert.match(photo, /skipTransform/);
  assert.match(photo, /publicPhotoUrl/);
  assert.match(photo, /isResizedPhotoUrl/);
  assert.match(photo, /srcsetWidthsFor/);
  assert.match(detail, /DETAIL_SIZES/);
  assert.match(detail, /width=\{768\}/);
  // Compact pin card (#265): 64px CSS thumb, 2× intrinsic. Not the old 112px sheet.
  assert.match(map, /data-ke="map-pin-photo"/);
  assert.match(map, /BuildingPhoto/);
  assert.match(map, /sizes="64px"/);
  assert.match(map, /width=\{128\}/);
  assert.match(map, /height=\{96\}/);
  assert.doesNotMatch(map, /sizes="112px"/);
  assert.doesNotMatch(map, /width=\{224\}/);
});
