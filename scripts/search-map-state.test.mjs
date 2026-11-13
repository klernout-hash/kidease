import assert from "node:assert/strict";
import test from "node:test";
import { searchMapState } from "../src/lib/search-map-state.ts";
import { searchCacheKey } from "../src/lib/search-cache.ts";

test("unknown or missing location settles without loading or exposing previous pins", () => {
  const result = { key: "before", pins: [{ id: "previous" }], total: 1 };
  assert.deepEqual(searchMapState({ canSearch: false, key: "before", result, failedKey: null }), { kind: "location", result: null });
  assert.deepEqual(searchMapState({ canSearch: false, key: "unknown", result, failedKey: "unknown" }), { kind: "location", result: null });
});

test("filter changes, failures, recovery and back navigation are scoped by request identity", () => {
  const result = { key: "french", pins: [{ id: "fr" }], total: 1 };
  const state = (key, failedKey = null) => searchMapState({ canSearch: true, key, result, failedKey });
  assert.equal(state("all").kind, "loading");
  assert.equal(state("all").result, null);
  assert.equal(state("all", "french").kind, "loading");
  assert.equal(state("all", "all").kind, "error");
  assert.equal(state("all", null).kind, "loading");
  assert.equal(state("french").kind, "ready");
  assert.equal(state("french").result.pins[0].id, "fr");
});

test("predicate and radius changes cannot reuse an unfiltered client page cache", () => {
  const base = { lat: 49.9, lng: -97.1, radiusKm: 25, sort: "distance", ageGroup: "any" };
  const all = searchCacheKey(base);
  assert.notEqual(searchCacheKey({ ...base, filters: '{"pioneer":{"spoken":"fr"}}' }), all);
  assert.notEqual(searchCacheKey({ ...base, radiusKm: 10 }), all);
  assert.notEqual(searchCacheKey({ ...base, page: 2 }), all);
});


test("pending and failed retries cannot present an older same-key map as current", () => {
  const result = { key: "all", pins: [{ id: "old" }], total: 100 };
  assert.equal(searchMapState({ canSearch: true, key: "all", result, failedKey: "all" }).kind, "error");
  const pending = searchMapState({ canSearch: true, key: "all", result, failedKey: null, pendingKey: "all" });
  assert.equal(pending.kind, "loading");
  assert.equal(pending.result, null);
});
