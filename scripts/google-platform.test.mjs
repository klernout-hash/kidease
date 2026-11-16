import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { playIntegrityNonce, playPlatformContext, playShortcutItems } from "../src/lib/google/platform.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { STORE_PAYMENTS_ENABLED } from "../src/lib/native-entitlements.ts";
import { inAppReviewAllowed } from "../src/lib/store-review.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("Play platform flags stay off and add nothing to the request", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_PLAY_IN_APP_UPDATES, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_PLAY_APP_SHORTCUTS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_PLAY_INTEGRITY, false);
  assert.deepEqual(playPlatformContext({}), {});
  assert.deepEqual(playShortcutItems(false, "en"), []);
  assert.equal(playIntegrityNonce(new Uint8Array(8)), null);
  assert.equal(STORE_PAYMENTS_ENABLED.google, false);
  assert.equal(inAppReviewAllowed("google"), true);
});

test("shortcuts and a nonce appear only when that flag is on", () => {
  const items = playShortcutItems(true, "en");
  assert.deepEqual(items.map((item) => item.path), ["/search", "/parent", "/help"]);
  assert.match(playShortcutItems(true, "fr")[0].title, /garderie/);
  const nonce = playIntegrityNonce(new Uint8Array(32).fill(7));
  assert.equal(nonce?.length, 32);
  assert.match(nonce || "", /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(playPlatformContext({ FEATURE_PLAY_INTEGRITY: "1" }), { playIntegrity: true });
});

test("Play libraries stay on the play flavour and the store build is 1.0.2", () => {
  const gradle = src("android/app/build.gradle");
  assert.match(gradle, /versionCode 6/);
  assert.match(gradle, /versionName "1\.0\.2"/);
  assert.match(gradle, /playImplementation "com\.google\.android\.play:app-update:2\.1\.0"/);
  assert.match(gradle, /playImplementation "com\.google\.android\.play:integrity:1\.4\.0"/);
  assert.doesNotMatch(gradle, /huaweiImplementation "com\.google\.android\.play/);
  const plugin = src("android/app/src/play/java/ca/kidease/app/PlayPlatformPlugin.java");
  assert.match(plugin, /needs-cloud-project-number/);
  assert.doesNotMatch(plugin, /out\.put\("token"/);
  assert.match(src("android/app/src/play/java/ca/kidease/app/StorePlugins.java"), /PlayPlatformPlugin/);
  assert.match(src("public/.well-known/assetlinks.json"), /ca\.kidease\.app/);
  assert.match(src("src/components/native-boot.tsx"), /playUpdates !== true/);
});
