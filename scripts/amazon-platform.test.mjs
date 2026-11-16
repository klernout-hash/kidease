import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { admRegistrationAllowed } from "../src/lib/amazon/gate.ts";
import {
  AMAZON_PACKAGE_HTTPS,
  amazonListingHref,
  amazonPackageDeepLink,
  amazonPlatformContext,
} from "../src/lib/amazon/store-link.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { STORE_PAYMENTS_ENABLED } from "../src/lib/native-entitlements.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("the Amazon deep link flag stays off and does not replace a real listing", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_AMAZON_STORE_DEEP_LINK, false);
  assert.deepEqual(amazonPlatformContext({}), {});
  assert.equal(amazonListingHref(false, null), null);
  assert.equal(amazonListingHref(false, "https://www.amazon.ca/dp/B0TEST0001"), "https://www.amazon.ca/dp/B0TEST0001");
  assert.equal(amazonPackageDeepLink(false), null);
  assert.equal(admRegistrationAllowed({}, { userAgent: "Android KidEaseNative KidEaseStoreAmazon KidEaseAmazonDevice" }), false);
  assert.equal(STORE_PAYMENTS_ENABLED.amazon, false);
});

test("the package page and amzn link appear only when the flag is on and no listing is set", () => {
  assert.equal(amazonListingHref(true, null), AMAZON_PACKAGE_HTTPS);
  assert.equal(amazonListingHref(true, "https://www.amazon.ca/dp/B0TEST0001"), "https://www.amazon.ca/dp/B0TEST0001");
  assert.equal(amazonPackageDeepLink(true), "amzn://apps/android?p=ca.kidease.app");
  assert.deepEqual(amazonPlatformContext({ FEATURE_AMAZON_STORE_DEEP_LINK: "1" }), { amazonDeepLink: true });
  assert.match(src("src/routes/get-app.tsx"), /amazonListingHref/);
  assert.match(src("src/lib/push-client.ts"), /registerAdmDevice/);
  assert.doesNotMatch(src("src/lib/amazon/store-link.ts"), /fetch\(|ADM_CLIENT_SECRET/);
});
