import assert from "node:assert/strict";
import { test } from "node:test";
import { createInflightRead } from "../src/lib/inflight-read.ts";

test("concurrent flag consumers share one read without retaining its snapshot", async () => {
  let calls = 0;
  let finish;
  const read = createInflightRead(async () => {
    calls += 1;
    return new Promise((resolve) => { finish = resolve; });
  });
  const first = read("anonymous-visitor");
  const second = read("anonymous-visitor");
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  const off = { reached: true, flags: { "smart-match": false } };
  finish(off);
  assert.equal(await first, off);
  assert.equal(await second, off);

  const next = read("anonymous-visitor");
  await Promise.resolve();
  assert.equal(calls, 2);
  const on = { reached: true, flags: { "smart-match": true } };
  finish(on);
  assert.equal(await next, on);
});

test("identity changes keep concurrent generations separate", async () => {
  const complete = new Map();
  const read = createInflightRead((id) => new Promise((resolve) => complete.set(id, resolve)));
  const anonymous = read("anonymous-visitor");
  const signedIn = read("signed-in-parent");
  await Promise.resolve();
  assert.equal(complete.size, 2);
  complete.get("anonymous-visitor")({ reached: false, flags: {} });
  await anonymous;
  assert.equal(read("signed-in-parent"), signedIn);
  const snapshot = { reached: true, flags: { "smart-match": true } };
  complete.get("signed-in-parent")(snapshot);
  assert.equal(await signedIn, snapshot);
});

test("a rejected read is removed so a later consumer can retry", async () => {
  let calls = 0;
  const read = createInflightRead(async () => {
    calls += 1;
    if (calls === 1) throw new Error("connection interrupted");
    return { reached: false, flags: {} };
  });
  await assert.rejects(read("anonymous-visitor"), /connection interrupted/);
  assert.deepEqual(await read("anonymous-visitor"), { reached: false, flags: {} });
  assert.equal(calls, 2);
});
