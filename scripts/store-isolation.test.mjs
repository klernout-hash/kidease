import test from "node:test";
import assert from "node:assert/strict";
import { signInChoicesForChannel } from "../src/lib/auth/providers.ts";
import { amazonBuildOnAmazonDevice } from "../src/lib/amazon/gate.ts";
import { storeChannelFromSignals } from "../src/lib/native-entitlements.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN, SOURCE_STORES, scanBuffers, scanRepoSources } from "./check-store-isolation.mjs";

const BASE = "Mozilla/5.0 (Linux; Android 11; KFTRWI) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const STORES = {
  web: { ua: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120", own: ["apple", "google", "facebook"] },
  ios: { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) KidEaseNative", own: ["apple", "google", "facebook"] },
  play: { ua: `${BASE} KidEaseNative`, own: ["google", "facebook"] },
  samsung: { ua: `${BASE} KidEaseNative KidEaseStoreSamsung`, own: ["google", "facebook"] },
  huawei: { ua: `${BASE} KidEaseNative KidEaseStoreHuawei KidEaseNoGms`, own: ["huawei", "facebook"] },
  microsoft: { ua: "Mozilla/5.0 (Windows NT 10.0) KidEaseNative KidEaseStoreMicrosoft", own: ["apple", "google", "facebook"] },
  amazon: { ua: `${BASE} KidEaseNative KidEaseStoreAmazon KidEaseNoGms KidEaseAmazonDevice`, own: ["amazon", "facebook"] },
};
const STORE_ONLY_BUTTONS = { amazon: "amazon", huawei: "huawei" };

for (const [store, { ua, own }] of Object.entries(STORES)) {
  test(`${store}: no other store's sign-in buttons or Amazon UI`, () => {
    const channel = storeChannelFromSignals({ userAgent: ua });
    const choices = signInChoicesForChannel(channel).filter((c) => c !== "email");
    for (const [owner, button] of Object.entries(STORE_ONLY_BUTTONS)) {
      if (owner !== store) assert.ok(!choices.includes(button), `${store} shows ${button}`);
    }
    for (const c of choices) assert.ok(own.includes(c), `${store} shows ${c}`);
    assert.equal(amazonBuildOnAmazonDevice({ userAgent: ua }), store === "amazon");
  });
}

test("dex scan catches leaks and passes clean builds", () => {
  const dex = (s) => [{ name: "classes.dex", buf: Buffer.from(s, "latin1") }];
  assert.deepEqual(scanBuffers("play", dex("Lca/kidease/app/MainActivity;")), []);
  assert.deepEqual(scanBuffers("huawei", dex("com.google.android.gms.common.GoogleApiAvailability")), [], "reflection string is ok");
  assert.ok(scanBuffers("play", dex("Lcom/amazon/device/messaging/ADM;")).length);
  assert.ok(scanBuffers("samsung", dex("Lcom/huawei/hms/push/HmsMessaging;")).length);
  assert.ok(scanBuffers("huawei", dex("Lcom/google/firebase/messaging/FirebaseMessaging;")).length);
  assert.ok(scanBuffers("amazon", dex("Lcom/google/android/gms/common;")).length);
  const manifest = [{ name: "AndroidManifest.xml", buf: Buffer.from("com.amazon.device.messaging.permission.RECEIVE", "utf16le") }];
  assert.ok(scanBuffers("huawei", manifest).length);
  assert.deepEqual(Object.keys(FORBIDDEN).sort(), ["amazon", "huawei", "play", "samsung"]);
  assert.deepEqual(
    [...Object.keys(FORBIDDEN), ...Object.keys(SOURCE_STORES)].sort(),
    ["amazon", "huawei", "ios", "microsoft", "play", "samsung"],
  );
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  assert.deepEqual(scanRepoSources(repoRoot), []);
});
