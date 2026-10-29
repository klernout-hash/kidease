import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { homeLandPath, openAdminDesk } from "../src/lib/desks.ts";
import {
  NATIVE_ADMIN_NOTE_PATH,
  accessPathname,
  isNativeAdminNotePath,
  nativeAdminRedirectTarget,
  bottomBarKindInShell,
  chromeRoleInNativeShell,
  cookieMarksNativeShell,
  desksVisibleInShell,
  isAccessProtectedPath,
  isCloudflareAccessHost,
  nativeAccountDest,
  nativeAdminNoteCopy,
  nativeShellHidesAdmin,
  notificationHrefForShell,
} from "../src/lib/native-admin.ts";
import { storeChannelFromSignals } from "../src/lib/native-entitlements.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const IOS = "Mozilla/5.0 (iPhone) KidEaseNative";
const PLAY = "Mozilla/5.0 (Linux; Android 14) KidEaseNative";
const SAMSUNG = "Mozilla/5.0 (Linux; Android 14) KidEaseNative KidEaseStoreSamsung";
const HUAWEI = "Mozilla/5.0 (Linux; Android 14) KidEaseNative KidEaseStoreHuawei";
const WEB = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
const MICROSOFT = "Mozilla/5.0 (Windows NT 10.0) KidEaseStoreMicrosoft";

test("native shell hides Admin; the website and Microsoft package do not", () => {
  assert.equal(nativeShellHidesAdmin({ userAgent: IOS }), true);
  assert.equal(nativeShellHidesAdmin({ userAgent: PLAY }), true);
  assert.equal(nativeShellHidesAdmin({ userAgent: SAMSUNG }), true);
  assert.equal(nativeShellHidesAdmin({ userAgent: HUAWEI }), true);
  assert.equal(nativeShellHidesAdmin({ nativePlatform: true, userAgent: WEB }), true);
  assert.equal(nativeShellHidesAdmin({ userAgent: WEB }), false);
  assert.equal(nativeShellHidesAdmin({ userAgent: MICROSOFT }), false);
  assert.equal(nativeShellHidesAdmin({ userAgent: WEB, cookie: "ke_shell=native" }), true);
  assert.equal(cookieMarksNativeShell("theme=light; ke_shell=native"), true);
  assert.equal(cookieMarksNativeShell("ke_store=microsoft"), false);
  assert.equal(storeChannelFromSignals({ userAgent: WEB }), "web");
  assert.equal(storeChannelFromSignals({ userAgent: IOS }), "apple");
  assert.equal(storeChannelFromSignals({ userAgent: MICROSOFT }), "microsoft");
});

test("Access paths are admin only, and the in-app note is not one of them", () => {
  for (const path of ["/admin", "/admin?tab=queue", "/admin/", "/admin/features", "/admin-chat", "/admin-contracts", "/fr/admin", "/api/admin/contracts", "https://www.kidease.ca/admin"]) {
    assert.equal(isAccessProtectedPath(path), true, path);
  }
  for (const path of ["/", "/parent", "/provider", "/login", "/support", "/help", "/search", "/menu", "/account", NATIVE_ADMIN_NOTE_PATH, "/fr/parent"]) {
    assert.equal(isAccessProtectedPath(path), false, path);
  }
  assert.equal(accessPathname("/fr/admin?tab=queue"), "/admin");
  assert.equal(isCloudflareAccessHost("kidease.cloudflareaccess.com"), true);
  assert.equal(isCloudflareAccessHost("www.kidease.ca"), false);
  assert.equal(isAccessProtectedPath(NATIVE_ADMIN_NOTE_PATH), false);
});

test("native admin accounts keep a normal desk; the website still opens Admin", () => {
  assert.equal(homeLandPath({ role: "admin" }), "/admin");
  assert.equal(homeLandPath({ role: "admin", hideStaffWebOnly: true }), null);
  assert.equal(homeLandPath({ role: "admin", sticky: "admin", hideStaffWebOnly: true }), null);
  assert.equal(homeLandPath({ role: "admin", sticky: "provider", hideStaffWebOnly: true }), "/provider");
  assert.equal(homeLandPath({ role: "parent", hideStaffWebOnly: true }), null);
  assert.equal(homeLandPath({ role: "support", hideStaffWebOnly: true }), "/support");

  assert.equal(nativeAccountDest({ hideAdmin: false, dest: "/admin", role: "admin" }), "/admin");
  assert.equal(nativeAccountDest({ hideAdmin: true, dest: "/admin", role: "admin" }), "/parent");
  assert.equal(nativeAccountDest({ hideAdmin: true, dest: "/admin", role: "provider" }), "/provider");
  assert.equal(nativeAccountDest({ hideAdmin: true, dest: "/parent", role: "admin" }), "/parent");
  assert.equal(nativeAccountDest({ hideAdmin: true, dest: "/support", role: "support" }), "/support");

  assert.deepEqual(desksVisibleInShell(["parent", "provider", "admin"], true), ["parent", "provider"]);
  assert.deepEqual(desksVisibleInShell(["parent", "provider", "admin"], false), ["parent", "provider", "admin"]);
  assert.equal(chromeRoleInNativeShell("admin", true), "parent");
  assert.equal(chromeRoleInNativeShell("admin", false), "admin");
  assert.equal(chromeRoleInNativeShell("provider", true), "provider");
  assert.equal(bottomBarKindInShell("admin", true), "parent");
  assert.equal(bottomBarKindInShell("daycare", true), "daycare");
  assert.equal(notificationHrefForShell("/admin?tab=queue", true), NATIVE_ADMIN_NOTE_PATH);
  assert.equal(notificationHrefForShell("/inbox", true), "/inbox");
  assert.equal(notificationHrefForShell("/admin", false), "/admin");
});

test("the note page says Admin is on the website and does not open Safari", () => {
  const en = nativeAdminNoteCopy("en");
  const fr = nativeAdminNoteCopy("fr");
  assert.equal(en.lead, "Admin is available on kidease.ca in a browser");
  assert.match(fr.lead, /kidease\.ca/);
  assert.doesNotMatch(en.lead, /https?:\/\//);
  const page = src("src/components/admin-on-web-note.tsx");
  assert.match(page, /nativeAdminNoteCopy/);
  assert.match(src("src/routes/app-admin-unavailable.tsx"), /AdminOnWebNote/);
  assert.match(src("src/routes/use-the-website.tsx"), /AdminOnWebNote/);
  assert.match(src("src/routes/app-admin-unavailable.tsx"), /noindex/);
  assert.doesNotMatch(page, /window\.open|Browser\.open|target="_blank"/);
  assert.equal(typeof openAdminDesk, "function");
  const desks = src("src/lib/desks.ts");
  const fn = desks.slice(desks.indexOf("export function openAdminDesk"));
  assert.match(fn, /nativeShellHidesAdminNow\(\)/);
  assert.match(fn, /NATIVE_ADMIN_NOTE_PATH/);
  assert.match(fn, /location\.assign\(DESK_PATH\.admin\)/);
});

test("server HTML, the boot script, and both shells block Access before Safari", () => {
  const rootHtml = src("src/routes/__root.tsx");
  assert.match(rootHtml, /hideAdmin/);
  assert.match(rootHtml, /data-native/);
  assert.match(rootHtml, /NATIVE_ADMIN_NOTE_PATH/);
  assert.match(rootHtml, /channel-boot\.js\?v=10/);
  assert.equal(nativeAdminRedirectTarget({ pathname: "/admin", userAgent: IOS }), NATIVE_ADMIN_NOTE_PATH);
  assert.equal(nativeAdminRedirectTarget({ pathname: "/admin", cookie: "ke_shell=native" }), NATIVE_ADMIN_NOTE_PATH);
  assert.equal(nativeAdminRedirectTarget({ pathname: "/admin", userAgent: WEB }), null);
  assert.equal(nativeAdminRedirectTarget({ pathname: "/parent", userAgent: IOS }), null);
  assert.equal(isNativeAdminNotePath("/use-the-website"), true);
  assert.equal(isAccessProtectedPath("/app-admin-unavailable"), false);
  const boot = src("public/channel-boot.js");
  assert.match(boot, /ke_shell=native/);
  assert.match(boot, /dataset\.native = "1"/);
  assert.match(boot, /\/app-admin-unavailable/);
  assert.match(boot, /isNativePlatform/);
  assert.doesNotMatch(boot, /ke_shell=native[\s\S]{0,80}store === "microsoft"/);
  const swift = src("ios/App/App/KidEaseBridgeViewController.swift");
  assert.match(swift, /ensureNativeToken/);
  assert.match(swift, /KidEaseNative/);
  assert.match(swift, /shouldOverrideLoad/);
  assert.match(swift, /cloudflareaccess\.com/);
  assert.match(swift, /\/app-admin-unavailable/);
  assert.match(swift, /\/use-the-website/);
  assert.match(swift, /AuthSessionPlugin/);
  assert.doesNotMatch(swift, /appendUserAgent/);
  assert.match(src("ios/App/App/capacitor.config.json"), /"appendUserAgent": "KidEaseNative"/);
  const java = src("android/app/src/main/java/ca/kidease/app/AdminWebOnly.java");
  assert.match(java, /cloudflareaccess\.com/);
  assert.match(java, /\/app-admin-unavailable/);
  assert.match(java, /\/use-the-website/);
  assert.match(src("android/app/src/main/java/ca/kidease/app/MainActivity.java"), /installAdminWebOnlyClient/);
  assert.match(src("src/components/desk-switcher.tsx"), /desksVisibleInShell/);
  assert.match(src("src/components/app-tab-bar.tsx"), /bottomBarKindInShell/);
  assert.match(src("src/components/role-nav.tsx"), /chromeRoleInNativeShell/);
  assert.match(src("src/lib/auth/login-funnel.ts"), /isAccessProtectedPath/);
});
