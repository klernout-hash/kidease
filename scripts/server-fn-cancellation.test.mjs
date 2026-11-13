import assert from "node:assert/strict";
import test from "node:test";
import { createServerFnFetch, SERVER_FN_ATTEMPT_CAP } from "../src/lib/server-fn-client.ts";

const url = "http://localhost/_serverFn/search";
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const ok = () => new Response("ok", { status: 200 });

test("an aborted queued read rejects promptly without calling fetch or bypassing its predecessor", { timeout: 1000 }, async () => {
  const firstResponse = deferred();
  const controller = new AbortController();
  let calls = 0;
  const fetcher = createServerFnFetch({ fetchImpl: async () => ++calls === 1 ? firstResponse.promise : ok() });
  const first = fetcher(url);
  await flush();
  const queued = fetcher(url, { signal: controller.signal });
  const cancelled = assert.rejects(queued, { name: "AbortError" });
  const third = fetcher(url);
  controller.abort();
  await cancelled;
  await flush();
  assert.equal(calls, 1, "Unrelated reads still wait for the active predecessor");
  firstResponse.resolve(ok());
  assert.equal((await first).status, 200);
  assert.equal((await third).status, 200);
  assert.equal(calls, 2, "The cancelled queued read did not reach fetch");
});

test("abort ends an in-flight await and releases its slot without retries or circuit failures", { timeout: 1000 }, async () => {
  const never = deferred();
  const controller = new AbortController();
  let calls = 0;
  let receivedSignal;
  const fetcher = createServerFnFetch({ fetchImpl: async (_input, init) => {
    calls++;
    receivedSignal = init?.signal;
    return calls === 1 ? never.promise : ok();
  } });
  const old = fetcher(url, { signal: controller.signal });
  const cancelled = assert.rejects(old, { name: "AbortError" });
  await flush();
  assert.equal(receivedSignal, controller.signal, "Native fetch receives the same signal");
  const fresh = fetcher(url);
  controller.abort();
  await cancelled;
  assert.equal((await fresh).status, 200);
  assert.equal(calls, 2);
  never.reject(new Error("Late old failure is observed"));
  await flush();
  assert.equal((await fetcher(url)).status, 200);
  assert.equal(calls, 3);
});

test("Request.signal cancels, while an explicit init.signal follows native fetch precedence", { timeout: 1000 }, async () => {
  const requestController = new AbortController();
  const pending = deferred();
  let passed;
  const fetcher = createServerFnFetch({ fetchImpl: async (_input, init) => { passed = init?.signal; return pending.promise; } });
  const request = new Request(url, { signal: requestController.signal });
  const call = fetcher(request);
  const cancelled = assert.rejects(call, { name: "AbortError" });
  await flush();
  assert.equal(passed, request.signal);
  requestController.abort(); await cancelled;
  const explicit = new AbortController();
  const override = fetcher(request, { signal: explicit.signal });
  const overrideCancelled = assert.rejects(override, { name: "AbortError" });
  await flush();
  assert.equal(passed, explicit.signal);
  explicit.abort(); await overrideCancelled;
  pending.resolve(ok());
});

test("abort interrupts backoff promptly and preserves the real failure's retry-after guard", { timeout: 1000 }, async () => {
  const sleeping = deferred();
  const controller = new AbortController();
  const delays = [];
  let time = 0, calls = 0;
  const fetcher = createServerFnFetch({ now: () => time, sleep: (ms) => { delays.push(ms); return sleeping.promise; },
    fetchImpl: async () => ++calls === 1 ? new Response("busy", { status: 503, headers: { "retry-after": "2" } }) : ok() });
  const read = fetcher(url, { signal: controller.signal });
  const cancelled = assert.rejects(read, { name: "AbortError" });
  await flush();
  assert.deepEqual(delays, [2000]);
  controller.abort(); await cancelled;
  assert.equal(calls, 1, "Cancellation did not retry the request");
  time = 2001;
  assert.equal((await fetcher(url)).status, 200);
  assert.equal(calls, 2, "A cancelled backoff no longer owns the function queue");
  sleeping.resolve();
});

test("a pre-aborted signal causes no fetch, including after another active read", { timeout: 1000 }, async () => {
  let calls = 0;
  const controller = new AbortController(); controller.abort();
  const fetcher = createServerFnFetch({ fetchImpl: async () => { calls++; return ok(); } });
  await assert.rejects(fetcher(url, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 0);
  assert.equal((await fetcher(url)).status, 200);
});

test("no-signal transient failures retain four attempts, Retry-After and circuit behavior", async () => {
  let calls = 0, time = 0;
  const delays = [];
  const fetcher = createServerFnFetch({ now: () => time, sleep: async (ms) => { delays.push(ms); time += ms; },
    fetchImpl: async () => { calls++; return new Response("busy", { status: 503, headers: { "retry-after": "1" } }); } });
  assert.equal((await fetcher(url)).status, 503);
  assert.equal(calls, SERVER_FN_ATTEMPT_CAP);
  assert.deepEqual(delays, [1000, 1000, 1000]);
  await assert.rejects(fetcher(url), /Too many requests/);
  assert.equal(calls, SERVER_FN_ATTEMPT_CAP);
});
