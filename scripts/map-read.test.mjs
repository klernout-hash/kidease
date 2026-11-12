import assert from "node:assert/strict";
import { test } from "node:test";
import { createCoalescedTask } from "../src/lib/coalesced-task.ts";
import { waitForMapRetry, withMapReadDeadline } from "../src/lib/map-read.ts";

test("a timed-out transport aborts before the latest queued camera starts", async () => {
  const lifetime = new AbortController();
  let active = 0;
  let peak = 0;
  let calls = 0;
  let firstSignal;
  let finishSecond;
  const second = new Promise((resolve) => { finishSecond = resolve; });
  const queue = createCoalescedTask(async () => {
    await withMapReadDeadline(async (signal) => {
      calls += 1;
      active += 1;
      peak = Math.max(peak, active);
      if (calls === 1) {
        firstSignal = signal;
        await new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            active -= 1;
            reject(signal.reason);
          }, { once: true });
        });
      } else {
        assert.equal(firstSignal.aborted, true);
        assert.equal(firstSignal.reason.name, "TimeoutError");
        active -= 1;
        finishSecond();
      }
    }, lifetime.signal, 20);
  });
  queue.run();
  queue.run();
  await second;
  assert.equal(calls, 2);
  assert.equal(peak, 1);
  assert.equal(active, 0);
  queue.dispose();
});

test("teardown aborts an active transport and skips already-aborted reads", async () => {
  const lifetime = new AbortController();
  let received;
  const pending = withMapReadDeadline((signal) => {
    received = signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  }, lifetime.signal);
  lifetime.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(received.aborted, true);
  let called = false;
  await assert.rejects(withMapReadDeadline(async () => { called = true; }, lifetime.signal), { name: "AbortError" });
  assert.equal(called, false);
});

test("teardown cancels a throttled request's retry delay", async () => {
  const lifetime = new AbortController();
  const pending = waitForMapRetry(8_000, lifetime.signal);
  lifetime.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(waitForMapRetry(8_000, lifetime.signal), { name: "AbortError" });
});
