import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("home radius select is wide enough below desktop and the smoke covers 320px up", () => {
  const bar = src("src/components/explore-search-bar.tsx");
  const css = src("src/styles.css");
  const e2e = src("scripts/e2e-smoke.mjs");
  assert.match(bar, /min-w-\[7\.5rem\]/);
  assert.match(bar, /max-w-\[8\.5rem\]/);
  assert.match(bar, /max-lg:min-w-\[9rem\]/);
  assert.match(bar, /max-lg:max-w-none/);
  assert.match(css, /@media \(max-width: 1023px\) \{\s*select\[data-ke="search-radius"\]/);
  assert.match(css, /appearance: none/);
  assert.match(css, /min-width: min\(9rem, 42vw\)/);
  assert.match(e2e, /RADIUS_LABEL_WIDTHS = \[320, 360, 390, 412, 430, 480, 640, 767, 834, 1023\]/);
  assert.match(e2e, /RADIUS_LABEL_OPTIONS = \["5", "10", "25", "50"\]/);
  assert.match(e2e, /radiusLabelSmoke/);
  assert.match(e2e, /path of \["\/", "\/fr"\]/);
});
