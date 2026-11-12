import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { govTownMatches } from "../src/lib/gov/town-search.ts";

const cities = ["ALL", "Altona", "BRANDON", "Winkler", "Winnipeg", "East St. Paul", "West St. Paul"];

test("typing a town finds it, ignoring case", () => {
  assert.deepEqual(govTownMatches(cities, "Winnipeg"), ["Winnipeg"]);
  assert.deepEqual(govTownMatches(cities, "win"), ["Winkler", "Winnipeg"]);
  assert.deepEqual(govTownMatches(cities, "brandon"), ["BRANDON"]);
});

test("names that start with the text come before names that contain it", () => {
  assert.deepEqual(govTownMatches(cities, "st"), ["East St. Paul", "West St. Paul"]);
  assert.deepEqual(govTownMatches(["Paulson", "East St. Paul"], "paul"), ["Paulson", "East St. Paul"]);
});

test("one letter, the no-filter option and unknown text give nothing", () => {
  assert.deepEqual(govTownMatches(cities, "w"), []);
  assert.deepEqual(govTownMatches(cities, "all"), []);
  assert.deepEqual(govTownMatches(cities, "Toronto"), []);
});

test("the search box always shows an outcome", () => {
  const src = readFileSync(new URL("../src/components/gov/gov-frame.tsx", import.meta.url), "utf8");
  assert.match(src, /data-ke="gov-search-result"/);
  assert.match(src, /aria-live="polite"/);
  assert.match(src, /The numbers have not changed/);
});
