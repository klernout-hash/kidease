import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getDeviceLocation, watchDeviceLocation } from "../src/lib/native.ts";

function browser(t, query) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const calls = [];
  const coords = { latitude: 51, longitude: -114, accuracy: 20 };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      permissions: query ? { query } : undefined,
      geolocation: {
        getCurrentPosition(ok) { calls.push("get"); ok({ coords }); },
        watchPosition(ok) { calls.push("watch"); ok({ coords }); return 0; },
        clearWatch(id) { calls.push(["clear", id]); },
      },
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  });
  return calls;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("only an explicit request can call geolocation while the OS would prompt", async (t) => {
  const calls = browser(t, async () => ({ state: "prompt" }));
  assert.equal(await getDeviceLocation({ precise: true, allowPrompt: false }), null);
  const stop = watchDeviceLocation(() => assert.fail("no automatic fix without permission"));
  await flush();
  stop();
  assert.deepEqual(calls, []);
  assert.deepEqual(await getDeviceLocation({ precise: true }), { lat: 51, lng: -114, accuracyM: 20 });
  assert.deepEqual(calls, ["get"]);
});

test("permission unavailable does not fall back to an automatic prompt", async (t) => {
  const calls = browser(t, undefined);
  assert.equal(await getDeviceLocation({ allowPrompt: false }), null);
  const stop = watchDeviceLocation(() => assert.fail("unconfirmed permission"));
  await flush();
  stop();
  assert.deepEqual(calls, []);
});

test("existing OS permission permits silent reads and cleans up a running watch", async (t) => {
  const calls = browser(t, async () => ({ state: "granted" }));
  assert.equal((await getDeviceLocation({ allowPrompt: false }))?.lat, 51);
  const stop = watchDeviceLocation((fix) => assert.equal(fix.lat, 51));
  await flush();
  stop();
  assert.deepEqual(calls, ["get", "watch", ["clear", 0]]);
});

test("leaving before the permission check resolves does not start a watch", async (t) => {
  let resolve;
  const calls = browser(t, () => new Promise((done) => { resolve = done; }));
  watchDeviceLocation(() => assert.fail("stopped watch"))();
  resolve({ state: "granted" });
  await flush();
  assert.deepEqual(calls, []);
});

test("both boot reads explicitly disallow prompting", () => {
  for (const path of ["../src/components/native-boot.tsx", "../src/lib/search-origin.ts"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /getDeviceLocation\(\{ precise: true, allowPrompt: false \}\)/);
  }
});
