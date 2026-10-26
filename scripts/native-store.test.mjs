import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { shouldStartTelemetry } from "../src/lib/analytics-consent.ts";
import { isNativeUserAgent, nativeBlocksCheckout, nativeCommercePolicy, plansVisibleInShell } from "../src/lib/native-entitlements.ts";
import { sanitizePostHogProperties } from "../src/lib/posthog.ts";
import { resolveProviderEntitlements } from "../src/lib/provider-entitlements.ts";
import { scrubPiiString } from "../src/lib/sentry-shared.ts";
import { STORE } from "../src/lib/store-listing.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("native shell sells nothing and still unlocks a centre plan bought on the website", () => {
  const native = nativeCommercePolicy(true);
  const web = nativeCommercePolicy(false);
  assert.equal(native.sellDigitalGoods, false);
  assert.equal(native.showParentAlerts, false);
  assert.equal(native.showParentPlus, false);
  assert.equal(native.showCheckout, false);
  assert.equal(native.showSubscribeOnWeb, false);
  assert.equal(native.parentPlusIap, null);
  assert.equal(native.daycarePurchasesUnlock, true);
  assert.equal(web.showCheckout, true);
  assert.equal(nativeBlocksCheckout(true), true);
  assert.equal(nativeBlocksCheckout(false), false);
  const plans = plansVisibleInShell(
    [
      { id: "alerts" },
      { id: "plus" },
      { id: "pro" },
    ],
    true,
  );
  assert.deepEqual(plans.map((plan) => plan.id), []);
  assert.equal(plansVisibleInShell([{ id: "alerts" }], false).length, 1);
  const paid = resolveProviderEntitlements({
    plan: "pro",
    status: "active",
    stripeLive: true,
    addons: [],
  });
  assert.equal(paid.unlimitedInquiries, true);
  assert.equal(paid.entitledPlan, "pro");
});

test("KidEaseNative user agent is the server signal and Stripe checkout is blocked", () => {
  assert.equal(isNativeUserAgent("Mozilla KidEaseNative"), true);
  assert.equal(isNativeUserAgent("Mozilla"), false);
  assert.match(src("capacitor.config.ts"), /appendUserAgent: "KidEaseNative"/);
  assert.match(src("src/lib/wallets.ts"), /Payments are not part of this app/);
  assert.doesNotMatch(src("src/lib/wallets.ts"), /Browser\.open/);
  assert.match(src("src/styles.css"), /html\[data-runtime="native"\] \.ke-digital-plan/);
  assert.match(src("public/channel-boot.js"), /KidEaseNative/);
  const java = src("android/app/src/test/java/ca/kidease/app/ExampleUnitTest.java");
  assert.match(java, /package ca\.kidease\.app/);
  assert.equal(existsSync(join(root, "android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java")), false);
  assert.equal(
    existsSync(join(root, "android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java")),
    false,
  );
});

test("native telemetry waits for Allow; the website Sentry path does not", () => {
  assert.equal(shouldStartTelemetry("sentry", { native: true, consent: "unset" }), false);
  assert.equal(shouldStartTelemetry("posthog", { native: true, consent: "denied" }), false);
  assert.equal(shouldStartTelemetry("web-vitals", { native: true, consent: "granted" }), true);
  assert.equal(shouldStartTelemetry("sentry", { native: false, consent: "unset" }), false);
  assert.equal(shouldStartTelemetry("sentry", { native: false, consent: "granted" }), true);
  assert.equal(shouldStartTelemetry("web-vitals", { native: false, consent: "unset" }), true);
  assert.equal(shouldStartTelemetry("posthog", { native: false, consent: "unset" }), false);
  assert.match(src("src/lib/sentry.client.ts"), /shouldStartTelemetry\("sentry"/);
  assert.match(src("src/lib/web-vitals.ts"), /shouldStartWebVitals/);
});

test("health phrases are scrubbed from Sentry text and PostHog values", () => {
  assert.match(scrubPiiString("allergy peanuts and medication inhaler"), /\[health\]/);
  const props = sanitizePostHogProperties({
    page: "account",
    note: "medical note: asthma",
    allergies: "peanuts",
  });
  assert.equal(props.note, "[Filtered]");
  assert.equal("allergies" in props, false);
  assert.equal(props.page, "account");
});

test("store listing is 18+ and does not promise in-app checkout", () => {
  assert.equal(STORE.secondaryCategory, "Productivity");
  assert.equal(STORE.ageRating, "18+");
  assert.equal(STORE.ageRatingAnswers.madeForKids, false);
  assert.doesNotMatch(STORE.description, /Apple Pay|in-app/i);
  assert.equal(STORE.supportEmail, "support@kidease.ca");
  assert.match(STORE.description, /Support: support@kidease\.ca/);
  assert.match(STORE.descriptionFr, /Soutien : support@kidease\.ca/);
  assert.doesNotMatch(STORE.description, /bought on kidease\.ca/i);
  assert.doesNotMatch(STORE.descriptionFr, /acheté sur kidease\.ca/i);
  assert.match(src("docs/store-review-notes.md"), /Support: support@kidease\.ca/);
  assert.match(src("docs/app-store-privacy.md"), /Support: support@kidease\.ca/);
  assert.match(src("docs/play-data-safety.md"), /Support: support@kidease\.ca/);
  assert.ok(STORE.subtitleFr.length <= 30, STORE.subtitleFr);
  assert.match(STORE.description, /18\+/);
  const manifest = src("ios/App/App/PrivacyInfo.xcprivacy");
  assert.match(manifest, /NSPrivacyCollectedDataTypeHealth/);
  assert.match(manifest, /NSPrivacyCollectedDataTypePhoneNumber/);
  assert.match(manifest, /NSPrivacyCollectedDataTypeSearchHistory/);
  assert.match(manifest, /NSPrivacyCollectedDataTypeCustomerSupport/);
  assert.match(manifest, /NSPrivacyCollectedDataTypeOtherUserContent/);
  const usage = manifest.slice(
    manifest.indexOf("NSPrivacyCollectedDataTypeProductInteraction"),
    manifest.indexOf("NSPrivacyCollectedDataTypeCrashData"),
  );
  assert.match(usage, /NSPrivacyCollectedDataTypeLinked[\s\S]*<true\/>/);
  assert.match(manifest, /NSPrivacyTracking/);
  assert.match(src("docs/app-store-privacy.md"), /linked to the account id/);
  assert.match(src("docs/play-data-safety.md"), /linked to the account id/);
  assert.match(src("docs/play-data-safety.md"), /Search history/);
  assert.match(src("docs/app-store-privacy.md"), /screening/);
  assert.match(src("android/app/build.gradle"), /useLegacyPackaging = false/);
  assert.match(src("android/app/build.gradle"), /firebase-analytics/);
  assert.match(src("src/components/parent-signup-form.tsx"), /18 or older/);
});

test("a call opened from messages can use the camera and microphone", () => {
  const vercel = JSON.parse(src("vercel.json"));
  const headers = vercel.headers;
  const policyFor = (source) => {
    const block = headers.find((entry) => entry.source === source);
    const row = block?.headers?.find((header) => header.key === "Permissions-Policy");
    return row?.value || "";
  };
  for (const source of ["/(.*)", "/call", "/call/(.*)", "/video", "/video/(.*)"]) {
    const policy = policyFor(source);
    assert.match(policy, /camera=\(self\)/, source);
    assert.match(policy, /microphone=\(self\)/, source);
    assert.doesNotMatch(policy, /camera=\(\)/, source);
    assert.doesNotMatch(policy, /microphone=\(\)/, source);
  }
  const inbox = src("src/routes/inbox.$id.tsx");
  assert.match(inbox, /to="\/call\/\$conversationId"[\s\S]*reloadDocument/);
  assert.match(inbox, /to="\/video\/\$roomId"[\s\S]*reloadDocument/);
  assert.doesNotMatch(src("src/routes/__root.tsx"), /@tanstack\/react-start\/server/);
  assert.match(src("src/lib/native-shell-request.ts"), /readNativeShell/);
  assert.match(src("src/lib/store-channel-request.ts"), /readServerStoreChannel/);
});
