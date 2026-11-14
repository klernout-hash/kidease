import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { createServerFnFetch } from "../src/lib/server-fn-client.ts";

test("a real aborted fetch is attempted once and does not block the next map read", async (t) => {
  let received;
  const started = new Promise((resolve) => { received = resolve; });
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    if (requests === 1) received();
    else response.end("latest camera");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}/_serverFn/mapAbortProof`;
  let attempts = 0;
  let active = 0;
  let peak = 0;
  const waits = [];
  const gated = createServerFnFetch({
    fetchImpl: async (input, init) => {
      attempts += 1;
      active += 1;
      peak = Math.max(peak, active);
      try { return await fetch(input, init); }
      finally { active -= 1; }
    },
    sleep: async (ms) => { waits.push(ms); },
  });
  const controller = new AbortController();
  const first = gated(url, { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(attempts, 1);
  assert.equal(active, 0);
  assert.deepEqual(waits, []);
  const latest = await gated(url);
  assert.equal(await latest.text(), "latest camera");
  assert.equal(attempts, 2);
  assert.equal(peak, 1);
});

test("an already-cancelled Request never reaches the transport or retry circuit", async () => {
  let calls = 0;
  const gated = createServerFnFetch({ fetchImpl: async () => {
    calls += 1;
    return new Response("ready");
  } });
  const controller = new AbortController();
  controller.abort();
  const request = new Request("http://127.0.0.1/_serverFn/mapAbortProof", { signal: controller.signal });
  await assert.rejects(gated(request), { name: "AbortError" });
  assert.equal(calls, 0);
  assert.equal((await gated(request.url)).status, 200);
  assert.equal(calls, 1);
});

test("cancelling during Retry-After stops the wait and keeps genuine throttling intact", async () => {
  let clock = 0;
  let calls = 0;
  let enteredWait;
  const waiting = new Promise((resolve) => { enteredWait = resolve; });
  const gated = createServerFnFetch({
    now: () => clock,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("throttled", { status: 429, headers: { "retry-after": "1" } })
        : new Response("ready");
    },
    sleep: async (ms) => {
      assert.equal(ms, 1000);
      enteredWait();
      return new Promise(() => {});
    },
  });
  const controller = new AbortController();
  const first = gated("/_serverFn/mapAbortProof", { signal: controller.signal });
  await waiting;
  controller.abort();
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(calls, 1);
  clock = 1001;
  assert.equal((await gated("/_serverFn/mapAbortProof")).status, 200);
  assert.equal(calls, 2);
});
