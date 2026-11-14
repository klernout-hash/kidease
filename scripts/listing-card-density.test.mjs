import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { photoFrameFallbackStyle } from "../src/lib/photo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("website rails share the Recently Viewed footprint while search stays responsive", () => {
  const css = src("src/styles.css");
  assert.match(css, /--ke-card-w:\s*min\(10\.5rem, 42vw\);/);
  assert.doesNotMatch(css, /--ke-card-w:\s*16\.75rem/);
  assert.match(css, /\.ke-rail \{[\s\S]*?gap:\s*0\.5rem;/);
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

test("app search stays full width while tablet rails keep the shared card track", () => {
  const css = src("src/styles.css");
  assert.match(css, /html\[data-channel="app"\] \.ke-rail--visual \{[^}]*grid-template-columns: repeat\(auto-fill, var\(--ke-card-w\)\);/);
  assert.match(css, /html\[data-channel="app"\] \.ke-app-search \.ke-listings-narrow \{[\s\S]*grid-template-columns: 1fr;/);
});

test("listing card copy stays a compact single stack with 44px save target", () => {
  const card = src("src/components/daycare-card.tsx");
  const save = src("src/components/save-listing-button.tsx");
  assert.match(card, /truncate text-\[12px\] font-semibold/);
  assert.match(card, /truncate text-\[12px\] font-normal leading-4/);
  assert.match(card, /text-\[12px\] leading-4 tabular-nums/);
  assert.doesNotMatch(card, /aspect-\[(?:3\/2|4\/3)\]/);
  assert.equal((card.match(/className="ke-card-photo"/g) || []).length, 2);
  assert.match(card, /data-ke="visual-card"/);
  assert.match(card, /line-clamp-2 min-w-0 whitespace-normal text-\[15px\] min-h-10 font-semibold leading-5/);
  assert.doesNotMatch(card, /aspect-\[20\/19\]/);
  assert.match(card, /SaveListingButton/);
  assert.match(save, /grid min-h-\[44px\] min-w-\[44px\] place-items-center rounded-full/);
  assert.match(save, /size-12 bg-surface text-fg ring-1 ring-border/);
  assert.doesNotMatch(save, /shadow-\[0_2px_10px_rgba\(0,0,0,0\.32\)\]/);
  assert.match(save, /size-7/);
  assert.doesNotMatch(card, /Guest favourite/);
});

test("rails, search skeletons, and featured grids share the tighter footprint", () => {
  const rail = src("src/components/listing-rail.tsx");
  const search = src("src/routes/search.tsx");
  const home = src("src/routes/index.tsx") + src("src/components/home-discovery.tsx");
  const photo = src("src/lib/photo.ts");
  assert.match(rail, /scrollBy\(\{ left: dir \* step/);
  assert.match(search, /data-ke="search-result-list"/);
  assert.match(search, /ke-result-stack/);
  assert.match(search, /ke-skel ke-card-photo/);
  assert.doesNotMatch(search, /lg:grid-cols-5 xl:grid-cols-6/);
  assert.match(home, /FacilityTypeRails items=\{shown\} visual/);
  assert.doesNotMatch(home, /ke-web-grid/);
  assert.match(photo, /200px/);
  assert.match(photo, /CARD_WIDTHS = \[320, 480, 768\]/);
  assert.doesNotMatch(photo, /, 320px"/);
});

test("Recently Viewed, both card presentations, and show-more share one photo ratio", () => {
  const css = src("src/styles.css");
  const recent = src("src/components/recently-viewed-row.tsx");
  const rail = src("src/components/listing-rail.tsx");
  assert.match(css, /--ke-card-photo-ratio:\s*20 \/ 19;/);
  assert.match(css, /\.ke-card-photo \{[^}]*aspect-ratio: var\(--ke-card-photo-ratio\);/);
  assert.match(css, /\.ke-photo-frame \{[^}]*aspect-ratio: var\(--ke-card-photo-ratio\);/);
  assert.match(css, /\.ke-card-photo > img \{[^}]*object-fit: cover;/);
  assert.match(recent, /className="ke-rail-card"/);
  assert.match(recent, /className="ke-card-photo /);
  assert.match(rail, /"ke-card-photo"/);
  assert.doesNotMatch(css, /min\(85vw, 18\.5rem\)|flex-basis: 17\.5rem|flex: 0 0 86%/);
});

test("classic and clean home retain their Recently Viewed placement with the same photo cards on web and app", () => {
  const home = src("src/routes/index.tsx");
  const web = home.slice(home.indexOf('className="ke-home-web'), home.indexOf('className="ke-home-app'));
  const app = home.slice(home.indexOf('className="ke-home-app'));
  for (const channel of [web, app]) {
    assert.equal((channel.match(/<RecentlyViewedRow items=\{recentPublic\} cards \/>/g) ?? []).length, 2);
    for (const look of ["classic", "clean"]) {
      assert.match(channel, new RegExp(`className="ke-${look}-only[^"]*">\\s*<RecentlyViewedRow items=\\{recentPublic\\} cards \\/>`));
    }
  }
  assert.doesNotMatch(home, /<RecentlyViewedRow items=\{recentPublic\} \/>/);
  const recent = src("src/components/recently-viewed-row.tsx");
  assert.match(recent, /to=\{localePath\(`\/daycare\/\$\{item\.slug\}`, locale\)\}/);
  assert.match(recent, /items\.filter\(\(item\) => isSafeSitemapSlug\(item\.slug\)\)\.slice\(0, 12\)/);
  assert.match(src("src/components/photo-carousel.tsx"), /className="size-full object-cover object-center"/);
  assert.match(src("src/components/building-photo.tsx"), /ke-photo size-full bg-surface-2 object-cover/);
});

test("missing photos preserve shared card geometry instead of restoring the image's 4:3 ratio", () => {
  for (const frame of ["ke-card-photo w-full", "mb-2 ke-card-photo rounded-lg", "aspect-[20/19]", "size-full", "h-full"]) {
    assert.equal(photoFrameFallbackStyle(frame, 480, 360), undefined, frame);
  }
  assert.deepEqual(photoFrameFallbackStyle(undefined, 480, 360), { aspectRatio: "480 / 360" });
  assert.deepEqual(photoFrameFallbackStyle("rounded-lg", 336, 320), { aspectRatio: "336 / 320" });
});
