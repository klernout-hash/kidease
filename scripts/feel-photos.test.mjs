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
  "public/photos/playroom-1200.jpg",
  "public/photos/community.jpg",
  "public/photos/cottage.jpg",
  "public/photos/kitchen.jpg",
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
  assert.match(source, /export function FeelPhoto/);
  assert.match(source, /export function HeroYard/);

  const home = readFileSync(join(root, "src/routes/index.tsx"), "utf8");
  assert.match(home, /HeroYard/);
  assert.match(home, /\[\[data-channel=app\]/);
  assert.match(home, /\/photos\/hero\.jpg/);
  assert.doesNotMatch(home, /login\.tsx/);
});
