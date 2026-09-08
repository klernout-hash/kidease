import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("website listing tiles are Airbnb-dense, not the old 268px cards", () => {
  const css = src("src/styles.css");
  assert.match(css, /html\[data-channel="website"\] \{[\s\S]*--ke-card-w:\s*11\.5rem;/);
  assert.doesNotMatch(css, /--ke-card-w:\s*16\.75rem/);
  assert.match(css, /\.ke-rail \{[\s\S]*gap:\s*0\.75rem;/);
  assert.match(
    css,
    /html\[data-channel="website"\] \.ke-listings \{[\s\S]*grid-template-columns: 1fr;/,
  );
  assert.match(
    css,
    /@media \(min-width: 1024px\) \{[\s\S]*html\[data-channel="website"\] \.ke-listings \{[\s\S]*repeat\(5/,
  );
  assert.match(
    css,
    /@media \(min-width: 1280px\) \{[\s\S]*html\[data-channel="website"\] \.ke-listings \{[\s\S]*repeat\(6/,
  );
});

test("app channel keeps a readable phone tile, not a tiny grid", () => {
  const css = src("src/styles.css");
  assert.match(css, /html\[data-channel="app"\] \{[\s\S]*--ke-card-w:\s*11\.25rem;/);
  assert.match(css, /html\[data-channel="app"\] \.ke-app-search \.ke-listings-narrow \{[\s\S]*grid-template-columns: 1fr;/);
});

test("listing card copy stays a compact single stack with 44px save target", () => {
  const card = src("src/components/daycare-card.tsx");
  assert.match(card, /truncate text-\[13px\] font-semibold/);
  assert.match(card, /truncate text-\[13px\] font-normal leading-4/);
  assert.match(card, /text-\[13px\] leading-4 tabular-nums/);
  assert.match(card, /aspect-\[20\/19\]/);
  assert.match(card, /aspect-\[4\/3\]/);
  assert.match(card, /grid size-11 place-items-center rounded-full/);
  assert.doesNotMatch(card, /Guest favourite/);
  assert.doesNotMatch(card, /text-\[15px\] font-semibold leading-\[1\.2\]/);
});

test("rails, search skeletons, and featured grids share the tighter footprint", () => {
  const rail = src("src/components/listing-rail.tsx");
  const search = src("src/routes/search.tsx");
  const home = src("src/routes/index.tsx");
  const photo = src("src/lib/photo.ts");
  assert.match(rail, /scrollBy\(\{ left: dir \* 208/);
  assert.match(search, /ke-rail-card/);
  assert.match(search, /aspect-\[20\/19\]/);
  assert.doesNotMatch(search, /lg:grid-cols-5 xl:grid-cols-6/);
  assert.match(home, /ke-web-grid mt-6 grid gap-x-3 gap-y-5 md:grid-cols-3 lg:grid-cols-5/);
  assert.match(photo, /200px/);
  assert.match(photo, /CARD_WIDTHS = \[320, 480, 768\]/);
  assert.doesNotMatch(photo, /, 320px"/);
});
