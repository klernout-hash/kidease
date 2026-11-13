import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFixtureState } from "./polish-fixture-prepare.mjs";
import {
  CONTROLLED_SEARCH_CASE,
  controlledSearchPath,
  searchGeographyMatches,
  waitForSettledSurface,
} from "./polish-settled-surface.mjs";

const first = { pageId: "search", countText: "426 centres permis", total: 426, renderedCards: 96, orderedCards: [{ slug: "centre", text: "Centre Winnipeg" }] };
const settled = { ...first, orderedCards: [{ slug: "centre", text: "Centre Winnipeg · 0.3 km" }] };
const goodGeo = { path: "/fr/search", query: "Winnipeg, MB", headings: ["Winnipeg"], whereValues: ["Winnipeg, MB"], distanceLabelCount: 1, distanceLabels: [{ slug: "centre", labels: ["0.3 km"] }] };
const coldGeo = { ...goodGeo, query: "", headings: ["Garderies permises"], distanceLabelCount: 0, distanceLabels: [] };
function fixture(transitions) {
  let clock = 0;
  const surfaceInspector = () => {};
  const observed = () => transitions.filter((row) => row.at <= clock).at(-1);
  return {
    page: {
      async waitForTimeout(ms) { clock += ms; },
      async evaluate(fn) { return structuredClone(fn === surfaceInspector ? observed().surface : observed().geo); },
    },
    options: { pageId: "search", inspectSurface: surfaceInspector, now: () => clock, timeoutMs: 3000, stableMs: 500, pollMs: 100 },
    time: () => clock,
  };
}

test("paired locale URLs explicitly name the same geography without relabeling empty-query cases", () => {
  for (const locale of ["en", "fr"]) {
    const parsed = new URL(controlledSearchPath(locale), "http://127.0.0.1:8091");
    assert.equal(parsed.searchParams.get("q"), "Winnipeg, MB");
    assert.equal(parsed.pathname, locale === "fr" ? "/fr/search" : "/search");
  }
  assert.throws(() => controlledSearchPath("de"));
});

test("locale context inputs do not inherit another locale's storage or cookie changes", () => {
  const captured = { cookies: [{ name: "session", value: "synthetic-captured-cookie", domain: "127.0.0.1" }], origins: [{ origin: "http://127.0.0.1:8091", localStorage: [{ name: "kidease-origin", value: "captured-location" }] }] };
  const before = structuredClone(captured);
  const en = normalizeFixtureState(captured, "http://127.0.0.1:8092");
  en.cookies[0].value = "navigation-refreshed-cookie";
  en.origins[0].localStorage[0].value = "navigation-location";
  const fr = normalizeFixtureState(captured, "http://127.0.0.1:8092");
  assert.deepEqual(captured, before);
  assert.equal(fr.cookies[0].value, "synthetic-captured-cookie");
  assert.equal(fr.origins[0].localStorage[0].value, "captured-location");
  assert.equal(fr.origins[0].origin, "http://127.0.0.1:8092");
});

test("counts and card identities cannot bless missing meaningful geographic labels", () => {
  assert.equal(searchGeographyMatches(coldGeo, CONTROLLED_SEARCH_CASE), false);
  assert.equal(searchGeographyMatches({ ...goodGeo, distanceLabelCount: 0 }, CONTROLLED_SEARCH_CASE), false);
  assert.equal(searchGeographyMatches({ ...goodGeo, query: "Toronto, ON" }, CONTROLLED_SEARCH_CASE), false);
  assert.equal(searchGeographyMatches({ ...goodGeo, headings: ["Garderies permises"] }, CONTROLLED_SEARCH_CASE), false);
  assert.equal(searchGeographyMatches(goodGeo, CONTROLLED_SEARCH_CASE), true);
});

test("the original500ms state is retained before geography and exact full text settle", async () => {
  const f = fixture([{ at: 0, surface: first, geo: coldGeo }, { at: 1200, surface: settled, geo: goodGeo }]);
  const originals = [];
  const result = await waitForSettledSurface(f.page, { ...f.options, expectedSurface: settled, onInitial: async (row) => originals.push(structuredClone(row)) });
  assert.equal(result.settled, true);
  assert.equal(result.initial.elapsedMs, 500);
  assert.deepEqual(result.initial.surface, first);
  assert.deepEqual(originals[0].surface, first);
  assert.equal(result.initial.geographyReady, false);
  assert.equal(result.initial.fullContentParity, false);
  assert.equal(result.firstParityMs, 1200);
  assert.equal(result.firstGeographyReadyMs, 1200);
  assert.equal(result.elapsedMs, 1700);
  assert.deepEqual(result.final.surface, settled);
});

test("a stable missing-distance surface times out and remains a failed diagnostic", async () => {
  const f = fixture([{ at: 0, surface: first, geo: coldGeo }]);
  const result = await waitForSettledSurface(f.page, { ...f.options, expectedSurface: settled });
  assert.equal(result.settled, false);
  assert.equal(result.elapsedMs, 3000);
  assert.equal(result.firstParityMs, null);
  assert.equal(result.firstGeographyReadyMs, null);
  assert.deepEqual(result.final.surface, first);
});

test("geographic readiness cannot waive changed names, distance values or card order", async () => {
  for (const changed of [
    { ...settled, orderedCards: [{ slug: "centre", text: "Centre Winnipeg · 0.4 km" }] },
    { ...settled, orderedCards: [{ slug: "centre", text: "Other name Winnipeg · 0.3 km" }] },
    { ...settled, orderedCards: [{ slug: "other", text: "Centre Winnipeg · 0.3 km" }] },
  ]) {
    const f = fixture([{ at: 0, surface: changed, geo: goodGeo }]);
    const result = await waitForSettledSurface(f.page, { ...f.options, expectedSurface: settled });
    assert.equal(result.settled, false);
    assert.equal(result.final.geographyReady, true);
    assert.equal(result.final.fullContentParity, false);
    assert.deepEqual(result.final.surface, changed);
  }
});

test("canonical capture waits on full text stability, not just count and slug stability", async () => {
  const changed = { ...settled, orderedCards: [{ slug: "centre", text: "Centre Winnipeg · 0.4 km" }] };
  const f = fixture([{ at: 0, surface: settled, geo: goodGeo }, { at: 800, surface: changed, geo: { ...goodGeo, distanceLabels: [{ slug: "centre", labels: ["0.4 km"] }] } }]);
  const result = await waitForSettledSurface(f.page, f.options);
  assert.equal(result.settled, true);
  assert.equal(result.elapsedMs, 1300);
  assert.deepEqual(result.final.surface, changed);
  assert.equal(result.final.fullContentParity, null);
});

test("invalid readiness budgets and missing inspectors fail before any wait", async () => {
  const f = fixture([{ at: 0, surface: settled, geo: goodGeo }]);
  for (const options of [{ ...f.options, inspectSurface: null }, { ...f.options, timeoutMs: 499 }, { ...f.options, pollMs: 0 }])
    await assert.rejects(waitForSettledSurface(f.page, options));
  assert.equal(f.time(), 0);
});
