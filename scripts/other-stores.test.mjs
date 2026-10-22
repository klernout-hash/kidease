import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { providersForStore } from "../src/lib/auth/providers.ts";
import {
  commercePolicyForChannel,
  googleServicesHidden,
  microsoftStoreCookieHeader,
  shellBlocksCommerce,
  storeChannelFromSignals,
  userAgentForStoreBuild,
  withoutSamsungStoreQuery,
} from "../src/lib/native-entitlements.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("store channel blocks Stripe on Apple, Play, and Huawei only", () => {
  assert.equal(storeChannelFromSignals({ userAgent: "Mozilla KidEaseNative" }), "google");
  assert.equal(storeChannelFromSignals({ userAgent: "iPhone KidEaseNative" }), "apple");
  assert.equal(
    storeChannelFromSignals({ userAgent: "Android KidEaseNative KidEaseStoreSamsung" }),
    "samsung",
  );
  assert.equal(
    storeChannelFromSignals({ userAgent: "Android KidEaseNative KidEaseStoreHuawei" }),
    "huawei",
  );
  assert.equal(storeChannelFromSignals({ search: "?store=microsoft" }), "microsoft");
  assert.equal(storeChannelFromSignals({ cookie: "ke_store=microsoft" }), "microsoft");
  assert.equal(
    storeChannelFromSignals({
      userAgent: "iPhone KidEaseNative",
      search: "?store=microsoft",
      cookie: "ke_store=microsoft",
    }),
    "apple",
  );
  assert.equal(
    shellBlocksCommerce(
      storeChannelFromSignals({
        userAgent: "Android KidEaseNative",
        search: "?store=microsoft",
        cookie: "ke_store=microsoft",
      }),
    ),
    true,
  );
  assert.equal(
    storeChannelFromSignals({
      userAgent: "Android KidEaseNative KidEaseStoreSamsung",
      search: "?store=microsoft",
      cookie: "ke_store=microsoft",
    }),
    "samsung",
  );
  assert.equal(storeChannelFromSignals({ userAgent: "Mozilla" }), "web");
  assert.equal(shellBlocksCommerce("samsung"), false);
  assert.equal(shellBlocksCommerce("microsoft"), false);
  assert.equal(shellBlocksCommerce("web"), false);
  assert.equal(shellBlocksCommerce("huawei"), true);
  assert.equal(shellBlocksCommerce("google"), true);
  assert.equal(shellBlocksCommerce("apple"), true);
  assert.equal(
    microsoftStoreCookieHeader({ search: "?store=microsoft", userAgent: "Mozilla/5.0" }),
    "ke_store=microsoft; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
  );
  assert.equal(
    microsoftStoreCookieHeader(
      { search: "?store=microsoft", userAgent: "Mozilla/5.0" },
      { secure: false },
    ),
    "ke_store=microsoft; Path=/; Max-Age=31536000; SameSite=Lax",
  );
  assert.equal(
    microsoftStoreCookieHeader({
      search: "?store=microsoft",
      userAgent: "Android KidEaseNative",
    }),
    null,
  );
  assert.equal(
    microsoftStoreCookieHeader({
      search: "?store=microsoft",
      userAgent: "iPhone KidEaseNative",
    }),
    null,
  );
  assert.equal(
    microsoftStoreCookieHeader({ search: "/", cookie: "ke_store=microsoft", userAgent: "Mozilla/5.0" }),
    null,
  );
  assert.equal(
    storeChannelFromSignals({
      userAgent: "Android KidEaseNative",
      cookie: "ke_store=microsoft",
    }),
    "google",
  );
  assert.equal(commercePolicyForChannel("samsung").showCheckout, true);
  assert.equal(commercePolicyForChannel("microsoft").showStripeLinks, true);
  assert.equal(commercePolicyForChannel("huawei").showCheckout, false);
  assert.equal(commercePolicyForChannel("huawei").showSubscribeOnWeb, false);
  assert.equal(googleServicesHidden("huawei"), true);
  assert.equal(googleServicesHidden("samsung"), false);
  assert.equal(googleServicesHidden("google"), false);
});

test("Huawei hides Google sign-in and the other stores do not", () => {
  const providers = [
    { idp: "google", providerId: "google" },
    { idp: "facebook", providerId: "facebook" },
    { idp: "apple", providerId: "apple" },
  ];
  assert.deepEqual(
    providersForStore(providers, "huawei").map((row) => row.idp),
    ["facebook", "apple"],
  );
  assert.equal(providersForStore(providers, "samsung").length, 3);
  assert.match(src("src/routes/login.tsx"), /providersForStore/);
  assert.match(src("src/components/map-view.tsx"), /StoreMapFallback/);
  assert.match(src("src/routes/search.tsx"), /storeChannel === "huawei"/);
  assert.match(src("src/components/listing-map.tsx"), /StoreMapFallback/);
  assert.match(src("src/lib/push-client.ts"), /googleServicesHidden/);
  assert.match(src("src/lib/native.ts"), /googleServicesHidden/);
});

test("PWA manifest for Partner Center stays installable and does not retag the website", () => {
  const site = JSON.parse(src("public/manifest.webmanifest"));
  const microsoft = JSON.parse(src("public/manifest.microsoft.webmanifest"));
  assert.equal(site.start_url, "/");
  assert.equal(microsoft.start_url, "/?store=microsoft");
  assert.equal(microsoft.display, "standalone");
  assert.equal(microsoft.scope, "/");
  assert.ok(microsoft.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "any"));
  assert.ok(microsoft.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(microsoft.icons.some((icon) => icon.purpose === "maskable"));
  assert.equal(existsSync(join(root, "public/icon-512.png")), true);
  assert.equal(existsSync(join(root, "public/icons/icon-192.png")), true);
  assert.equal(existsSync(join(root, "public/icons/icon-maskable-512.png")), true);
  const sw = src("public/sw.js");
  assert.match(sw, /kidease-shell-v6/);
  assert.doesNotMatch(sw, /Chrome-only/);
  assert.match(sw, /Microsoft Store/);
  assert.match(sw, /manifest\.microsoft\.webmanifest/);
  assert.match(sw, /caches\.match\("\/offline\.html"\)/);
  assert.match(sw, /Do not cache HTML/);
  assert.doesNotMatch(sw, /if \(cached\) return cached/);
  assert.match(src("public/offline.html"), /support@kidease\.ca/);
  assert.match(src("public/channel-boot.js"), /KidEaseStoreSamsung/);
  assert.match(src("public/channel-boot.js"), /ke_store=microsoft/);
  assert.match(src("public/channel-boot.js"), /q\.get\("store"\) === "microsoft" && !uaNative/);
  assert.match(src("public/channel-boot.js"), /Max-Age=0/);
  assert.match(src("public/channel-boot.js"), /display-mode: standalone/);
  assert.match(src("public/channel-boot.js"), /serviceWorker\.register\("\/sw\.js\?v=6"/);
  assert.match(src("src/routes/__root.tsx"), /channel-boot\.js\?v=6/);
  assert.match(src("src/lib/native.ts"), /register\("\/sw\.js\?v=6"/);
  assert.match(src("public/channel-boot.js"), /!n && !uaNative && \(store === "microsoft" \|\| standalone\)/);
  const rootHead = src("src/routes/__root.tsx");
  assert.match(rootHead, /manifest\.microsoft\.webmanifest/);
  assert.match(rootHead, /manifestHref/);
  assert.match(rootHead, /msapplication-TileColor/);
  assert.match(rootHead, /set-cookie/);
  assert.match(rootHead, /microsoftSetCookie/);
  assert.doesNotMatch(rootHead, /@tanstack\/react-start\/server/);
  assert.match(src("src/lib/store-channel-request.ts"), /microsoftStoreCookieHeader/);
  assert.match(src("src/components/native-boot.tsx"), /microsoftStoreCookieHeader/);
});

test("iOS and Play never send or set the Samsung store token", () => {
  assert.equal(
    storeChannelFromSignals({
      userAgent: "iPhone OS 18_0 KidEaseNative KidEaseStoreSamsung",
      search: "?store=samsung",
      cookie: "ke_store=samsung",
    }),
    "apple",
  );
  assert.equal(
    storeChannelFromSignals({
      userAgent: "Android KidEaseNative",
      search: "?store=samsung",
      cookie: "ke_store=samsung",
    }),
    "google",
  );
  assert.equal(
    shellBlocksCommerce(
      storeChannelFromSignals({
        userAgent: "Android KidEaseNative",
        search: "?store=samsung",
        cookie: "ke_store=samsung",
      }),
    ),
    true,
  );
  assert.equal(
    storeChannelFromSignals({
      userAgent: "Android KidEaseNative KidEaseStoreSamsung",
      search: "?store=samsung",
      cookie: "ke_store=samsung",
    }),
    "samsung",
  );
  assert.equal(userAgentForStoreBuild("play", "KidEaseNative", ""), "KidEaseNative");
  assert.equal(
    userAgentForStoreBuild("play", "KidEaseNative KidEaseStoreSamsung", "KidEaseStoreSamsung"),
    "KidEaseNative",
  );
  assert.equal(userAgentForStoreBuild("ios", "KidEaseNative KidEaseStoreSamsung", "KidEaseStoreSamsung"), "KidEaseNative");
  assert.equal(
    userAgentForStoreBuild("samsung", "KidEaseNative", "KidEaseStoreSamsung"),
    "KidEaseNative KidEaseStoreSamsung",
  );
  assert.equal(
    userAgentForStoreBuild("huawei", "KidEaseNative KidEaseStoreSamsung", "KidEaseStoreHuawei"),
    "KidEaseNative KidEaseStoreHuawei",
  );
  assert.equal(withoutSamsungStoreQuery("https://www.kidease.ca/?store=samsung"), "https://www.kidease.ca/");
  assert.equal(withoutSamsungStoreQuery("https://www.kidease.ca/?store=microsoft"), "https://www.kidease.ca/?store=microsoft");

  const gradle = src("android/app/build.gradle");
  const play = gradle.slice(gradle.indexOf("play {"), gradle.indexOf("samsung {"));
  const samsung = gradle.slice(gradle.indexOf("samsung {"), gradle.indexOf("huawei {"));
  assert.match(play, /STORE_UA_TOKEN", "\\"/);
  assert.doesNotMatch(play, /KidEaseStore/);
  assert.match(samsung, /KidEaseStoreSamsung/);
  assert.equal((gradle.match(/KidEaseStoreSamsung/g) || []).length, 1);

  const activity = src("android/app/src/main/java/ca/kidease/app/MainActivity.java");
  assert.match(activity, /userAgentForStoreBuild/);
  assert.match(activity, /"samsung"\.equals\(flavor\) && "KidEaseStoreSamsung"\.equals\(configured\)/);
  assert.match(activity, /!"samsung"\.equals\(flavor\)/);
  assert.match(activity, /withoutSamsungStoreQuery/);

  const ios = src("ios/App/App/KidEaseBridgeViewController.swift");
  assert.match(ios, /withoutForeignStoreToken/);
  assert.match(ios, /KidEaseStoreSamsung/);
  assert.match(ios, /withoutSamsungStoreQuery/);
  assert.doesNotMatch(ios, /appendUserAgent/);

  assert.match(src("capacitor.config.ts"), /appendUserAgent: "KidEaseNative"/);
  assert.doesNotMatch(src("capacitor.config.ts"), /KidEaseStoreSamsung/);
  assert.doesNotMatch(src("ios/App/App/capacitor.config.json"), /KidEaseStoreSamsung/);
  assert.doesNotMatch(src("android/app/src/main/assets/capacitor.config.json"), /KidEaseStoreSamsung/);
  assert.doesNotMatch(src("ios/App/App/capacitor.config.json"), /store=samsung/);
  assert.doesNotMatch(src("android/app/src/main/assets/capacitor.config.json"), /store=samsung/);

  const boot = src("public/channel-boot.js");
  assert.match(boot, /samsungBuild/);
  assert.match(boot, /ke_store=samsung/);
  assert.doesNotMatch(boot, /ke_store=samsung;/);
  assert.doesNotMatch(boot, /q\.get\("store"\) === "samsung"/);
});

test("Android flavours name the store and Huawei skips Google startup", () => {
  const gradle = src("android/app/build.gradle");
  assert.match(gradle, /productFlavors/);
  assert.match(gradle, /KidEaseStoreSamsung/);
  assert.match(gradle, /KidEaseStoreHuawei/);
  assert.match(gradle, /googleservices/);
  assert.match(gradle, /applicationId "ca\.kidease\.app"/);
  assert.match(src("android/app/src/main/java/ca/kidease/app/MainActivity.java"), /STORE_UA_TOKEN/);
  assert.match(src("android/app/src/huawei/AndroidManifest.xml"), /FirebaseInitProvider/);
  assert.match(src("android/app/src/huawei/AndroidManifest.xml"), /tools:node="remove"/);
  const doc = src("docs/other-stores.md");
  assert.match(doc, /10037493 MANITOBA LTD/);
  assert.match(doc, /243380273/);
  assert.match(doc, /Microsoft/);
  assert.match(doc, /Samsung/);
  assert.match(doc, /Huawei/);
  assert.match(doc, /10\.8\.1/);
  assert.match(doc, /Stripe/);
  assert.match(doc, /support@kidease\.ca/);
});
