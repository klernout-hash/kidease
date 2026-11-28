/**
 * Listing / building photos only render from supported sources (handoff S6b).
 * Anything else becomes "" so BuildingPhoto shows the branded placeholder.
 * Synthetic inputs only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isListingImageHost, safeListingImageSrc } from "../src/lib/listing-photo.ts";
import { R2_PUBLIC_DEV_ORIGIN, R2_PUBLIC_MEDIA_ORIGIN } from "../src/lib/photo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const legit = [
  "/photos/buildings/mb-1001.jpg",
  "/photos/wpg/1001.jpg",
  "/photos/demo/room-1.webp",
  "/photos/storefront-placeholder-480.webp",
  "/img?src=%2Fphotos%2Fwpg%2F1001.jpg&w=480",
  "/logo-transparent.svg?v=17",
  `${R2_PUBLIC_MEDIA_ORIGIN}/photos/buildings/mb-1001.jpg`,
  `${R2_PUBLIC_MEDIA_ORIGIN}/cdn-cgi/image/width=480,quality=75,format=auto,fit=scale-down/photos/wpg/1001.jpg`,
  `${R2_PUBLIC_DEV_ORIGIN}/photos/wpg/1001.jpg`,
  "https://www.kidease.ca/photos/wpg/1001.jpg",
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD=",
  "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
  "data:image/png;base64,iVBORw0KGgo=",
];

const blocked = [
  "javascript:alert(1)",
  "JAVASCRIPT:alert(1)",
  " javascript:alert(1)",
  "java\tscript:alert(1)",
  "vbscript:msgbox(1)",
  "data:text/html;base64,PHNjcmlwdD4=",
  "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
  "data:image/svg+xml,<svg onload=alert(1)>",
  'data:image/png;base64,abc"onerror=alert(1)',
  "blob:https://www.kidease.ca/1234",
  "http://media.kidease.ca/photos/wpg/1001.jpg",
  "https://evil.example/photo.jpg",
  "https://media.kidease.ca.evil.example/photo.jpg",
  "https://evil.example/media.kidease.ca/photo.jpg",
  "https://user:pass@media.kidease.ca/photo.jpg",
  "https://media.kidease.ca:8443/photo.jpg",
  "https://r2.dev/photo.jpg",
  "https://a.b.r2.dev/photo.jpg",
  "//evil.example/photo.jpg",
  "/\\evil.example/photo.jpg",
  "/\t/evil.example/photo.jpg",
  "/photos/../secret.jpg",
  "file:///etc/passwd",
  "null",
  "about:blank",
  "https://",
  "",
  null,
  undefined,
];

test("supported photo sources render unchanged", () => {
  for (const value of legit) assert.equal(safeListingImageSrc(value), value, value);
  assert.equal(safeListingImageSrc("  /photos/wpg/1001.jpg  "), "/photos/wpg/1001.jpg");
});

test("unsupported or active sources fall back to the placeholder", () => {
  for (const value of blocked) assert.equal(safeListingImageSrc(value), "", JSON.stringify(value));
});

test("photo host allowlist matches the R2 media host rules", () => {
  assert.equal(isListingImageHost("media.kidease.ca"), true);
  assert.equal(isListingImageHost("MEDIA.KIDEASE.CA"), true);
  assert.equal(isListingImageHost(new URL(R2_PUBLIC_DEV_ORIGIN).hostname), true);
  assert.equal(isListingImageHost("r2.dev"), false);
  assert.equal(isListingImageHost("x.y.r2.dev"), false);
  assert.equal(isListingImageHost("kidease.ca.evil.example"), false);
});

test("BuildingPhoto and raw listing <img> sites go through the allowlist", () => {
  const building = src("src/components/building-photo.tsx");
  assert.match(building, /const healed = safeListingImageSrc\(src\)/);
  assert.match(building, /const next = safeListingImageSrc\(src\)/);
  assert.doesNotMatch(building, /healMediaUrl\(src\)/);
  assert.match(
    src("src/components/listing-hero-gallery.tsx"),
    /src=\{safeListingImageSrc\(src\)\}/,
  );
  assert.match(src("src/components/airbnb-screens.tsx"), /safeListingImageSrc\(row\.photos/);
  assert.match(
    src("src/routes/checkin.$id.tsx"),
    /safeListingImageSrc\(res\.daycare\.photos\[1\]\)/,
  );
});
