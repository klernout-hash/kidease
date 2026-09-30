import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { androidBackDecision } from "../src/lib/android-back.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Android back leaves the app only from home with an empty history", () => {
  assert.equal(androidBackDecision({ platform: "ios", path: "/", canGoBack: false }), "ignore");
  assert.equal(androidBackDecision({ platform: "android", path: "/", canGoBack: false }), "exit");
  assert.equal(androidBackDecision({ platform: "android", path: "/fr", canGoBack: false }), "exit");
  assert.equal(androidBackDecision({ platform: "android", path: "/", canGoBack: true }), "back");
  assert.equal(androidBackDecision({ platform: "android", path: "/daycare/kids-world", canGoBack: false }), "back");
  assert.equal(androidBackDecision({ platform: "android", path: "/search?q=Winnipeg", canGoBack: false }), "back");
});

test("Native boot listens for the Android back button", () => {
  const boot = readFileSync(join(root, "src/components/native-boot.tsx"), "utf8");
  assert.match(boot, /bindAndroidBack/);
  assert.match(boot, /history\.back/);
  assert.match(boot, /exitApp/);
});
