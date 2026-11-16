import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { STORE_PAYMENTS_ENABLED } from "../src/lib/native-entitlements.ts";
import { inAppReviewAllowed } from "../src/lib/store-review.ts";
import {
  HUAWEI_APPGALLERY_URL,
  huaweiAppLinkPath,
  huaweiGalleryUrl,
  huaweiPlatformContext,
  huaweiReviewUrl,
} from "../src/lib/huawei/platform.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("Huawei flags stay off and do not open AppGallery", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_HUAWEI_ALERT_PUSH, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_HUAWEI_APP_LINKING, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_HUAWEI_IN_APP_REVIEW, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_HUAWEI_APPGALLERY_LINK, false);
  assert.deepEqual(huaweiPlatformContext({}), {});
  assert.equal(huaweiReviewUrl(false), null);
  assert.equal(huaweiGalleryUrl(false), null);
  assert.equal(huaweiAppLinkPath(false, "https://www.kidease.ca/search"), null);
  assert.equal(inAppReviewAllowed("huawei"), false);
  assert.equal(STORE_PAYMENTS_ENABLED.huawei, false);
});

test("AppGallery link, review, and app linking turn on separately", () => {
  assert.equal(huaweiGalleryUrl(true), HUAWEI_APPGALLERY_URL);
  assert.equal(huaweiReviewUrl(true), HUAWEI_APPGALLERY_URL);
  assert.equal(huaweiAppLinkPath(true, "https://www.kidease.ca/search?q=winnipeg"), "/search?q=winnipeg");
  assert.equal(huaweiAppLinkPath(true, "https://kidease.ca/help"), "/help");
  assert.equal(huaweiAppLinkPath(true, HUAWEI_APPGALLERY_URL), "/get-app");
  assert.equal(huaweiAppLinkPath(true, "https://appgallery.huawei.com/#/app/C000000000"), null);
  assert.equal(huaweiAppLinkPath(true, "https://evil.example/search"), null);
  assert.equal(huaweiAppLinkPath(true, "http://www.kidease.ca/search"), null);
  assert.deepEqual(huaweiPlatformContext({ FEATURE_HUAWEI_APPGALLERY_LINK: "1" }), { huaweiGallery: true });
  const client = src("src/lib/huawei/platform-client.ts");
  assert.match(client, /registerHuaweiAlertPush/);
  assert.doesNotMatch(client, /registerCallDevice|registerPushToken|fetch\(/);
  assert.match(src("src/lib/store-review.ts"), /huaweiReview/);
  assert.match(src("src/components/native-boot.tsx"), /huaweiAppLinking !== true/);
});
