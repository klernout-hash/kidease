import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { rememberSearch } from "../src/lib/recent-searches.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const copy = readFileSync(join(root, "src/lib/copy.ts"), "utf8");
const search = readFileSync(join(root, "src/routes/search.tsx"), "utf8");

test("recent searches stay on the phone, newest first, and skip blanks", () => {
  const first = rememberSearch([], "  Winnipeg  ", "2026-10-01T00:00:00.000Z");
  assert.deepEqual(first, [{ label: "Winnipeg", at: "2026-10-01T00:00:00.000Z" }]);
  const again = rememberSearch(first, "winnipeg", "2026-10-02T00:00:00.000Z");
  assert.equal(again.length, 1);
  assert.equal(again[0].at, "2026-10-02T00:00:00.000Z");
  const many = ["Ajax", "Barrie", "Calgary", "Dartmouth", "Edmonton", "Fredericton"].reduce(
    (list, label) => rememberSearch(list, label),
    [],
  );
  assert.equal(many.length, 5);
  assert.equal(many[0].label, "Fredericton");
  assert.deepEqual(rememberSearch(first, " "), first);
  assert.match(copy, /recentSearches: "Recent searches"/);
  assert.match(copy, /recentSearches: "Recherches récentes"/);
  assert.match(search, /data-ke="recent-searches"/);
  assert.match(search, /writeRecentSearches/);
  assert.match(search, /if \(hit\) \{\s*applyPlace\(hit, label\);\s*return;\s*\}\s*noteSearch\(label\);/s);
  assert.doesNotMatch(readFileSync(join(root, "src/lib/recent-searches.ts"), "utf8"), /fetch\(|DATABASE_URL/);
});
