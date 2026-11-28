import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ACCOUNT_SCOPED_LOCAL_KEYS,
  clearAccountScopedStorage,
} from "../src/lib/account-scoped-storage.ts";
import { signedOutLoginPath, signOutTarget } from "../src/lib/sign-out-target.ts";
import { RESUME_PATH_KEY } from "../src/lib/retention.ts";
import { SEARCH_MEMORY_KEY } from "../src/lib/search-memory.ts";
import { THEME_STORAGE_KEY } from "../src/lib/theme.ts";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

function memoryStorage(seed) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    removeItem: (key) => map.delete(key),
  };
}

test("N-37 / N-06: sign-out lands on the sign-in page in the current language", () => {
  assert.equal(signedOutLoginPath("en"), "/login");
  assert.equal(signedOutLoginPath("fr"), "/fr/login");
  assert.equal(signOutTarget({ role: "parent", pathname: "/fr/menu", locale: "fr" }), "/fr/login");
  assert.equal(
    signOutTarget({ role: "government", pathname: "/fr/gov", locale: "fr" }),
    "/fr/gov/login",
  );
  // The client default (used by older callers) is the sign-in page, never Guest Explore.
  assert.match(
    src("src/lib/auth/client.ts"),
    /export async function signOut\(redirectTo = "\/login"\)/,
  );
  // The Airbnb-style Account screens use the same sign-in landing.
  const airbnb = src("src/components/airbnb-screens.tsx");
  assert.doesNotMatch(airbnb, /signOut\(locale === "fr" \? "\/fr" : "\/"\)/);
  assert.equal(
    (airbnb.match(/signOut\(signedOutLoginPath\(locale === "fr" \? "fr" : "en"\)\)/g) || []).length,
    2,
  );
});

test("N-37: Sign out is above Delete account in both Menu layouts", () => {
  for (const file of [
    "src/components/app-menu-screen.tsx",
    "src/components/phone-category-menu.tsx",
  ]) {
    const body = src(file);
    const block = body.slice(body.indexOf('data-ke="menu-account-actions"'));
    const signOutAt = block.indexOf('data-ke="menu-sign-out"');
    const deleteAt = block.indexOf('data-ke="menu-delete-account"');
    assert.ok(signOutAt > 0 && deleteAt > 0, `${file} has both rows`);
    assert.ok(signOutAt < deleteAt, `${file}: Sign out comes before Delete account`);
  }
});

test("N-67: sign-out clears account-scoped history but keeps device settings", () => {
  const storage = memoryStorage({
    "kidease-recent": "[]",
    [RESUME_PATH_KEY]: "/daycare/synthetic",
    "kidease-recent-searches": "[]",
    [SEARCH_MEMORY_KEY]: "{}",
    [THEME_STORAGE_KEY]: "light",
    "kidease-text-scale": "large",
  });
  clearAccountScopedStorage(storage);
  assert.deepEqual(
    [...storage.map.keys()].sort(),
    [THEME_STORAGE_KEY, "kidease-text-scale"].sort(),
  );
  // The listed keys are the ones the app actually writes.
  assert.ok(ACCOUNT_SCOPED_LOCAL_KEYS.includes(RESUME_PATH_KEY));
  assert.ok(ACCOUNT_SCOPED_LOCAL_KEYS.includes(SEARCH_MEMORY_KEY));
  assert.match(src("src/lib/recent.ts"), /const KEY = "kidease-recent";/);
  assert.match(src("src/lib/recent-searches.ts"), /const STORAGE_KEY = "kidease-recent-searches";/);
  // Wired into the one place every sign-out and account switch passes through.
  const client = src("src/lib/auth/client.ts");
  const fn = client.slice(client.indexOf("export function clearClientAuthState"));
  assert.match(fn.slice(0, fn.indexOf("\n}\n")), /clearAccountScopedStorage\(\);/);
});

test("N-67: a throwing storage does not stop sign-out", () => {
  assert.doesNotThrow(() =>
    clearAccountScopedStorage({
      removeItem: () => {
        throw new Error("quota");
      },
    }),
  );
});

test("N-34: native sign-out drops Keychain tokens before the server call", () => {
  const client = src("src/lib/persistent-session-client.ts");
  const fn = client.slice(client.indexOf("export async function endPersistentSession"));
  const removeAt = fn.indexOf("await secureRemove(REFRESH_KEY)");
  const stepAt = fn.indexOf("await secureRemove(STEP_KEY)");
  const revokeAt = fn.indexOf("revokePersistentDevice({ data: { current: true } })");
  assert.ok(removeAt > 0 && stepAt > 0 && revokeAt > 0);
  assert.ok(removeAt < revokeAt && stepAt < revokeAt, "local tokens go first");
});

test("N-34: iOS purges session Keychain items on the first launch after a reinstall", () => {
  const app = src("ios/App/App/AppDelegate.swift");
  const plugin = src("ios/App/App/AuthSessionPlugin.swift");
  assert.match(app, /Self\.purgeSessionKeychainAfterReinstall\(\)/);
  assert.match(app, /if defaults\.bool\(forKey: installMarkerKey\) \{ return \}/);
  assert.match(app, /SecItemDelete\(query as CFDictionary\)/);
  assert.match(app, /defaults\.set\(true, forKey: installMarkerKey\)/);
  // Same Keychain service the SecureSession plugin writes.
  const service = /private let service = "([^"]+)"/.exec(plugin)?.[1];
  assert.ok(service);
  assert.match(app, new RegExp(`sessionKeychainService = "${service.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  // Android never restores app data from a backup, so no reinstall purge is needed there.
  assert.match(src("android/app/src/main/AndroidManifest.xml"), /android:allowBackup="false"/);
});
