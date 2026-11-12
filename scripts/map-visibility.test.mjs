import assert from "node:assert/strict";
import { test } from "node:test";
import { whenMapHostVisible } from "../src/lib/osm-map.ts";

test("map initialization waits until an offscreen host enters the viewport", async (t) => {
  let observer;
  let disconnected = false;
  class Observer {
    constructor(callback, options) {
      observer = { callback, options };
    }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const originalWindow = globalThis.window;
  const originalObserver = globalThis.IntersectionObserver;
  globalThis.window = { innerWidth: 390, innerHeight: 844 };
  globalThis.IntersectionObserver = Observer;
  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.IntersectionObserver = originalObserver;
  });
  const host = { getBoundingClientRect: () => ({ width: 390, height: 300, top: 900, bottom: 1200, left: 0, right: 390 }) };
  let started = false;
  const ready = whenMapHostVisible(host).then(() => { started = true; });
  await Promise.resolve();
  assert.equal(started, false);
  assert.equal(observer.options.rootMargin, "0px");
  observer.callback([{ isIntersecting: false }]);
  await Promise.resolve();
  assert.equal(started, false);
  observer.callback([{ isIntersecting: true }]);
  await ready;
  assert.equal(started, true);
  assert.equal(disconnected, true);
});

test("closing an offscreen map disconnects its observer without starting it", async (t) => {
  let disconnected = false;
  const originalWindow = globalThis.window;
  const originalObserver = globalThis.IntersectionObserver;
  globalThis.window = { innerWidth: 390, innerHeight: 844 };
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() { disconnected = true; }
  };
  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.IntersectionObserver = originalObserver;
  });
  const host = { getBoundingClientRect: () => ({ width: 390, height: 300, top: 900, bottom: 1200, left: 0, right: 390 }) };
  const controller = new AbortController();
  const ready = whenMapHostVisible(host, controller.signal);
  controller.abort();
  await assert.rejects(ready, { name: "AbortError" });
  assert.equal(disconnected, true);
});
