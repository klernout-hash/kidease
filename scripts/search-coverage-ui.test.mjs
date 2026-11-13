import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import { createSearchLoaderRead, createSearchRequestGate, searchCoverageCopy, searchMapCount } from "../src/lib/search-coverage.ts";
import { searchEvidence } from "../src/lib/search-evidence.ts";
import { readSearchCache, writeSearchCache, searchCacheKey } from "../src/lib/search-cache.ts";

const complete = searchEvidence({ status: "complete", source: "primary", reasons: [], observedAt: 123 });
const partial = searchEvidence({ status: "partial", source: "primary", reasons: ["candidate-limit"], observedAt: 123 });
const fallback = searchEvidence({ status: "unverified", source: "snapshot", reasons: ["source-fallback"], observedAt: 123 });

test("counts distinguish exact, authoritative lower bounds and unverified observations in both languages", () => {
  assert.equal(searchCoverageCopy(complete, "en").count(12), "12 licensed centres");
  assert.equal(searchCoverageCopy(partial, "en").count(12), "At least 12 licensed centres");
  assert.equal(searchCoverageCopy(fallback, "en").count(12), "12 listings available to view");
  assert.equal(searchCoverageCopy(partial, "fr").count(12), "Au moins 12 centres permis");
  assert.equal(searchCoverageCopy(fallback, "fr").count(12), "12 fiches consultables");
  assert.equal(searchCoverageCopy(undefined, "en").incomplete, true);
  for (const locale of ["en", "fr"]) {
    for (const evidence of [partial, fallback, undefined]) {
      const copy = searchCoverageCopy(evidence, locale);
      assert.equal(copy.incomplete, true);
      assert.ok(copy.emptyDetail.length > 50);
      assert.doesNotMatch(copy.emptyTitle, /no centres|aucun centre/i);
      assert.doesNotMatch(copy.detail, /database|neon|json|sql|cache|candidate|limit/i);
    }
  }
});

test("map counts keep mapped pins separate from observed coverage", () => {
  assert.equal(searchMapCount(8, 12, complete, "en"), "8 mapped · 12 licensed centres");
  assert.equal(searchMapCount(8, 12, partial, "en"), "8 mapped · At least 12 licensed centres");
  assert.equal(searchMapCount(0, 12, fallback, "fr"), "0 centres sur la carte · 12 fiches consultables");
  assert.doesNotMatch(searchMapCount(0, 0, fallback, "en"), /matching|at least|all|no centres/i);
});

const priorWindow = globalThis.window;
const priorStorage = globalThis.sessionStorage;
let stored = null;
globalThis.window = {};
globalThis.sessionStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; }, removeItem: () => { stored = null; } };
after(() => {
  if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow;
  if (priorStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = priorStorage;
});
const response = { items: [{ id: "public-centre" }], page: 2, pageSize: 96, total: 193,
  hasMore: true, nextPage: 3, pageLimitReached: false, evidence: partial, otherMetadata: "preserved" };

test("session cache preserves full response totals, paging, evidence and observation time", () => {
  writeSearchCache("area-filter-page2", response);
  assert.deepEqual(readSearchCache("area-filter-page2"), response);
  assert.equal(readSearchCache("different-filter"), null);
  const terminal = { ...response, page: 40, total: 5000, hasMore: false, nextPage: null, pageLimitReached: true };
  writeSearchCache("page40", terminal);
  assert.deepEqual(readSearchCache("page40"), terminal);
});

test("legacy rows and malformed evidence cannot become an exact cached result", () => {
  stored = JSON.stringify({ key: "legacy", at: Date.now(), rows: Array.from({ length: 96 }, (_, id) => ({ id })) });
  const legacy = readSearchCache("legacy");
  assert.equal(legacy.evidence.status, "unverified");
  assert.equal(legacy.evidence.totalKind, "available");
  assert.equal(legacy.hasMore, false, "A full page is not evidence that another page exists");
  assert.equal(legacy.nextPage, null);
  writeSearchCache("broken", { ...response, evidence: { ...complete, source: "snapshot" } });
  assert.equal(readSearchCache("broken").evidence.status, "unverified");
  writeSearchCache("broken", { ...response, evidence: undefined });
  assert.equal(readSearchCache("broken").evidence.totalKind, "available");
});

test("expired, malformed and impossible pagination caches cannot establish a next page", () => {
  stored = JSON.stringify({ key: "old", at: Date.now() - 60001, response });
  assert.equal(readSearchCache("old"), null);
  stored = JSON.stringify({ key: "old", at: "invalid", response });
  assert.equal(readSearchCache("old"), null);
  writeSearchCache("self", { ...response, page: 40, nextPage: 40, hasMore: true });
  assert.equal(readSearchCache("self").nextPage, null);
  assert.equal(readSearchCache("self").hasMore, false);
});

test("cache identity covers area, filters, ranking, city and sub-100m location changes", () => {
  const base = { lat: 49.9, lng: -97.1, radiusKm: 25, sort: "distance", ageGroup: "any" };
  for (const patch of [{ city: "Winnipeg" }, { lat: 49.9001 }, { filters: "fr" }, { ranking: "infant" }, { page: 2 }, { claimLive: true }]) {
    assert.notEqual(searchCacheKey({ ...base, ...patch }), searchCacheKey(base));
  }
  assert.notEqual(searchCacheKey({ ...base, label: "a:b", q: "c" }), searchCacheKey({ ...base, label: "a", q: "b:c" }));
});

test("old in-flight responses cannot win after retry, filter changes or back navigation", () => {
  const gate = createSearchRequestGate();
  gate.select("all");
  const first = gate.begin("all");
  gate.invalidate(); // synchronous Retry, before effect setup
  assert.equal(gate.accepts(first), false);
  const retry = gate.begin("all");
  assert.equal(gate.accepts(retry), true);
  gate.select("fr");
  assert.equal(gate.accepts(retry), false);
  const french = gate.begin("fr");
  gate.select("all");
  assert.equal(gate.accepts(first), false, "Back must not revive the first visit's request");
  assert.equal(gate.accepts(french), false);
  const back = gate.begin("all");
  assert.equal(gate.accepts(back), true);
  gate.invalidate(); // timeout
  assert.equal(gate.accepts(back), false);
});

test("route retries page and active map with fresh server retrieval and guards both channels", () => {
  const route = readFileSync(new URL("../src/routes/search.tsx", import.meta.url), "utf8");
  assert.match(route, /searchDaycarePage\(\{ data: \{ \.\.\.data, refresh: fresh \}, signal: controller\.signal \}\)/);
  assert.match(route, /searchDaycareMap\(\{ data: \{[^\n]*refresh: retryRequest\?\.mapKey === searchMapKey/);
  assert.match(route, /pageGate\.current\.invalidate\(\);\s*mapGate\.current\.invalidate\(\)/);
  assert.doesNotMatch(route, /dedupedQuery\(`search-(?:page|map):/);
  assert.match(route, /if \(!current\(\)\) return;[\s\S]*writeSearchCache\(pageKey, response\)/);
  assert.match(route, /nextPage > resultPage && nextPage <= SEARCH_PAGE_MAX/);
  assert.match(route, /data-ke="search-page-limit"/);
});


test("a loader paint-budget return cancels only its own HTTP read and removes its Router listener", () => {
  const router = new AbortController();
  const pending = createSearchLoaderRead(router.signal);
  pending.finish(false);
  assert.equal(pending.signal.aborted, true);
  assert.equal(router.signal.aborted, false, "Never cancel Router navigation");
  const ready = createSearchLoaderRead(router.signal);
  ready.finish(true);
  router.abort();
  assert.equal(ready.signal.aborted, false, "Finished reads no longer listen to Router cancellation");
});

test("Router cancellation is forwarded to a still-active loader read", () => {
  const router = new AbortController();
  const read = createSearchLoaderRead(router.signal);
  const reason = new DOMException("Superseded navigation", "AbortError");
  router.abort(reason);
  assert.equal(read.signal.aborted, true);
  assert.equal(read.signal.reason, reason);
  assert.equal(createSearchLoaderRead(router.signal).signal.aborted, true);
});
