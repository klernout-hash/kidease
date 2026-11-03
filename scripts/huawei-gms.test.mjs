import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { signInChoicesForChannel } from "../src/lib/auth/providers.ts";
import { huaweiDeviceLocation } from "../src/lib/huawei-location.ts";
import { inAppReviewAllowed, playListingAllowed } from "../src/lib/store-review.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Huawei drops Play location, Play review, and Firebase messaging only", () => {
  const gradle = src("android/app/build.gradle");
  const huawei = gradle.slice(gradle.indexOf("contains(\"huawei\")"));
  assert.match(huawei, /module: "play-services-location"/);
  assert.match(huawei, /module: "review"/);
  assert.match(huawei, /module: "firebase-messaging"/);
  assert.match(gradle, /playImplementation project\(":capacitor-geolocation"\)/);
  assert.match(gradle, /samsungImplementation project\(":capacitor-geolocation"\)/);
  assert.match(gradle, /playImplementation project\(":capacitor-community-in-app-review"\)/);
  assert.match(gradle, /samsungImplementation project\(":capacitor-community-in-app-review"\)/);
  assert.match(gradle, /playImplementation project\(":capacitor-push-notifications"\)/);
  assert.match(gradle, /samsungImplementation project\(":capacitor-push-notifications"\)/);
  assert.doesNotMatch(gradle, /huaweiImplementation project\(":capacitor-geolocation"\)/);
  assert.doesNotMatch(gradle, /huaweiImplementation project\(":capacitor-community-in-app-review"\)/);
  assert.doesNotMatch(gradle, /huaweiImplementation project\(":capacitor-push-notifications"\)/);
  assert.equal(inAppReviewAllowed("huawei"), false);
  assert.equal(inAppReviewAllowed("google"), true);
  assert.equal(inAppReviewAllowed("samsung"), false);
  assert.equal(playListingAllowed("huawei"), false);
  assert.equal(signInChoicesForChannel("huawei").includes("google"), false);
  assert.match(gradle, /huaweiImplementation "com\.huawei\.hms:push:/);
  assert.doesNotMatch(gradle, /(?:play|samsung|amazon)Implementation "com\.huawei\.hms:push:/);
  assert.doesNotMatch(gradle, /[^w]implementation "com\.huawei\.hms:push:/);
  assert.match(gradle, /agconnect-services\.json/);
  assert.match(gradle, /com\.huawei\.agconnect/);
  assert.match(gradle, /storeVersionCodeOverride/);
  assert.match(gradle, /versionCode\(huaweiCode != null \? huaweiCode : 3\)/);
  assert.doesNotMatch(gradle, /com\.huawei\.hms:iap|huaweiImplementation .*app-update/);
  assert.doesNotMatch(src("src/lib/store-review.ts"), /AppUpdate|play:core|app-update/);
  assert.doesNotMatch(src("src/lib/osm-map.ts"), /maps\.googleapis\.com|play-services-maps/);
  assert.match(src(".github/workflows/android-release.yml"), /bundleHuaweiRelease/);
  assert.match(src(".github/workflows/android-release.yml"), /assembleHuaweiRelease/);
  assert.match(src(".github/workflows/android-release.yml"), /app-huawei-release-aab/);
  assert.match(src(".github/workflows/android-release.yml"), /app-huawei-release-apk/);
  assert.match(src(".github/workflows/ci.yml"), /assembleHuaweiDebug/);
  assert.match(src(".github/workflows/ci.yml"), /check-store-isolation\.mjs/);
  assert.match(src(".github/workflows/ci.yml"), /huawei-gms\.test\.mjs/);
  assert.match(src(".gitignore"), /agconnect-services\.json/);
  assert.match(src("android/.gitignore"), /agconnect-services\.json/);
  assert.match(src(".env.example"), /FEATURE_SIGNIN_HUAWEI=0/);
});

test("Huawei push service lives in the huawei source set", () => {
  const service = src("android/app/src/huawei/java/ca/kidease/app/KidEaseHmsMessageService.java");
  assert.match(service, /extends HmsMessageService/);
  assert.match(service, /FEATURE_CALL_PUSH/);
  assert.equal(existsSync(join(root, "android/hms/KidEaseHmsMessageService.java")), false);
  const manifest = src("android/app/src/huawei/AndroidManifest.xml");
  assert.match(manifest, /KidEaseHmsMessageService/);
  assert.match(manifest, /com\.huawei\.push\.action\.MESSAGING_EVENT/);
  assert.match(manifest, /ACCESS_FINE_LOCATION/);
  assert.match(manifest, /ACCESS_COARSE_LOCATION/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /RECORD_AUDIO/);
  assert.match(manifest, /POST_NOTIFICATIONS/);
  assert.match(manifest, /READ_PHONE_STATE" tools:node="remove"/);
  assert.match(manifest, /ACCESS_BACKGROUND_LOCATION" tools:node="remove"/);
  const en = src("android/app/src/huawei/res/values/strings.xml");
  const fr = src("android/app/src/huawei/res/values-fr/strings.xml");
  for (const name of [
    "location_permission_rationale",
    "camera_permission_rationale",
    "microphone_permission_rationale",
    "notifications_permission_rationale",
  ]) {
    assert.match(en, new RegExp(`name="${name}"`));
    assert.match(fr, new RegExp(`name="${name}"`));
  }
  assert.match(src("docs/huawei-appgallery.md"), /ca\.kidease\.app/);
  assert.match(src("docs/huawei-appgallery.md"), /AGCONNECT_SERVICES_JSON/);
  assert.match(src("docs/huawei-appgallery.md"), /FEATURE_CALL_PUSH/);
  assert.match(src("docs/huawei-appgallery.md"), /FEATURE_SIGNIN_HUAWEI/);
});

test("Huawei location stays on the WebView and does not import Play Services", async () => {
  const location = src("src/lib/huawei-location.ts");
  assert.doesNotMatch(location, /@capacitor\/geolocation|play-services|firebase|@capacitor-community\/in-app-review/);
  assert.match(location, /navigator\.geolocation/);
  assert.match(location, /HMSLocation/);
  assert.match(src("src/lib/native.ts"), /huaweiDeviceLocation/);
  assert.equal(await huaweiDeviceLocation(), null);
});
