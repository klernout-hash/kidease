import assert from "node:assert/strict";
import test from "node:test";
import { dedupedQuery, resetDedupedQueries } from "../src/lib/fn-query.ts";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function cached() { return dedupedQuery("same", 30000, async () => "unexpected rebuild"); }

test("older success cannot replace a completed fresh retry", async () => {
  resetDedupedQueries();
  const a = deferred(), b = deferred();
  const old = dedupedQuery("same", 30000, () => a.promise);
  const fresh = dedupedQuery("same", 30000, () => b.promise, { fresh: true });
  b.resolve("fresh"); assert.equal(await fresh, "fresh");
  a.resolve("old"); assert.equal(await old, "old");
  assert.equal(await cached(), "fresh");
});

test("older failure cannot delete the pending or completed fresh retry", async () => {
  for (const finishFirst of [false, true]) {
    resetDedupedQueries();
    const a = deferred(), b = deferred();
    const old = dedupedQuery("same", 30000, () => a.promise);
    const rejected = assert.rejects(old, /old failed/);
    const fresh = dedupedQuery("same", 30000, () => b.promise, { fresh: true });
    if (finishFirst) { b.resolve("fresh"); await fresh; }
    a.reject(new Error("old failed")); await rejected;
    const joined = cached();
    if (!finishFirst) b.resolve("fresh");
    assert.equal(await fresh, "fresh");
    assert.equal(await joined, "fresh");
    assert.equal(await cached(), "fresh");
  }
});

test("older cacheIf false cannot delete the newer retry cache", async () => {
  resetDedupedQueries();
  const a = deferred(), b = deferred();
  const old = dedupedQuery("same", 30000, () => a.promise, { cacheIf: () => false });
  const fresh = dedupedQuery("same", 30000, () => b.promise, { fresh: true });
  b.resolve("fresh"); await fresh;
  a.resolve("partial"); assert.equal(await old, "partial");
  assert.equal(await cached(), "fresh");
});

test("clean fresh retries preserve ordinary pending dedup and cacheIf rejection", async () => {
  resetDedupedQueries();
  const pending = deferred();
  const first = dedupedQuery("same", 30000, () => pending.promise);
  const second = dedupedQuery("same", 30000, async () => "unused");
  assert.equal(second, first);
  pending.resolve("first"); await first;
  assert.equal(await cached(), "first");
  assert.equal(await dedupedQuery("same", 30000, async () => "fresh", { fresh: true }), "fresh");
  assert.equal(await cached(), "fresh");
  assert.equal(await dedupedQuery("same", 30000, async () => "not cached", { fresh: true, cacheIf: () => false }), "not cached");
  assert.equal(await cached(), "unexpected rebuild");
});
