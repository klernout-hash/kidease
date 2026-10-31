import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mapAmazonProfile } from "../src/lib/auth/amazon-idp.ts";
import { mapHuaweiProfile } from "../src/lib/auth/huawei-idp.ts";
import { helpLauncherVisible } from "../src/lib/help-launcher.ts";
import {
  googlePlayServicesAvailable,
  storeChannelFromBuild,
  storeChannelFromSignals,
  userAgentForStoreBuild,
  userAgentWithPlayServices,
} from "../src/lib/native-entitlements.ts";
import { brokerOAuthCallbackPath } from "../src/lib/auth/preview.ts";
import {
  signInChoicesForChannel,
  visibleSignInProviders,
} from "../src/lib/auth/providers.ts";
import { amazonSignInVisible, huaweiSignInVisible } from "../src/lib/auth/store-signin-flags.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const MATRIX = {
  ios: ["apple", "google", "facebook", "email"],
  apple: ["apple", "google", "facebook", "email"],
  play: ["google", "facebook", "email"],
  google: ["google", "facebook", "email"],
  samsung: ["google", "facebook", "email"],
  huawei: ["huawei", "facebook", "email"],
  amazon: ["amazon", "facebook", "email"],
  microsoft: ["apple", "google", "facebook", "email"],
  web: ["apple", "google", "facebook", "email"],
};

test("each store shows only the sign-ins that work there, in order", () => {
  for (const [channel, expected] of Object.entries(MATRIX)) {
    assert.deepEqual(signInChoicesForChannel(channel), expected, channel);
    assert.equal(expected.at(-1), "email", channel);
  }
  assert.deepEqual(signInChoicesForChannel("play", { playServices: false }), ["facebook", "email"]);
  assert.deepEqual(signInChoicesForChannel("samsung", { playServices: false }), ["facebook", "email"]);
  assert.deepEqual(signInChoicesForChannel("ios", { playServices: false }), ["apple", "facebook", "email"]);
  assert.deepEqual(signInChoicesForChannel("web", { playServices: false }), ["apple", "facebook", "email"]);
  assert.deepEqual(signInChoicesForChannel("microsoft", { playServices: false }), ["apple", "facebook", "email"]);
  assert.deepEqual(signInChoicesForChannel("huawei", { playServices: true }), ["huawei", "facebook", "email"]);
  assert.deepEqual(signInChoicesForChannel("amazon"), ["amazon", "facebook", "email"]);
  assert.deepEqual(signInChoicesForChannel(""), MATRIX.web);
});

test("Huawei ID and Login with Amazon stay off until the flag and keys are set", () => {
  const huaweiKeys = { HUAWEI_APP_ID: "app", HUAWEI_APP_SECRET: "secret" };
  const amazonKeys = { AMAZON_CLIENT_ID: "amzn", AMAZON_CLIENT_SECRET: "secret" };
  assert.equal(huaweiSignInVisible({}), false);
  assert.equal(huaweiSignInVisible({ ...huaweiKeys, FEATURE_SIGNIN_HUAWEI: "0" }), false);
  assert.equal(huaweiSignInVisible({ FEATURE_SIGNIN_HUAWEI: "1" }), false);
  assert.equal(huaweiSignInVisible({ ...huaweiKeys, FEATURE_SIGNIN_HUAWEI: "1" }), true);
  assert.equal(huaweiSignInVisible({ HUAWEI_CLIENT_ID: "app", HUAWEI_CLIENT_SECRET: "secret", FEATURE_SIGNIN_HUAWEI: "1" }), true);
  assert.equal(amazonSignInVisible({ ...amazonKeys, FEATURE_SIGNIN_AMAZON: "0" }), false);
  assert.equal(amazonSignInVisible({ ...amazonKeys, AMAZON_API_KEY: "key", FEATURE_SIGNIN_AMAZON: "0" }), false);
  assert.equal(amazonSignInVisible({ ...amazonKeys, FEATURE_SIGNIN_AMAZON: "1" }), true);
  const example = src(".env.example");
  assert.match(example, /^FEATURE_SIGNIN_HUAWEI=0$/m);
  assert.match(example, /^FEATURE_SIGNIN_AMAZON=0$/m);
  assert.doesNotMatch(example, /^FEATURE_SIGNIN_HUAWEI=1$/m);
  assert.doesNotMatch(example, /^FEATURE_SIGNIN_AMAZON=1$/m);
  assert.doesNotMatch(example, /^HUAWEI_APP_SECRET=\S/m);
  assert.doesNotMatch(example, /^AMAZON_CLIENT_SECRET=\S/m);
  assert.doesNotMatch(example, /^AMAZON_API_KEY=\S/m);
});

test("new providers are hidden until asked, then sort after Facebook", () => {
  const base = { nativeGoogle: true, nativeFacebook: true, nativeApple: true, broker: false };
  const current = visibleSignInProviders(base).map((row) => row.idp);
  assert.deepEqual(current, ["apple", "google", "facebook"]);
  const withStores = visibleSignInProviders({ ...base, nativeHuawei: true, nativeAmazon: true }).map((row) => row.idp);
  assert.deepEqual(withStores, ["apple", "google", "facebook", "huawei", "amazon"]);
});

test("a verified email can link, and an unverified Huawei email cannot", () => {
  assert.equal(mapHuaweiProfile({ openID: "hw-1", email: "parent@example.ca" })?.emailVerified, true);
  assert.equal(mapHuaweiProfile({ openID: "hw-1", email: "parent@example.ca" })?.email, "parent@example.ca");
  const unverified = mapHuaweiProfile({ openID: "hw-2", email: "other@example.ca", email_verified: false });
  assert.equal(unverified?.email, undefined);
  assert.equal(unverified?.emailVerified, false);
  assert.equal(mapHuaweiProfile({})?.id, undefined);
  const amazon = mapAmazonProfile({ user_id: "amzn1.account.1", email: "parent@example.ca", name: "Ada" });
  assert.equal(amazon?.emailVerified, true);
  assert.equal(amazon?.email, "parent@example.ca");
  assert.equal(mapAmazonProfile({ user_id: "amzn1.account.2" })?.email, undefined);
});

test("store flavor and a missing Play services check pick the channel", () => {
  assert.equal(storeChannelFromBuild("play"), "google");
  assert.equal(storeChannelFromBuild("ios"), "apple");
  assert.equal(storeChannelFromBuild("amazon"), "amazon");
  assert.equal(storeChannelFromBuild("nope"), null);
  assert.equal(
    storeChannelFromSignals({ userAgent: "Android KidEaseNative KidEaseStoreAmazon" }),
    "amazon",
  );
  assert.equal(
    storeChannelFromSignals({
      userAgent: "Android KidEaseNative KidEaseStoreAmazon",
      buildChannel: "huawei",
    }),
    "amazon",
  );
  assert.equal(storeChannelFromSignals({ userAgent: "Mozilla", buildChannel: "huawei" }), "huawei");
  assert.equal(storeChannelFromSignals({ userAgent: "Mozilla", buildChannel: "play" }), "google");
  assert.equal(storeChannelFromSignals({ userAgent: "Mozilla", buildChannel: null }), "web");
  assert.equal(storeChannelFromSignals({ userAgent: "iPhone KidEaseNative KidEaseStoreAmazon" }), "apple");
  assert.equal(googlePlayServicesAvailable("Android KidEaseNative"), true);
  assert.equal(googlePlayServicesAvailable("Android KidEaseNative KidEaseNoGms"), false);
  assert.equal(
    userAgentForStoreBuild("amazon", "KidEaseNative KidEaseStoreHuawei", "KidEaseStoreAmazon"),
    "KidEaseNative KidEaseStoreAmazon",
  );
  assert.equal(userAgentWithPlayServices("KidEaseNative", false), "KidEaseNative KidEaseNoGms");
  assert.equal(userAgentWithPlayServices("KidEaseNative KidEaseNoGms", true), "KidEaseNative");
  assert.equal(brokerOAuthCallbackPath("huawei"), null);
  assert.equal(brokerOAuthCallbackPath("amazon"), null);
  assert.equal(brokerOAuthCallbackPath("grok-google"), "/oauth2/callback/grok-google");
  assert.equal(brokerOAuthCallbackPath("facebook"), null);
});

test("Help stays on sign-in screens and the new providers link the same way", () => {
  assert.equal(helpLauncherVisible("/login"), true);
  assert.equal(helpLauncherVisible("/fr/login"), true);
  assert.equal(helpLauncherVisible("/signup"), true);
  assert.match(src("src/routes/__root.tsx"), /LiveChatSlot/);
  const server = src("src/lib/auth/server.ts");
  assert.match(server, /"apple"/);
  assert.match(server, /"google"/);
  assert.match(server, /"facebook"/);
  assert.match(server, /"huawei"/);
  assert.match(server, /"amazon"/);
  assert.match(server, /huaweiOAuthConfig/);
  assert.match(server, /amazonOAuthConfig/);
  assert.doesNotMatch(server, /socialProviders\.google\s*=/);
  const gradle = src("android/app/build.gradle");
  assert.match(gradle, /amazon \{/);
  assert.match(gradle, /KidEaseStoreAmazon/);
  assert.match(src("android/app/src/main/java/ca/kidease/app/MainActivity.java"), /KidEaseNoGms/);
  assert.match(src("android/app/src/main/java/ca/kidease/app/PlayServicesStatus.java"), /isGooglePlayServicesAvailable/);
  assert.match(src("public/channel-boot.js"), /KidEaseStoreAmazon/);
});
