import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { contrastRatio } from "../src/lib/a11y-pass.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src/styles.css"), "utf8");
const button = readFileSync(join(root, "src/components/ui/button.tsx"), "utf8");

test("elevation, gloss, and radius are defined once in the theme", () => {
  assert.match(css, /--shadow-1: 0 1px 2px rgba\(16, 24, 40, 0\.06\), 0 1px 3px rgba\(16, 24, 40, 0\.08\);/);
  assert.match(css, /--shadow-2: 0 2px 4px rgba\(16, 24, 40, 0\.04\), 0 6px 16px rgba\(16, 24, 40, 0\.08\);/);
  assert.match(css, /--shadow-3: 0 4px 8px rgba\(16, 24, 40, 0\.05\), 0 12px 32px rgba\(16, 24, 40, 0\.12\);/);
  assert.match(css, /--shadow-card: var\(--shadow-2\);/);
  assert.match(css, /--shadow-lift: var\(--shadow-3\);/);
  assert.match(css, /--color-bg: #f7f7f8;/);
  assert.match(css, /--ke-gloss: linear-gradient\(180deg, rgba\(255, 255, 255, 0\.6\), transparent 40%\);/);
  assert.match(css, /--ke-hairline: rgba\(0, 0, 0, 0\.06\);/);
  assert.match(css, /--radius-card: 22px;/);
  assert.match(css, /--radius-md: 12px;/);
  assert.match(css, /--radius-pill: 999px;/);
});

test("dark elevation keeps the inset highlight and lifts the card off the page", () => {
  assert.match(css, /--color-bg: #101218;/);
  assert.match(css, /--color-surface: #1c212c;/);
  assert.match(css, /inset 0 1px 0 rgba\(255, 255, 255, 0\.06\)/);
  assert.match(css, /--ke-hairline: rgba\(255, 255, 255, 0\.08\);/);
});

test("body text clears 7 to 1 and secondary text clears 4.5 to 1", () => {
  assert.ok(contrastRatio("#141210", "#f7f7f8") >= 7);
  assert.ok(contrastRatio("#3c3832", "#f7f7f8") >= 4.5);
  assert.ok(contrastRatio("#514c46", "#ffffff") >= 4.5);
  assert.ok(contrastRatio("#f4f1ea", "#101218") >= 7);
  assert.ok(contrastRatio("#c5cad6", "#1c212c") >= 4.5);
  assert.ok(contrastRatio("#ffffff", "#1a3790") >= 4.5);
});

test("primary buttons are full-round and lift without moving layout", () => {
  assert.match(button, /rounded-full/);
  assert.match(button, /hover:-translate-y-px/);
  assert.match(button, /active:scale-\[0\.98\]/);
  assert.match(button, /outline-2/);
  assert.match(css, /transform: translateY\(-1px\)/);
  assert.match(css, /transform: scale\(0\.98\)/);
});

test("blur stays on the fixed bars and sheets, and reduced motion keeps colour only", () => {
  assert.match(css, /\[data-ke="app-tab-bar"\] \{[\s\S]*backdrop-filter: blur\(16px\) saturate\(180%\)/);
  assert.match(css, /\.ke-site-header \{[\s\S]*backdrop-filter: blur\(16px\) saturate\(180%\)/);
  assert.match(css, /dialog\.msv2-dialog,\s*\.ke-airbnb-sheet \{[\s\S]*backdrop-filter: blur\(16px\) saturate\(180%\)/);
  assert.doesNotMatch(css, /\.ke-visual-card \{[^}]*backdrop-filter/);
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /transition-property: color, background-color, border-color/);
  assert.match(reduced, /transform: none/);
});
