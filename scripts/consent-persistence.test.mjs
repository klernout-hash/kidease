import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANALYTICS_CONSENT_KEY,
  readAnalyticsConsent,
  restoreNativeAnalyticsConsent,
} from "../src/lib/analytics-consent.ts";

for (const choice of ["granted", "denied"]) {
  test(`copies ${choice} out of the WebView and restores it after storage is cleared`, async () => {
    const web = new Map([[ANALYTICS_CONSENT_KEY, choice]]);
    const storage = {
      getItem: (key) => web.get(key) ?? null,
      setItem: (key, value) => web.set(key, value),
    };
    const native = new Map();
    const preferences = {
      get: async ({ key }) => ({ value: native.get(key) ?? null }),
      set: async ({ key, value }) => native.set(key, value),
    };
    assert.equal(await restoreNativeAnalyticsConsent(preferences, storage), choice);
    assert.equal(native.get(ANALYTICS_CONSENT_KEY), choice);
    web.clear();
    assert.equal(await restoreNativeAnalyticsConsent(preferences, storage), choice);
    assert.equal(readAnalyticsConsent(storage), choice);
  });
}

test("blocked browser storage fails closed", () => {
  const previous = globalThis.window;
  try {
    globalThis.window = { get localStorage() { throw new Error("blocked"); } };
    assert.equal(readAnalyticsConsent(), "unset");
  } finally {
    globalThis.window = previous;
  }
});
