import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

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

test("the clean look has light and dark tokens and leaves the logo alone", () => {
  const css = src("src/styles.css");
  assert.match(css, /html\[data-look="clean"\] \{\n {2}--color-bg: #ffffff;/);
  assert.match(css, /html\[data-look="clean"\]\[data-resolved-theme="dark"\],/);
  const block = css.slice(css.indexOf("  Clean look. Every rule below"));
  assert.doesNotMatch(block, /data-ke-mark|brand-mark|logo/);
  assert.match(src("docs/clean-look/README.md"), /Do not change the default until Kyle says so/);
});
