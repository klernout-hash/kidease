import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CHILD_PROFILES_COLLECTED, parentNavCollectsChildData } from "../src/lib/child-collection.ts";
import {
  nativeAuthFinishUrl,
  nativeHandoffPath,
  nativeOAuthReturnPath,
  nativeSocialPlatform,
  parseNativeAuthFinish,
  providersForNativeShell,
  safeInAppPath,
} from "../src/lib/auth/native-oauth.ts";
import { nativeShellPrompt } from "../src/lib/native-prompt.ts";
import { nativeAdminRedirectTarget } from "../src/lib/native-admin.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("native admin requests stay off the Access path", () => {
  assert.equal(
    nativeAdminRedirectTarget({ pathname: "/admin-chat", userAgent: "iPhone KidEaseNative" }),
    "/app-admin-unavailable",
  );
  assert.equal(nativeAdminRedirectTarget({ pathname: "/search", cookie: "ke_shell=native" }), null);
});

test("child profiles stay parent-owned and the admin note is not an Access path", () => {
  assert.equal(CHILD_PROFILES_COLLECTED, true);
  assert.equal(parentNavCollectsChildData("children"), true);
  assert.equal(
    nativeAdminRedirectTarget({ pathname: "/app-admin-unavailable", userAgent: "iPhone KidEaseNative" }),
    null,
  );
  assert.match(src("src/lib/desk-nav.ts"), /id: "children"/);
  assert.match(src("src/lib/server/enrol-queue.ts"), /data\.consent !== true/);
  assert.match(src("src/lib/child-health-crypto.ts"), /aes-256-gcm/);
  assert.match(src("src/lib/server/family.ts"), /sealHealth/);
  assert.match(src("src/lib/server/family.ts"), /delete from children where user_id/);
  assert.match(src("migrations/0106_child_profile_access.sql"), /child_profile_access/);
  assert.match(src("migrations/0105_stop_child_pii_collection.sql"), /does not DROP/);
});

test("native prompts show consent before notifications, one at a time", () => {
  assert.equal(nativeShellPrompt({ native: true, consentUnset: true, pushExplain: true }), "consent");
  assert.equal(nativeShellPrompt({ native: true, consentUnset: false, pushExplain: true }), "push");
  assert.equal(nativeShellPrompt({ native: true, consentUnset: false, pushExplain: false }), "none");
  assert.equal(nativeShellPrompt({ native: false, consentUnset: true, pushExplain: true }), "none");
  const push = src("src/components/push-explain.tsx");
  assert.match(push, /nativeShellPrompt/);
  assert.match(src("src/styles.css"), /menu-account-actions/);
  assert.match(src("src/styles.css"), /z-index: 45/);
});

test("iOS social login stays in an auth sheet and offers Apple or email only", () => {
  const google = [{ idp: "google" }, { idp: "facebook" }];
  assert.deepEqual(providersForNativeShell(google, { native: true, platform: "ios" }), []);
  assert.deepEqual(
    providersForNativeShell([{ idp: "apple" }, ...google], { native: true, platform: "ios" }).map((row) => row.idp),
    ["apple", "google", "facebook"],
  );
  assert.deepEqual(providersForNativeShell(google, { native: true, platform: "android" }).map((row) => row.idp), [
    "google",
    "facebook",
  ]);
  assert.equal(nativeSocialPlatform({ native: true, channel: "apple" }), "ios");
  assert.equal(nativeSocialPlatform({ native: false, channel: "apple" }), "web");
  assert.equal(safeInAppPath("https://evil.example"), "/login");
  assert.equal(nativeOAuthReturnPath("/parent"), "/auth/app-return?next=%2Fparent");
  const finish = nativeAuthFinishUrl({ code: "abc", next: "/parent" });
  assert.equal(parseNativeAuthFinish(finish)?.code, "abc");
  assert.equal(parseNativeAuthFinish(finish)?.next, "/parent");
  assert.equal(nativeHandoffPath({ code: "abc", next: "/parent" }), "/auth/native-handoff?code=abc&next=%2Fparent");
  assert.match(src("src/lib/auth/client.ts"), /openNativeOAuthSheet/);
  assert.doesNotMatch(src("src/lib/auth/native-oauth-client.ts"), /window\.location\.href = providerUrl/);
  assert.match(src("ios/App/App/AuthSessionPlugin.swift"), /ASWebAuthenticationSession/);
  assert.match(src("src/lib/auth/native-oauth-client.ts"), /Browser\.open/);
});
