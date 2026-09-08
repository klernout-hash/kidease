import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("home LCP hero is preloaded and sized instead of a late 1200-only AVIF", () => {
  const photo = src("src/components/building-photo.tsx");
  assert.match(photo, /HERO_LCP_AVIF_SRCSET/);
  assert.match(photo, /\/photos\/hero-480\.avif 480w/);
  assert.match(photo, /\/photos\/hero-768\.avif 768w/);
  assert.match(photo, /\/photos\/hero-1200\.avif 1200w/);
  assert.match(photo, /fetchPriority=\{priority \? "high" : eager \? "auto" : "low"\}/);
  assert.match(photo, /fetchPriority=\{eager \? "high" : "auto"\}/);
  const listing = src("src/routes/daycare.\$slug.tsx");
  assert.match(listing, /priority/);

  const home = src("src/routes/index.tsx");
  assert.match(home, /rel: "preload"/);
  assert.match(home, /as: "image"/);
  assert.match(home, /type: "image\/avif"/);
  assert.match(home, /imageSrcSet: HERO_LCP_AVIF_SRCSET/);
  assert.match(home, /imageSizes: HERO_LCP_SIZES/);
  assert.match(home, /fetchPriority: "high"/);
  assert.doesNotMatch(home, /eager=\{i < 3\}/);
  assert.match(home, /eagerThumbs=\{false\}/);

  const avif480 = statSync(join(root, "public/photos/hero-480.avif")).size;
  const avif768 = statSync(join(root, "public/photos/hero-768.avif")).size;
  const avif1200 = statSync(join(root, "public/photos/hero-1200.avif")).size;
  assert.ok(avif480 < avif768, "480 AVIF should be smaller than 768");
  assert.ok(avif768 < avif1200, "768 AVIF should be smaller than 1200");
  assert.ok(avif480 < 40_000, "mobile 1x hero should stay well under the 1200 file");
});

test("listing and search chips use ke-chip (AA contrast + 44px target), not muted pills", () => {
  const css = src("src/styles.css");
  assert.match(css, /\.ke-chip \{/);
  assert.match(css, /min-height: 2\.75rem/);
  assert.match(css, /min-width: 2\.75rem/);
  assert.match(css, /color: var\(--color-fg\)/);
  assert.match(css, /background: var\(--color-surface\)/);

  const chip = src("src/components/chip.tsx");
  assert.match(chip, /export function ChipButton/);
  assert.match(chip, /ke-chip/);

  const listing = src("src/routes/daycare.\$slug.tsx");
  assert.match(listing, /className="ke-chip"/);
  assert.doesNotMatch(listing, /<li key=\{key\} className="rounded-full bg-surface px-3 py-1/);

  const search = src("src/routes/search.tsx");
  assert.match(search, /<ChipButton/);
  assert.doesNotMatch(search, /min-h-11 rounded-full px-3\.5 py-1\.5 text-sm font-medium ring-1/);
  assert.doesNotMatch(search, /text-muted hover:text-fg/);

  const home = src("src/routes/index.tsx");
  assert.match(home, /<ChipButton/);
  assert.doesNotMatch(home, /text-sm text-muted ring-1 ring-border/);

  const health = src("src/components/listing-health.tsx");
  assert.match(health, /className="ke-chip"/);
  assert.doesNotMatch(health, /rounded-full px-2\.5 py-1 text-xs font-medium text-primary/);
});

test("origin robots.txt has no Content-Signal directive", () => {
  const robots = src("public/robots.txt");
  assert.doesNotMatch(robots, /^Content-Signal:/m);
  assert.doesNotMatch(robots, /ai-train=/);
  assert.match(robots, /^User-agent: \*$/m);
  const cloudflare = src("docs/cloudflare.md");
  assert.match(cloudflare, /Content-Signal/);
  assert.match(cloudflare, /Add content signals to robots\.txt/);
});

test("brand mark ships the SVG, and logos get a long cache hint", () => {
  const mark = src("src/components/brand-mark.tsx");
  assert.match(mark, /\/logo-transparent\.svg/);
  assert.doesNotMatch(mark, /\/logo-transparent\.png/);
  const svg = statSync(join(root, "public/logo-transparent.svg")).size;
  const png = statSync(join(root, "public/logo-transparent.png")).size;
  assert.ok(svg < 2_000, "vector logo should be a small SVG");
  assert.ok(svg < png, "SVG should be smaller than the 673×893 PNG");

  const vercel = src("vercel.json");
  assert.match(vercel, /"source": "\/logo-transparent\.svg"/);
  assert.match(vercel, /max-age=31536000, immutable/);
});
