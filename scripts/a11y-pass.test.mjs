import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { A11Y_PAIRS, a11yPassEnabled, contrastRatio, skipLinkLabel } from "../src/lib/a11y-pass.ts";
import { copy } from "../src/lib/copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the screen reader pass defaults off", () => {
  assert.equal(a11yPassEnabled({}), false);
  assert.equal(a11yPassEnabled({ FEATURE_A11Y_PASS: "1" }), true);
});

test("skip labels exist for every shipped locale", () => {
  assert.equal(skipLinkLabel("en"), "Skip to main content");
  assert.match(skipLinkLabel("fr"), /contenu/);
  for (const code of ["zh", "yue", "pa", "es", "ar", "tl", "it", "de"]) {
    assert.notEqual(skipLinkLabel(code), skipLinkLabel("en"), code);
  }
  for (const code of ["zh", "pa", "tl"]) {
    const pack = JSON.parse(readFileSync(join(root, `src/lib/i18n/${code}.json`), "utf8"));
    assert.equal(typeof pack.search, "string");
    assert.equal(typeof pack.helpTitle, "string");
    assert.notEqual(pack.search, copy.en.search);
  }
});

test("core colours meet WCAG AA contrast", () => {
  for (const pair of A11Y_PAIRS) {
    assert.ok(contrastRatio(pair.fg, pair.bg) >= 4.5, pair.name);
  }
});
