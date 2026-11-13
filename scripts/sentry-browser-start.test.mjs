import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSentryBrowserStart,
  afterBrowserInstrumentation,
  sentryBrowserEligible,
} from "../src/lib/sentry-browser-start.ts";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("the SDK is eligible only with a browser, the existing public DSN, and Allow on web or native", () => {
  for (const native of [false, true]) {
    for (const consent of ["unset", "denied", "granted"]) {
      const base = { browser: true, native, consent, dsn: "https://public@example.invalid/1" };
      assert.equal(sentryBrowserEligible(base), consent === "granted");
      assert.equal(sentryBrowserEligible({ ...base, browser: false }), false);
      assert.equal(sentryBrowserEligible({ ...base, dsn: "  " }), false);
    }
  }
});

test("missing consent does not import the SDK or defer the first paint; a later grant starts once", async () => {
  let allowed = false;
  let imports = 0;
  let inits = 0;
  const start = createSentryBrowserStart({
    eligible: () => allowed,
    load: async () => {
      imports += 1;
      return {
        initSentryBrowser: () => {
          inits += 1;
          return true;
        },
      };
    },
    onError: assert.fail,
  });
  const first = start();
  assert.equal(first, null);
  let painted = false;
  afterBrowserInstrumentation(first, () => {
    painted = true;
  });
  assert.equal(painted, true);
  assert.equal(imports, 0);
  allowed = true;
  const granted = start();
  assert.equal(start(), granted);
  assert.equal(await granted, true);
  assert.equal(imports, 1);
  assert.equal(inits, 1);
  assert.equal(start(), granted);
});

test("an eligible first paint waits for SDK initialization and French copy without duplicate starts", async () => {
  const sdk = deferred();
  const copy = deferred();
  const events = [];
  const start = createSentryBrowserStart({
    eligible: () => true,
    load: () => {
      events.push("import");
      return sdk.promise;
    },
    onError: assert.fail,
  });
  const ready = start();
  afterBrowserInstrumentation(Promise.all([ready, copy.promise]), () => events.push("paint"));
  await Promise.resolve();
  assert.deepEqual(events, ["import"]);
  assert.equal(start(), ready);
  sdk.resolve({
    initSentryBrowser: () => {
      events.push("init");
      return true;
    },
  });
  assert.equal(await ready, true);
  assert.deepEqual(events, ["import", "init"]);
  copy.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["import", "init", "paint"]);
});

test("revocation while the SDK loads is rechecked by init and can be retried after another grant", async () => {
  const sdk = deferred();
  let allowed = true;
  let imports = 0;
  const start = createSentryBrowserStart({
    eligible: () => allowed,
    load: () => {
      imports += 1;
      return sdk.promise;
    },
    onError: assert.fail,
  });
  const first = start();
  await Promise.resolve();
  allowed = false;
  sdk.resolve({ initSentryBrowser: () => allowed });
  assert.equal(await first, false);
  assert.equal(start(), null);
  allowed = true;
  assert.equal(await start(), true);
  assert.equal(imports, 2);
});

test("optional SDK load/init failure allows paint and a later consent event may retry", async () => {
  for (const phase of ["load", "init"]) {
    let fails = true;
    const errors = [];
    const start = createSentryBrowserStart({
      eligible: () => true,
      load: async () => {
        if (fails && phase === "load") throw new Error("chunk failed");
        return {
          initSentryBrowser: () => {
            if (fails) throw new Error("init failed");
            return true;
          },
        };
      },
      onError: (error) => errors.push(error.message),
    });
    const events = [];
    const ready = start();
    afterBrowserInstrumentation(ready, () => events.push("paint"));
    assert.equal(await ready, false);
    assert.deepEqual(events, ["paint"]);
    assert.equal(errors.length, 1);
    fails = false;
    assert.equal(await start(), true);
  }
});

test("an unset DSN or unapproved consent causes zero SDK loads", () => {
  for (const dsn of ["", "https://public@example.invalid/1"]) {
    for (const consent of ["unset", "denied", "granted"]) {
      if (dsn && consent === "granted") continue;
      let loads = 0;
      const start = createSentryBrowserStart({
        eligible: () => sentryBrowserEligible({ browser: true, native: false, dsn, consent }),
        load: async () => {
          loads += 1;
          return { initSentryBrowser: () => true };
        },
        onError: assert.fail,
      });
      assert.equal(start(), null);
      assert.equal(loads, 0);
    }
  }
});

test("the consent-grant path starts vitals after eligible SDK init, or immediately without a DSN", async () => {
  const sdk = deferred();
  const events = [];
  const start = createSentryBrowserStart({
    eligible: () => true,
    load: () => sdk.promise,
    onError: assert.fail,
  });
  const ready = start();
  afterBrowserInstrumentation(ready, () => events.push("vitals"));
  assert.deepEqual(events, []);
  sdk.resolve({
    initSentryBrowser: () => {
      events.push("init");
      return true;
    },
  });
  assert.equal(await ready, true);
  assert.deepEqual(events, ["init", "vitals"]);
  afterBrowserInstrumentation(null, () => events.push("vitals-without-dsn"));
  assert.deepEqual(events, ["init", "vitals", "vitals-without-dsn"]);
});
