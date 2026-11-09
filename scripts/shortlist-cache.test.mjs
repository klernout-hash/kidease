import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shortlist = readFileSync(new URL("../src/lib/shortlist.ts", import.meta.url), "utf8");
const button = readFileSync(new URL("../src/components/save-listing-button.tsx", import.meta.url), "utf8");

test("search hearts share one saved-list read and keep a stored heart when that read fails", () => {
  assert.match(shortlist, /export function loadShortlistIds/);
  assert.match(shortlist, /if \(!loadingIds\)/);
  assert.doesNotMatch(shortlist, /if \(cached\) return Promise\.resolve/);
  assert.match(button, /loadShortlistIds\(userId, listSavedIds\)/);
  assert.match(button, /const cache = readShortlistCache\(user\.id\)/);
  assert.doesNotMatch(button, /catch \(\(\) => \{\s*if \(live\) setSaved\(false\)/);
});
