import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { signInChoicesForChannel } from "../src/lib/auth/providers.ts";
import { huaweiSignInVisible } from "../src/lib/auth/store-signin-flags.ts";
import { callPushEnabled } from "../src/lib/server/call-ring.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { commercePolicyForChannel } from "../src/lib/native-entitlements.ts";
import { sponsoredListingsEnabled } from "../src/lib/sponsored-flag.ts";
import { decodeAgconnectSecret } from "./inject-agconnect-services.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const LISTING = [
  "docs/store/huawei-appgallery/README.md",
  "docs/store/huawei-appgallery/listing.en.md",
  "docs/store/huawei-appgallery/listing.fr.md",
  "docs/store/huawei-appgallery/age-rating.md",
  "docs/store/huawei-appgallery/data-and-permissions.md",
  "docs/store/huawei-appgallery/screenshots.md",
  "docs/store/huawei-appgallery/reviewer-notes.md",
];

test("AppGallery listing pack stays honest", () => {
  const text = LISTING.map((rel) => src(rel)).join("\n");
  assert.match(text, /https:\/\/www\.kidease\.ca\/privacy/);
  assert.match(text, /Canada only/);
  assert.match(text, /free founding period/);
  assert.match(text, /période fondatrice gratuite/);
  assert.match(text, /no charge/);
  assert.match(text, /sans frais/);
  assert.match(text, /not a government service/);
  assert.match(text, /reviewer-parent@kidease\.ca/);
  assert.match(text, /reviewer-provider@kidease\.ca/);
  assert.match(text, /216/);
  assert.match(text, /1080 × 1920/);
  assert.doesNotMatch(text, /free forever|gratuit pour toujours|gratuit à vie/i);
  assert.doesNotMatch(text, /REVIEWER_ACCOUNT_PASSWORD=\S+/);
  assert.doesNotMatch(text, /password:\s*\S{6,}/i);
  const briefEn = src("docs/store/huawei-appgallery/listing.en.md").match(/## Brief introduction[\s\S]*?\n\n([^\n]+)/);
  const briefFr = src("docs/store/huawei-appgallery/listing.fr.md").match(/## Brève introduction[\s\S]*?\n\n([^\n]+)/);
  assert.ok(briefEn && briefEn[1].length <= 80, briefEn && briefEn[1]);
  assert.ok(briefFr && briefFr[1].length <= 80, briefFr && briefFr[1]);
});

test("216 icon is a square PNG", async () => {
  const path = join(root, "docs/store/huawei-appgallery/icon-216.png");
  assert.equal(existsSync(path), true);
  const meta = await sharp(path).metadata();
  assert.equal(meta.width, 216);
  assert.equal(meta.height, 216);
  assert.equal(meta.format, "png");
});

test("HMS push is huawei-only and the AppGallery plugin waits for the json file", () => {
  const gradle = src("android/app/build.gradle");
  assert.match(gradle, /huaweiImplementation "com\.huawei\.hms:push:/);
  assert.match(gradle, /apply plugin: "com\.huawei\.agconnect"/);
  assert.match(gradle, /agcServices\.exists\(\)/);
  assert.doesNotMatch(gradle, /huaweiImplementation project\(":capacitor-push-notifications"\)/);
  assert.doesNotMatch(gradle, /huaweiImplementation project\(":capacitor-geolocation"\)/);
  assert.match(src("android/build.gradle"), /com\.huawei\.agconnect:agcp:1\.9\.6\.300/);
  assert.match(src("android/build.gradle"), /developer\.huawei\.com\/repo/);
  assert.equal(existsSync(join(root, "android/hms/KidEaseHmsMessageService.java")), false);
  assert.match(src("android/app/src/huawei/java/ca/kidease/app/KidEaseHmsMessageService.java"), /extends HmsMessageService/);
  assert.match(src("android/app/src/huawei/java/ca/kidease/app/HuaweiPushPlugin.java"), /KidEaseHms/);
  assert.match(src("android/app/src/huawei/java/ca/kidease/app/StorePlugins.java"), /HuaweiPushPlugin/);
  assert.doesNotMatch(src("android/app/src/play/java/ca/kidease/app/StorePlugins.java"), /HuaweiPushPlugin|HmsMessage/);
  assert.doesNotMatch(src("android/app/src/samsung/java/ca/kidease/app/StorePlugins.java"), /HuaweiPushPlugin|HmsMessage/);
  assert.doesNotMatch(src("android/app/src/amazon/java/ca/kidease/app/StorePlugins.java"), /HuaweiPushPlugin|HmsMessage/);
  assert.match(src(".gitignore"), /agconnect-services\.json/);
  assert.equal(existsSync(join(root, "android/app/src/huawei/agconnect-services.json")), false);
  assert.equal(existsSync(join(root, "android/app/agconnect-services.json")), false);
});

test("Huawei manifest declares location, camera, mic, and notifications with en and fr rationale", () => {
  const manifest = src("android/app/src/huawei/AndroidManifest.xml");
  for (const permission of [
    "ACCESS_COARSE_LOCATION",
    "ACCESS_FINE_LOCATION",
    "CAMERA",
    "RECORD_AUDIO",
    "POST_NOTIFICATIONS",
  ]) {
    assert.match(manifest, new RegExp(permission));
  }
  assert.match(manifest, /KidEaseHmsMessageService/);
  assert.match(manifest, /FirebaseInitProvider/);
  assert.match(manifest, /READ_PHONE_STATE" tools:node="remove"/);
  const en = src("android/app/src/huawei/res/values/strings.xml");
  const fr = src("android/app/src/huawei/res/values-fr/strings.xml");
  for (const name of [
    "location_permission_rationale",
    "camera_permission_rationale",
    "microphone_permission_rationale",
    "notifications_permission_rationale",
  ]) {
    assert.match(en, new RegExp(name));
    assert.match(fr, new RegExp(name));
  }
});

test("Google sign-in stays off the huawei build and off flags stay off", () => {
  assert.ok(!signInChoicesForChannel("huawei", { playServices: true }).includes("google"));
  assert.equal(huaweiSignInVisible({}), false);
  assert.equal(huaweiSignInVisible({ FEATURE_SIGNIN_HUAWEI: "1" }), false);
  assert.equal(callPushEnabled({}), false);
  assert.equal(FLAG_DEFAULTS.SHOW_PAY_CTAS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_PROVIDER_SUBSCRIPTIONS, false);
  assert.equal(FLAG_DEFAULTS.SUBSCRIPTIONS_ENABLED, false);
  assert.equal(sponsoredListingsEnabled(undefined), false);
  assert.equal(commercePolicyForChannel("huawei").parentPlusIap, null);
  assert.match(src("android/app/src/main/java/ca/kidease/app/MainActivity.java"), /playServicesForFlavor/);
  assert.match(src("src/lib/call-push-client.ts"), /provider: "hms"/);
  assert.match(src("src/lib/call-push-client.ts"), /platform: "huawei"/);
  assert.match(src("src/lib/use-huawei-call-push.ts"), /getCallPushStatus/);
  assert.match(src("src/lib/server/call-ring-fns.ts"), /"hms"/);
});

test("CI builds every Android store and uploads a Huawei release artifact", () => {
  const ci = src(".github/workflows/ci.yml");
  const release = src(".github/workflows/android-release.yml");
  const isolation = src(".github/workflows/store-isolation.yml");
  for (const task of ["assemblePlayDebug", "assembleSamsungDebug", "assembleHuaweiDebug", "assembleAmazonDebug"]) {
    assert.match(ci, new RegExp(task));
    assert.match(isolation, new RegExp(task));
  }
  assert.match(ci, /bundleHuaweiRelease/);
  assert.match(ci, /assembleHuaweiRelease/);
  assert.match(ci, /check-store-isolation\.mjs/);
  assert.match(ci, /app-huawei-release/);
  assert.match(release, /bundlePlayRelease/);
  assert.match(release, /bundleHuaweiRelease/);
  assert.match(release, /assembleHuaweiRelease/);
  assert.match(release, /AGCONNECT_SERVICES_JSON/);
  const aabAt = release.indexOf("name: app-release-aab");
  const huaweiAt = release.indexOf("bundleHuaweiRelease");
  assert.ok(aabAt > -1 && huaweiAt > aabAt, "Play app-release-aab uploads before the Huawei build");
  assert.match(release, /::warning title=Huawei skipped::/);
  assert.match(release, /steps\.agconnect\.outputs\.present == 'true'/);
  assert.doesNotMatch(ci, /FEATURE_CALL_PUSH:\s*["']?1/);
  assert.doesNotMatch(release, /FEATURE_SIGNIN_HUAWEI/);
  assert.match(src("scripts/inject-agconnect-services.mjs"), /Contents not printed/);
});

test("agconnect secret decode rejects a bad package and never needs a real secret", () => {
  const body = JSON.stringify({
    client: { package_name: "ca.kidease.app", client_id: "not-a-secret" },
  });
  const decoded = decodeAgconnectSecret(Buffer.from(body).toString("base64"));
  assert.match(decoded, /ca\.kidease\.app/);
  assert.equal(decodeAgconnectSecret(""), null);
  assert.throws(() => decodeAgconnectSecret(Buffer.from('{"client":{"package_name":"other.app"}}').toString("base64")));
  assert.throws(() => decodeAgconnectSecret("not-json"));
});
