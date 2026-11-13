import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeMobileSearchParams } from "../src/lib/mobile-search-v2.ts";

test("editing mobile search retains advanced filters and restarts pagination", () => {
  const before = {
    q: "Winnipeg", page: 3, meals: "1", diet: "nut-free", licence: "centre",
    km: 25, sort: "distance", need: "outdoor", work: "Downtown", openings: "1", ages: "infant",
  };
  const after = mergeMobileSearchParams(before, { q: "Brandon", ages: "preschool", age: "preschool" });
  assert.equal(after.q, "Brandon");
  assert.equal(after.ages, "preschool");
  for (const key of ["meals", "diet", "licence", "km", "sort", "need", "work"]) assert.equal(after[key], before[key], key);
  assert.equal(after.page, undefined);
  assert.equal(after.openings, undefined);
  assert.equal(before.page, 3);
  assert.equal(before.q, "Winnipeg");
});

test("a repeated mobile edit clears removed sheet fields without clearing unrelated settings", () => {
  const first = mergeMobileSearchParams({ inclusiveCare: "sensory", radius: 10 }, {
    q: "Winnipeg", ages: "infant", from: "2027-01-15", fac: "family_home", spoken: "fr",
  });
  const second = mergeMobileSearchParams(first, { q: "Winnipeg" });
  for (const key of ["ages", "from", "fac", "spoken"]) assert.equal(second[key], undefined, key);
  assert.equal(second.inclusiveCare, "sensory");
  assert.equal(second.radius, 10);
});

test("the smaller mobile sheet retains advanced multi-select choices it cannot represent", () => {
  const before = { q: "Winnipeg", fac: "child_care_centre,nursery_preschool", sched: "full,part", spoken: "zh,fr" };
  const unchanged = mergeMobileSearchParams(before, { q: "Winnipeg", spoken: "fr" });
  assert.equal(unchanged.fac, before.fac);
  assert.equal(unchanged.sched, before.sched);
  assert.equal(unchanged.spoken, before.spoken);
  const withoutFrench = mergeMobileSearchParams(before, { q: "Winnipeg" });
  assert.equal(withoutFrench.spoken, "zh");
  assert.equal(withoutFrench.fac, before.fac);
  const centre = mergeMobileSearchParams(before, { q: "Winnipeg", spoken: "fr", fac: "child_care_centre" });
  assert.equal(centre.fac, "child_care_centre");
});

test("mobile controls use applied summaries, a real map mode, and reachable shared filters and paging", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const sheet = read("src/components/mobile-search-sheet.tsx");
  const route = read("src/routes/search.tsx");
  assert.match(sheet, /resultsHeadline\(whereAnswer\(draft\)/);
  assert.match(sheet, /resultsSubline\(draft, locale\)/);
  assert.match(sheet, /setCurrent\(draft\);\s*setOpen\(false\)/);
  assert.match(sheet, /data-ke="msv2-map-toggle"/);
  assert.match(sheet, /aria-expanded=\{filtersOpen\}/);
  assert.match(route, /search: \(previous\) => mergeMobileSearchParams\(previous, params\)/);
  assert.match(route, /replace: true/);
  assert.ok(route.indexOf('id="search-filters"') < route.indexOf('data-ke="msv2-split"'));
  const mobile = route.slice(route.indexOf('data-ke="msv2-split"'), route.indexOf('"ke-search-results relative'));
  assert.match(mobile, /view === "map"/);
  assert.match(mobile, /onFallback=\{\(\) => setView\("list"\)\}/);
  assert.match(mobile, /data-ke="mobile-search-pagination"/);
  assert.doesNotMatch(mobile, /max-h-\[58dvh\]|overflow-y-auto/);
});
