import assert from "node:assert/strict";
import { test } from "node:test";
import { createCoalescedTask } from "../src/lib/coalesced-task.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("slow reads stay serial and a burst reads the latest camera once", async () => {
  let camera = "Montreal";
  let active = 0;
  let peak = 0;
  const cameras = [];
  const releases = [];
  const queue = createCoalescedTask(async () => {
    active += 1;
    peak = Math.max(peak, active);
    cameras.push(camera);
    await new Promise((resolve) => releases.push(resolve));
    active -= 1;
  });

  queue.run();
  for (const next of ["Ottawa", "Toronto", "Winnipeg"]) {
    camera = next;
    queue.run();
  }
  assert.deepEqual(cameras, ["Montreal"]);
  releases.shift()();
  await tick();
  assert.deepEqual(cameras, ["Montreal", "Winnipeg"]);
  assert.equal(peak, 1);
  releases.shift()();
  await tick();
  assert.equal(active, 0);
  assert.equal(cameras.length, 2);
  queue.dispose();
});

test("a failed read does not strand the queued latest camera", async () => {
  let calls = 0;
  let rejectFirst;
  const queue = createCoalescedTask(async () => {
    calls += 1;
    if (calls === 1) await new Promise((_resolve, reject) => { rejectFirst = reject; });
  });
  queue.run();
  queue.run();
  rejectFirst(new Error("connection interrupted"));
  await tick();
  assert.equal(calls, 2);
  queue.dispose();
});

test("disposing drops queued work and ignores later camera changes", async () => {
  let calls = 0;
  let release;
  const queue = createCoalescedTask(async () => {
    calls += 1;
    await new Promise((resolve) => { release = resolve; });
  });
  queue.run();
  queue.run();
  queue.dispose();
  release();
  await tick();
  queue.run();
  assert.equal(calls, 1);
});
