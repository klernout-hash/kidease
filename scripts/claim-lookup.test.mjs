import assert from "node:assert/strict";
import { test } from "node:test";
import { startClaimLookup } from "../src/lib/claim-lookup.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

function clock(t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  return async (ms) => { t.mock.timers.tick(ms); await flush(); };
}

test("short input does not dispatch a lookup", async (t) => {
  const tick = clock(t);
  const states = [];
  let reads = 0;
  startClaimLookup(" a ", async () => { reads += 1; return []; }, (state) => states.push(state));
  await tick(20000);
  assert.equal(reads, 0);
  assert.deepEqual(states, [{ query: "a", status: "idle", hits: [] }]);
});

test("a successful empty read is distinct from a failed lookup", async (t) => {
  const tick = clock(t);
  const empty = [];
  const failed = [];
  startClaimLookup("Synthetic Unknown", async () => [], (state) => empty.push(state));
  startClaimLookup("Synthetic Lotus", async () => { throw new Error("offline"); }, (state) => failed.push(state));
  await tick(180);
  assert.equal(empty.at(-1).status, "ready");
  assert.deepEqual(empty.at(-1).hits, []);
  assert.equal(failed.at(-1).status, "error");
  assert.equal(failed.at(-1).query, "Synthetic Lotus");
  assert.deepEqual(failed.at(-1).hits, []);
});

test("loading is immediate and the request remains debounced", async (t) => {
  const tick = clock(t);
  const states = [];
  const request = deferred();
  let reads = 0;
  startClaimLookup("  Synthetic Lotus  ", (query) => {
    reads += 1;
    assert.equal(query, "Synthetic Lotus");
    return request.promise;
  }, (state) => states.push(state));
  assert.deepEqual(states, [{ query: "Synthetic Lotus", status: "loading", hits: [] }]);
  await tick(179);
  assert.equal(reads, 0);
  await tick(1);
  assert.equal(reads, 1);
  request.resolve([{ id: "synthetic-lotus" }]);
  await flush();
  assert.deepEqual(states.at(-1), { query: "Synthetic Lotus", status: "ready", hits: [{ id: "synthetic-lotus" }] });
});

test("a hung request reaches an error and cannot later replace it", async (t) => {
  const tick = clock(t);
  const states = [];
  const request = deferred();
  startClaimLookup("Synthetic Lotus", () => request.promise, (state) => states.push(state), { timeoutMs: 500 });
  await tick(180);
  await tick(499);
  assert.equal(states.at(-1).status, "loading");
  await tick(1);
  assert.equal(states.at(-1).status, "error");
  request.resolve([{ id: "late-result" }]);
  await flush();
  assert.equal(states.length, 2);
  assert.equal(states.at(-1).status, "error");
});

test("retrying the same query can recover without stale error or results", async (t) => {
  const tick = clock(t);
  const states = [];
  const cancel = startClaimLookup("Synthetic Lotus", async () => { throw new Error("offline"); }, (state) => states.push(state));
  await tick(180);
  assert.equal(states.at(-1).status, "error");
  cancel();
  startClaimLookup("Synthetic Lotus", async () => [{ id: "lotus" }], (state) => states.push(state));
  assert.deepEqual(states.at(-1), { query: "Synthetic Lotus", status: "loading", hits: [] });
  await tick(180);
  assert.deepEqual(states.at(-1), { query: "Synthetic Lotus", status: "ready", hits: [{ id: "lotus" }] });
});

test("an earlier query cannot replace newer results", async (t) => {
  const tick = clock(t);
  const states = [];
  const oldRequest = deferred();
  const cancelOld = startClaimLookup("Synthetic Juniper", () => oldRequest.promise, (state) => states.push(state));
  await tick(180);
  cancelOld();
  startClaimLookup("Synthetic Lotus", async () => [{ id: "lotus" }], (state) => states.push(state));
  await tick(180);
  oldRequest.resolve([{ id: "juniper" }]);
  await flush();
  assert.deepEqual(states.at(-1), { query: "Synthetic Lotus", status: "ready", hits: [{ id: "lotus" }] });
  assert.equal(states.some((state) => state.status === "ready" && state.query === "Synthetic Juniper"), false);
});

test("leaving before debounce cancels dispatch; leaving in flight cancels updates", async (t) => {
  const tick = clock(t);
  let reads = 0;
  const cancelled = [];
  const stop = startClaimLookup("Synthetic Juniper", async () => { reads += 1; return []; }, (state) => cancelled.push(state));
  stop();
  await tick(180);
  assert.equal(reads, 0);
  assert.equal(cancelled.length, 1);

  const request = deferred();
  const states = [];
  const stopInFlight = startClaimLookup("Synthetic Lotus", () => request.promise, (state) => states.push(state));
  await tick(180);
  stopInFlight();
  request.reject(new Error("request ended after unmount"));
  await flush();
  await tick(20000);
  assert.equal(states.length, 1);
});
