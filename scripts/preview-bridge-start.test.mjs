import assert from "node:assert/strict";
import { test } from "node:test";
import { startPreviewHostBridge } from "../src/lib/preview-bridge-start.ts";
import { installZodCsp } from "../src/lib/zod-csp.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(t, { framed = true, referrer = "http://127.0.0.1:8092/parent" } = {}) {
  const listeners = new Map();
  const disposals = [];
  const messages = [];
  const movements = [];
  const location = new URL("http://127.0.0.1:8092/");
  location.ancestorOrigins = [];
  const history = {
    state: null,
    length: 1,
    pushState(state, _unused, value) { this.state = state; location.href = new URL(value || location.href, location).href; },
    replaceState(state, _unused, value) { this.state = state; location.href = new URL(value || location.href, location).href; },
    go(delta) { movements.push(delta); },
  };
  const parent = { postMessage(message, origin) { messages.push({ message, origin }); } };
  const window = {
    location, history, parent,
    addEventListener(type, fn) { const set = listeners.get(type) ?? new Set(); set.add(fn); listeners.set(type, set); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) ?? []) fn(event); },
  };
  if (!framed) window.parent = window;
  const restore = [];
  for (const [key, value] of Object.entries({ window, location, document: { referrer } })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    restore.push(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
  t.after(() => {
    disposals.reverse().forEach((dispose) => dispose());
    restore.reverse().forEach((undo) => undo());
  });
  return {
    window, parent, messages, movements, listeners, disposals,
    message(data, { origin = "http://127.0.0.1:8092", source = parent } = {}) {
      window.dispatchEvent({ type: "message", data, origin, source });
    },
  };
}

test("top-level and untrusted frames do not load bridge schemas", async (t) => {
  for (const input of [{ framed: false }, { referrer: "https://untrusted.invalid/" }]) {
    await t.test(JSON.stringify(input), (sub) => {
      fixture(sub, input);
      let loads = 0;
      const stop = startPreviewHostBridge({ navigate: assert.fail, routeTree: {} }, {
        load: async () => { loads += 1; throw new Error("unexpected import"); },
        onError: assert.fail,
      });
      stop();
      assert.equal(loads, 0);
    });
  }
});

test("teardown before a delayed import prevents installation", async () => {
  let deliver;
  let installed = 0;
  const stop = startPreviewHostBridge({ navigate: assert.fail, routeTree: {} }, {
    eligible: () => true,
    load: () => new Promise((resolve) => { deliver = resolve; }),
    onError: assert.fail,
  });
  stop();
  deliver({ installPreviewHostBridge: () => { installed += 1; return () => {}; } });
  await tick();
  assert.equal(installed, 0);
});

test("the real framed bridge handshakes, validates navigation, protects history, and disposes", { timeout: 5_000 }, async (t) => {
  const f = fixture(t);
  installZodCsp();
  const navigations = [];
  let loads = 0;
  let installed;
  const ready = new Promise((resolve) => { installed = resolve; });
  const stop = startPreviewHostBridge({
    navigate: (path) => navigations.push(path),
    routeTree: { fullPath: "/", children: [{ fullPath: "/search" }, { fullPath: "/fr/search" }] },
  }, {
    load: async () => {
      loads += 1;
      const bridge = await import("../src/lib/preview-host-bridge.ts");
      return {
        ...bridge,
        installPreviewHostBridge(options) {
          const dispose = bridge.installPreviewHostBridge(options);
          installed();
          return dispose;
        },
      };
    },
    onError: assert.fail,
  });
  f.disposals.push(stop);
  await ready;
  assert.equal(loads, 1);
  assert.deepEqual(f.messages.map((entry) => entry.message.type), ["location", "routes", "ready"]);
  assert.deepEqual(f.messages[1].message.paths, ["/", "/search", "/fr/search"]);
  assert.ok(f.messages.every((entry) => entry.origin === "http://127.0.0.1:8092"));
  const envelope = { channel: "grok-preview-bridge", version: 1 };
  f.message({ ...envelope, type: "hello" });
  assert.equal(f.messages.length, 6);
  f.message({ ...envelope, type: "navigate", path: "/search?q=Winnipeg#list" });
  await tick();
  assert.deepEqual(navigations, ["/search?q=Winnipeg#list"]);
  for (const data of [
    { ...envelope, type: "navigate", path: "//external.invalid/" },
    { ...envelope, type: "navigate", path: "/\\external.invalid/" },
    { ...envelope, version: 2, type: "navigate", path: "/fr/search" },
  ]) f.message(data);
  f.message({ ...envelope, type: "navigate", path: "/fr/search" }, { origin: "https://untrusted.invalid" });
  f.message({ ...envelope, type: "navigate", path: "/fr/search" }, { source: {} });
  assert.equal(navigations.length, 1);
  f.message({ ...envelope, type: "history", delta: -1 });
  assert.deepEqual(f.movements, []);
  f.window.history.pushState({}, "", "/search");
  f.message({ ...envelope, type: "history", delta: -1 });
  f.message({ ...envelope, type: "history", delta: 1 });
  assert.deepEqual(f.movements, [-1, 1]);
  stop();
  stop();
  assert.ok([...f.listeners.values()].every((set) => set.size === 0));
  const count = f.messages.length;
  f.window.history.pushState({}, "", "/fr/search");
  f.message({ ...envelope, type: "hello" });
  assert.equal(f.messages.length, count);
});
