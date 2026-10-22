import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { huaweiDeviceLocation } from "../src/lib/huawei-location.ts";
import { inAppReviewAllowed } from "../src/lib/store-review.ts";

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
});

test("Huawei location stays on the WebView and does not import Play Services", async () => {
  const location = src("src/lib/huawei-location.ts");
  assert.doesNotMatch(location, /@capacitor\/geolocation|play-services|firebase|@capacitor-community\/in-app-review/);
  assert.match(location, /navigator\.geolocation/);
  assert.match(location, /HMSLocation/);
  assert.match(src("src/lib/native.ts"), /huaweiDeviceLocation/);
  assert.equal(await huaweiDeviceLocation(), null);
});
