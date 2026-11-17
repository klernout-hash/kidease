import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseSearchMemory, readSearchMemory, searchUrlOwnsMemory } from "../src/lib/search-memory.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";

test("a remembered search keeps place, age, and budget inside Canada", () => {
  const memory = parseSearchMemory({
    label: "Winnipeg, MB",
    lat: 49.8951,
    lng: -97.1384,
    age: "toddler",
    budgetMonthly: 800,
  });
  assert.equal(memory?.age, "toddler");
  assert.equal(memory?.budgetMonthly, 800);
  assert.equal(parseSearchMemory({ label: "Miami", lat: 25.76, lng: -80.19, age: "infant" }), null);
  assert.equal(readSearchMemory("{"), null);
});

test("a link with a place or age is not replaced by memory", () => {
  assert.equal(searchUrlOwnsMemory({ q: "Ottawa" }), true);
  assert.equal(searchUrlOwnsMemory({ age: "infant" }), true);
  assert.equal(searchUrlOwnsMemory({}), false);
  assert.equal(FLAG_DEFAULTS.FEATURE_SEARCH_MEMORY, true);
});

test("search has a reset for the remembered place, age, and budget", () => {
  const page = readFileSync(new URL("../src/routes/search.tsx", import.meta.url), "utf8");
  assert.match(page, /data-ke="search-memory-reset"/);
  assert.match(page, /loadSearchMemory/);
});
