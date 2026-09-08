import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED = [
  "public/photos/hero.jpg",
  "public/photos/hero-1200.jpg",
  "public/photos/hero-1200.webp",
  "public/photos/hero-1200.avif",
  "public/photos/hero-768.avif",
  "public/photos/hero-768.webp",
  "public/photos/hero-480.avif",
  "public/photos/hero-480.webp",
  "public/photos/playroom-1200.jpg",
  "public/photos/community.jpg",
  "public/photos/cottage.jpg",
  "public/photos/cottage-768.avif",
  "public/photos/cottage-768.webp",
  "public/photos/cottage-768.jpg",
  "public/photos/cottage-1200.avif",
  "public/photos/cottage-1200.webp",
  "public/photos/cottage-1200.jpg",
  "public/photos/kitchen.jpg",
  "public/photos/kitchen-768.avif",
  "public/photos/kitchen-768.webp",
  "public/photos/kitchen-768.jpg",
  "public/photos/kitchen-1200.avif",
  "public/photos/kitchen-1200.webp",
  "public/photos/kitchen-1200.jpg",
  "public/photos/nature.jpg",
  "public/photos/brick.jpg",
  "public/photos/infant.jpg",
  "public/og.jpg",
];

test("marketing feel photos stay on existing /photos paths", () => {
  for (const rel of REQUIRED) {
    const path = join(root, rel);
    assert.equal(existsSync(path), true, rel);
    assert.ok(statSync(path).size > 8_000, `${rel} should be a real image`);
  }

  const source = readFileSync(join(root, "src/components/building-photo.tsx"), "utf8");
  assert.match(source, /\/photos\/hero-1200\.jpg/);
  assert.match(source, /\/photos\/cottage-768\.avif/);
  assert.match(source, /\/photos\/kitchen-1200\.webp/);
  assert.match(source, /HERO_LCP_AVIF_SRCSET/);
  assert.match(source, /hero-480\.avif 480w/);
  assert.match(source, /hero-768\.avif 768w/);
  assert.match(source, /export function FeelPhoto/);
  assert.match(source, /export function HeroYard/);
  assert.match(source, /feelSrcSet/);
  assert.match(source, /type="image\/avif"/);

  const home = readFileSync(join(root, "src/routes/index.tsx"), "utf8");
  assert.match(home, /HeroYard/);
  assert.match(home, /\[\[data-channel=app\]/);
  assert.match(home, /\/photos\/hero\.jpg/);
  assert.match(home, /STEP_SIZES/);
  assert.match(home, /rel: "preload"/);
  assert.match(home, /as: "image"/);
  assert.match(home, /HERO_LCP_AVIF_SRCSET/);
  assert.match(home, /fetchPriority: "high"/);
  assert.doesNotMatch(home, /login\.tsx/);

  assert.match(readFileSync(join(root, "src/routes/claim.tsx"), "utf8"), /FeelBanner/);
  assert.match(readFileSync(join(root, "src/routes/help.tsx"), "utf8"), /FeelBanner/);
  assert.match(readFileSync(join(root, "src/routes/claim.tsx"), "utf8"), /\/photos\/brick\.jpg/);
  assert.match(readFileSync(join(root, "src/routes/help.tsx"), "utf8"), /\/photos\/cottage\.jpg/);
});
