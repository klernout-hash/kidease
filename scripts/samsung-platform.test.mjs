import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { STORE_PAYMENTS_ENABLED } from "../src/lib/native-entitlements.ts";
import {
  SAMSUNG_PUSH_FALLBACK_MESSAGE,
  galaxyStoreDeepLink,
  galaxyStoreHttps,
  samsungPlatformContext,
  samsungPushFallback,
  samsungStoreLinks,
} from "../src/lib/samsung/platform.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("Samsung flags stay off and do not change push or the store link", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_SAMSUNG_STORE_LINK, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_SAMSUNG_PUSH_FALLBACK, false);
  assert.deepEqual(samsungPlatformContext({}), {});
  assert.equal(samsungStoreLinks(false), null);
  assert.equal(samsungPushFallback(false, "samsung", false), "unchanged");
  assert.equal(samsungPushFallback(true, "google", false), "unchanged");
  assert.equal(samsungPushFallback(true, "samsung", true), "unchanged");
  assert.equal(STORE_PAYMENTS_ENABLED.samsung, false);
});

test("the Galaxy Store link and the no-Play-services fallback turn on separately", () => {
  const links = samsungStoreLinks(true);
  assert.equal(links?.https, "https://galaxystore.samsung.com/detail/ca.kidease.app");
  assert.equal(links?.deep, "samsungapps://ProductDetail/ca.kidease.app");
  assert.equal(galaxyStoreHttps(), links?.https);
  assert.equal(galaxyStoreDeepLink(), links?.deep);
  assert.equal(samsungPushFallback(true, "samsung", false), "skip");
  assert.match(SAMSUNG_PUSH_FALLBACK_MESSAGE, /Play services/);
  assert.doesNotMatch(SAMSUNG_PUSH_FALLBACK_MESSAGE, /government|state/i);
  assert.deepEqual(samsungPlatformContext({ FEATURE_SAMSUNG_STORE_LINK: "1" }), { samsungStore: true });
  assert.match(src("src/lib/push-client.ts"), /samsungPushFallback/);
  assert.match(src("src/components/push-explain.tsx"), /samsungFallback: true/);
});
