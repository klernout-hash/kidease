import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { CARE_CATEGORY_SOURCES, careCategoryArt } from "../src/lib/care-category-art.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

function boot(search, stored = {}) {
  const store = new Map(Object.entries(stored));
  const dataset = {};
  const context = {
    window: {
      location: { search },
      localStorage: {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
      },
      matchMedia: () => ({ matches: false }),
    },
    document: { documentElement: { dataset, style: {} } },
  };
  vm.runInNewContext(src("public/look-boot.js"), context);
  return { look: dataset.look, stored: store.get("kidease-look") };
}

test("today's look stays the default", () => {
  assert.match(src("public/look-boot.js"), /var DEFAULT_LOOK = "classic";/);
  assert.equal(boot("").look, undefined);
  assert.equal(boot("?q=winnipeg").look, undefined);
  assert.equal(boot("?look=other").look, undefined);
});

test("the clean look is a per-device choice from the link", () => {
  assert.deepEqual(boot("?look=clean"), { look: "clean", stored: "clean" });
  assert.equal(boot("?city=Winnipeg&look=clean").look, "clean");
  assert.equal(boot("", { "kidease-look": "clean" }).look, "clean");
  assert.deepEqual(boot("?look=classic", { "kidease-look": "clean" }), { look: undefined, stored: "classic" });
});

test("the look switch loads from its own versioned file", () => {
  assert.match(src("src/routes/__root.tsx"), /<script src="\/look-boot\.js\?v=\d+" \/>/);
  assert.doesNotMatch(src("public/theme-boot.js"), /kidease-look/);
});

test("every clean rule is scoped to the look attribute", () => {
  const css = src("src/styles.css");
  const start = css.indexOf("  Clean look. Every rule below");
  assert.ok(start > 0);
  const block = css.slice(css.indexOf("*/", start) + 2);
  const selectors = block
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@media[^{]+\{/g, "")
    .split("}")
    .map((rule) => rule.split("{")[0].trim())
    .filter(Boolean);
  assert.ok(selectors.length >= 8);
  for (const selector of selectors) {
    for (const part of selector.split(/,\s*\n/)) {
      assert.match(part.trim(), /^html\[data-look="clean"\]/, part);
    }
  }
});

test("the clean look has light and dark tokens and keeps the logo artwork", () => {
  const css = src("src/styles.css");
  assert.match(css, /html\[data-look="clean"\] \{\n {2}--color-bg: #ffffff;/);
  assert.match(css, /html\[data-look="clean"\]\[data-resolved-theme="dark"\],/);
  const block = css.slice(css.indexOf("  Clean look. Every rule below"));
  // The logo may be shown larger. Its artwork and colours are never restyled.
  assert.doesNotMatch(block, /data-ke-mark|brand-mark/);
  assert.match(src("docs/clean-look/README.md"), /Do not change the default until Kyle says so/);
});

test("the home picture tabs sit inside the header without page overlap", () => {
  const css = src("src/styles.css");
  const shell = src("src/components/shell.tsx");
  assert.match(shell, /data-ke="header-care-categories"/);
  assert.match(src("src/routes/index.tsx"), /headerCategories=\{boot\.airbnbUi/);
  assert.match(css, /\[data-ke="header-care-categories"\] \.ke-airbnb-cats/);
  assert.doesNotMatch(css, /margin: -6rem auto 0/);
});

test("the tidy home keeps every part reachable", () => {
  const css = src("src/styles.css");
  assert.match(css, /html:not\(\[data-look="clean"\]\) \.ke-clean-only \{\n {2}display: none !important;/);
  assert.match(src("src/routes/index.tsx"), /className="ke-clean-only [^"]*">\s*<HeroClaimStrip lower \/>/);
  assert.match(src("src/components/hero-claim-strip.tsx"), /data-place=\{lower \? "lower" : "hero"\}/);
  assert.match(src("src/components/explore-search-bar.tsx"), /onNearby: onLocate/);
});

test("recently viewed shares photo cards while moving up only in the clean look", () => {
  const home = src("src/routes/index.tsx");
  assert.equal(home.match(/<RecentlyViewedRow items=\{recentPublic\} cards \/>/g)?.length, 4);
  assert.equal(home.match(/className="ke-classic-only[^"]*">\s*<RecentlyViewedRow items=\{recentPublic\} cards \/>/g)?.length, 2);
  const row = src("src/components/recently-viewed-row.tsx");
  assert.match(row, /data-ke="recent-card"/);
  assert.match(row, /rounded-2xl/);
  assert.doesNotMatch(row, /rounded-\[/);
  assert.match(src("src/styles.css"), /html\[data-look="clean"\] \.ke-classic-only \{\n {2}display: none !important;/);
});

test("each care type keeps the same original artwork in Classic and Clean", () => {
  const css = src("src/styles.css");
  assert.doesNotMatch(css, /content:\s*url\("\/photos\/care-icons\//);
  for (const [id, file] of Object.entries(CARE_CATEGORY_SOURCES)) {
    assert.equal(careCategoryArt(id).src, `/photos/care-icons/${file}`);
    assert.ok(readFileSync(join(root, "public/photos/care-icons", file)).length > 1000, id);
  }
  assert.match(src("src/components/facility-type-rails.tsx"), /<CareCategoryIcon id=\{type\}/);
  assert.match(src("src/components/airbnb-screens.tsx"), /<CareCategoryIcon id=\{cat\.id\}/);
});
