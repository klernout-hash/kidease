import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { amazonOAuthConfig, mapAmazonProfile } from "../src/lib/auth/amazon-idp.ts";
import { huaweiOAuthConfig, mapHuaweiProfile } from "../src/lib/auth/huawei-idp.ts";
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
  providersForStore,
  signInChoicesForChannel,
  visibleSignInProviders,
} from "../src/lib/auth/providers.ts";
import { amazonLoginButtonReady, amazonSignInVisible, huaweiSignInVisible } from "../src/lib/auth/store-signin-flags.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const WITH_STORE_OAUTH = ["apple", "google", "facebook", "huawei", "amazon", "email"];
const MATRIX = {
  ios: WITH_STORE_OAUTH,
  apple: WITH_STORE_OAUTH,
  play: ["google", "facebook", "email"],
  google: ["google", "facebook", "email"],
  samsung: ["google", "facebook", "email"],
  huawei: ["huawei", "facebook", "email"],
  amazon: ["amazon", "facebook", "email"],
  microsoft: WITH_STORE_OAUTH,
  web: WITH_STORE_OAUTH,
};

test("each store shows only the sign-ins that work there, in order", () => {
  for (const [channel, expected] of Object.entries(MATRIX)) {
    assert.deepEqual(signInChoicesForChannel(channel), expected, channel);
    assert.equal(expected.at(-1), "email", channel);
  }
  assert.deepEqual(signInChoicesForChannel("play", { playServices: false }), ["facebook", "email"]);
  assert.deepEqual(signInChoicesForChannel("samsung", { playServices: false }), ["facebook", "email"]);
  assert.deepEqual(signInChoicesForChannel("ios", { playServices: false }), ["apple", "facebook", "huawei", "amazon", "email"]);
  assert.deepEqual(signInChoicesForChannel("web", { playServices: false }), ["apple", "facebook", "huawei", "amazon", "email"]);
  assert.deepEqual(signInChoicesForChannel("microsoft", { playServices: false }), ["apple", "facebook", "huawei", "amazon", "email"]);
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
  assert.equal(huaweiSignInVisible({ ...huaweiKeys, FEATURE_LOGIN_HUAWEI: "1" }), true);
  assert.equal(huaweiSignInVisible({ ...huaweiKeys, FEATURE_LOGIN_HUAWEI: "0", FEATURE_SIGNIN_HUAWEI: "0" }), false);
  assert.equal(amazonSignInVisible({ ...amazonKeys, FEATURE_SIGNIN_AMAZON: "0" }), false);
  assert.equal(amazonSignInVisible({ ...amazonKeys, AMAZON_API_KEY: "key", FEATURE_SIGNIN_AMAZON: "0" }), false);
  assert.equal(amazonSignInVisible({ ...amazonKeys, FEATURE_SIGNIN_AMAZON: "1" }), true);
  assert.equal(amazonSignInVisible({ ...amazonKeys, FEATURE_LOGIN_AMAZON: "1" }), true);
  assert.equal(amazonLoginButtonReady({ ...amazonKeys, FEATURE_LOGIN_AMAZON: "1" }, "web", false), true);
  assert.equal(amazonLoginButtonReady({ ...amazonKeys, FEATURE_LOGIN_AMAZON: "1" }, "play", false), false);
  assert.equal(amazonLoginButtonReady({ ...amazonKeys, FEATURE_LOGIN_AMAZON: "1" }, "huawei", false), false);
  assert.equal(amazonLoginButtonReady({ ...amazonKeys, FEATURE_LOGIN_AMAZON: "1" }, "amazon", false), false);
  assert.equal(amazonLoginButtonReady({ ...amazonKeys, FEATURE_LOGIN_AMAZON: "1" }, "amazon", true), true);
  assert.equal(amazonLoginButtonReady({ ...amazonKeys }, "web", false), false);
  const huaweiOAuth = huaweiOAuthConfig({ ...huaweiKeys, FEATURE_LOGIN_HUAWEI: "1" });
  assert.equal(huaweiOAuth?.authorizationUrl, "https://oauth-login.cloud.huawei.com/oauth2/v3/authorize");
  assert.deepEqual(huaweiOAuth?.scopes, ["openid", "profile", "email"]);
  assert.equal(huaweiOAuthConfig({ FEATURE_LOGIN_HUAWEI: "1" }), null);
  const amazonOAuth = amazonOAuthConfig({ ...amazonKeys, FEATURE_LOGIN_AMAZON: "1" });
  assert.equal(amazonOAuth?.authorizationUrl, "https://www.amazon.com/ap/oa");
  assert.deepEqual(amazonOAuth?.scopes, ["profile"]);
  assert.equal(amazonOAuthConfig({ ...amazonKeys }), null);
  const example = src(".env.example");
  assert.match(example, /^FEATURE_SIGNIN_HUAWEI=0$/m);
  assert.match(example, /^FEATURE_LOGIN_HUAWEI=0$/m);
  assert.match(example, /^FEATURE_SIGNIN_AMAZON=0$/m);
  assert.match(example, /^FEATURE_LOGIN_AMAZON=0$/m);
  assert.doesNotMatch(example, /^FEATURE_SIGNIN_HUAWEI=1$/m);
  assert.doesNotMatch(example, /^FEATURE_LOGIN_HUAWEI=1$/m);
  assert.doesNotMatch(example, /^FEATURE_SIGNIN_AMAZON=1$/m);
  assert.doesNotMatch(example, /^FEATURE_LOGIN_AMAZON=1$/m);
  assert.doesNotMatch(example, /^HUAWEI_APP_SECRET=\S/m);
  assert.doesNotMatch(example, /^AMAZON_CLIENT_SECRET=\S/m);
  assert.doesNotMatch(example, /^AMAZON_API_KEY=\S/m);
});

test("new providers are hidden until asked, then sort after Facebook", () => {
  const base = { nativeGoogle: true, nativeFacebook: true, nativeApple: true, broker: false };
  const current = visibleSignInProviders(base).map((row) => row.idp);
  assert.deepEqual(current, ["apple", "google", "facebook"]);
  const withStores = visibleSignInProviders({ ...base, nativeHuawei: true, nativeAmazon: true });
  assert.deepEqual(withStores.map((row) => row.idp), ["apple", "google", "facebook", "huawei", "amazon"]);
  assert.deepEqual(providersForStore(withStores, "web").map((row) => row.idp), ["apple", "google", "facebook", "huawei", "amazon"]);
  assert.deepEqual(providersForStore(withStores, "google").map((row) => row.idp), ["google", "facebook"]);
  assert.deepEqual(providersForStore(withStores, "samsung").map((row) => row.idp), ["google", "facebook"]);
  assert.deepEqual(providersForStore(withStores, "huawei").map((row) => row.idp), ["facebook", "huawei"]);
  assert.deepEqual(providersForStore(withStores, "amazon").map((row) => row.idp), ["facebook", "amazon"]);
});

test("social profiles do not carry a role", () => {
  const huawei = mapHuaweiProfile({ openID: "hw-1", email: "parent@example.ca", displayName: "Ada" });
  const amazon = mapAmazonProfile({ user_id: "amzn1.account.1", email: "parent@example.ca", name: "Ada" });
  assert.equal(Object.hasOwn(huawei, "role"), false);
  assert.equal(Object.hasOwn(amazon, "emailVerified"), true);
  assert.equal(Object.hasOwn(amazon, "role"), false);
  assert.match(src("src/lib/auth/server.ts"), /"huawei"/);
  assert.match(src("src/lib/auth/server.ts"), /"amazon"/);
  assert.match(src("src/lib/copy-en.ts"), /continueHuawei: "Continue with Huawei"/);
  assert.match(src("src/lib/copy-en.ts"), /continueAmazon: "Continue with Amazon"/);
  assert.match(src("src/lib/copy-fr.ts"), /continueHuawei: "Continuer avec Huawei"/);
  assert.match(src("src/lib/copy-fr.ts"), /continueAmazon: "Continuer avec Amazon"/);
  assert.match(src("src/lib/server/roles.ts"), /roleFlipAllowed/);
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
