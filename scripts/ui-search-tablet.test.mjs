import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("search results use two columns at 744 px and three in full-width tablet landscape", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /min-width: 46\.5rem\) \{\s+\.ke-result-stack \{\s+grid-template-columns: repeat\(2,/);
  assert.match(css, /min-width: 64rem\) and \(min-aspect-ratio: 1\/1\) \{\s+\.ke-result-stack \{\s+grid-template-columns: repeat\(3,/);
});

test("the mobile Where field keeps its accessible name and submits the top suggestion on Enter", () => {
  const sheet = readFileSync(new URL("../src/components/mobile-search-sheet.tsx", import.meta.url), "utf8");
  const where = sheet.slice(sheet.indexOf('data-ke="msv2-where-input"'), sheet.indexOf('data-ke="msv2-where-list"'));
  assert.match(where, /aria-label=\{t\("msv2Where"\)\}/);
  assert.match(where, /event\.key !== "Enter" \|\| event\.nativeEvent\.isComposing/);
  assert.match(where, /suggestions\[0\]\?\.label \?\? typed\.trim\(\)/);
  assert.match(where, /submit\(\{ \.\.\.draft, where, nearMe: false \}\)/);
});
