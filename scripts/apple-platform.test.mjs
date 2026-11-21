import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { appleLoginVisible } from "../src/lib/auth/apple-login-flag.ts";
import {
  appleLiveActivityPlan,
  applePlatformContext,
  appleShortcutItems,
  appleShortcutPath,
  appleWidgetSnapshot,
} from "../src/lib/apple/platform.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { STORE_PAYMENTS_ENABLED } from "../src/lib/native-entitlements.ts";
import { inAppReviewAllowed } from "../src/lib/store-review.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("Apple platform flags stay off and add nothing to the request", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_APPLE_LIVE_ACTIVITIES, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_APPLE_APP_SHORTCUTS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_APPLE_HOME_WIDGET, false);
  assert.deepEqual(applePlatformContext({}), {});
  assert.deepEqual(applePlatformContext({ FEATURE_APPLE_APP_SHORTCUTS: "0" }), {});
  assert.deepEqual(appleShortcutItems(false, "en"), []);
  assert.equal(appleLiveActivityPlan(false, { childName: "Amina", kind: "pickup", timeLabel: "4:30 pm" }), null);
  assert.equal(appleWidgetSnapshot(false, "en"), null);
  assert.equal(STORE_PAYMENTS_ENABLED.apple, false);
});

test("shortcuts, the widget line, and a pickup card appear only when that flag is on", () => {
  const shortcuts = appleShortcutItems(true, "fr");
  assert.equal(shortcuts.length, 3);
  assert.equal(shortcuts[0].path, "/search");
  assert.match(shortcuts[0].title, /garderie/);
  assert.equal(appleShortcutPath("ca.kidease.shortcut.help"), "/help");
  assert.equal(appleShortcutPath("com.example.other"), null);
  const widget = appleWidgetSnapshot(true, "en");
  assert.equal(widget?.title, "KidEase");
  assert.match(widget?.line || "", /Canada/);
  assert.doesNotMatch(widget?.line || "", /\$|rating|government|state/i);
  const plan = appleLiveActivityPlan(true, {
    childName: "Amina\n<script>",
    kind: "pickup",
    timeLabel: "4:30 pm",
    centreName: "Harbour Centre",
    locale: "en",
  });
  assert.equal(plan?.childName, "Amina <script>");
  assert.equal(plan?.title, "Pickup for Amina <script>");
  assert.match(plan?.body || "", /Harbour Centre/);
  assert.equal(plan && "allergies" in plan, false);
  assert.equal(appleLiveActivityPlan(true, { childName: "", kind: "pickup", timeLabel: "4:30 pm" }), null);
  assert.equal(appleLiveActivityPlan(true, { childName: "Amina", kind: "nap", timeLabel: "4:30 pm" }), null);
  assert.deepEqual(applePlatformContext({ FEATURE_APPLE_HOME_WIDGET: "1" }), { appleHomeWidget: true });
});

test("Sign in with Apple, Universal Links, and the review sheet are already present", () => {
  assert.equal(appleLoginVisible({}), false);
  assert.equal(inAppReviewAllowed("apple"), true);
  const entitlements = src("ios/App/App/App.entitlements");
  assert.match(entitlements, /com\.apple\.developer\.applesignin/);
  assert.match(entitlements, /applinks:www\.kidease\.ca/);
  assert.doesNotMatch(entitlements, /aps-environment/);
  const aasa = src("public/.well-known/apple-app-site-association.json");
  assert.match(aasa, /GAUC28WJXZ\.ca\.kidease\.app/);
  assert.match(src("ios/App/App/AppleSignInPlugin.swift"), /ASAuthorizationAppleIDProvider/);
  assert.match(src("ios/App/App/ApplePlatformPlugin.swift"), /needs-info-plist/);
  assert.match(src("ios/App/App/ApplePlatformPlugin.swift"), /pushType: nil/);
  assert.doesNotMatch(src("ios/App/App/Info.plist"), /NSSupportsLiveActivities/);
  assert.match(src("src/components/native-boot.tsx"), /appleShortcuts !== true/);
  assert.match(src("src/components/care-reminder-form.tsx"), /appleLive !== true/);
});
