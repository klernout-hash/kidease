import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { pushPromptStep } from "../src/lib/push-prompt.ts";
import { tx } from "../src/lib/copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("native shell hides digital plans and does not rename the application id", () => {
  const css = src("src/styles.css");
  assert.match(css, /html\[data-runtime="ios"\] \.ke-digital-plan/);
  assert.match(css, /html\[data-runtime="android"\] \[data-nav="upgrade"\]/);
  assert.match(css, /html\[data-runtime="android"\] \[data-nav="plans"\]/);
  assert.match(css, /html\[data-runtime="ios"\] \[data-nav="promote"\]/);
  assert.match(css, /html\[data-runtime="ios"\] \[data-ke="store-coming-soon"\]/);
  assert.match(css, /html\[data-runtime="android"\] \[data-ke="sms-entry"\]/);
  assert.match(css, /html\[data-runtime="ios"\] \[data-nav="chat"\]/);
  const pay = src("src/components/pay-chrome.tsx");
  assert.match(pay, /data-ke="digital-plan"/);
  assert.match(src("src/components/parent-plus.tsx"), /data-ke="digital-plan"/);
  assert.match(src("src/routes/account.tsx"), /data-ke="account-delete"/);
  assert.match(src("src/routes/delete-account.tsx"), /deleteAccountKeepBilling/);
  assert.match(src("src/routes/delete-account.tsx"), /deleteAccountKeepLogs/);
  assert.doesNotMatch(src("src/routes/delete-account.tsx"), /email support/i);
  assert.match(src("src/routes/get-app.tsx"), /data-ke="store-coming-soon"/);
  assert.match(src("src/lib/features.ts"), /FEATURE_INAPP_CHAT/);
  const gradle = src("android/app/build.gradle");
  const vars = src("android/variables.gradle");
  const manifest = src("android/app/src/main/AndroidManifest.xml");
  assert.match(vars, /targetSdkVersion = 36/);
  assert.match(gradle, /applicationId "ca\.daycarenearme\.app"/);
  assert.doesNotMatch(gradle, /ca\.kidease\.app/);
  assert.match(src("docs/mobile-builds.md"), /bundleRelease/);
  assert.match(src("docs/mobile-builds.md"), /app-release\.aab/);
  assert.doesNotMatch(manifest, /READ_SMS|RECEIVE_SMS|READ_CALL_LOG|READ_CONTACTS|ACCESS_BACKGROUND_LOCATION/);
  assert.match(manifest, /ACCESS_FINE_LOCATION/);
  assert.match(manifest, /ACCESS_COARSE_LOCATION/);
  assert.doesNotMatch(src("src/lib/use-push.ts"), /requestPermissions/);
  assert.equal(pushPromptStep({ enabled: false, firstLaunch: true, choice: null }), "done");
  assert.equal(pushPromptStep({ enabled: false, firstLaunch: false, choice: null }), "done");
  assert.match(tx("en", "deleteAccountLead"), /keep billing records the law requires/i);
  assert.match(tx("en", "deleteAccountKeepBilling"), /tax law/i);
  assert.match(tx("en", "deleteAccountKeepLogs"), /security logs/i);
  assert.match(tx("fr", "deleteAccountLead"), /dossiers de facturation exigés par la loi/);
  assert.match(tx("es", "deleteAccountLead"), /facturación/);
  assert.doesNotMatch(tx("es", "deleteAccountLead"), /pagos/);
  assert.match(tx("en", "nativePlansHidden"), /not sold in this app/i);
  assert.match(src("src/lib/sentry.client.ts"), /shouldStartSentryBrowser/);
  assert.match(src("src/lib/sentry.client.ts"), /isNative\(\)/);
  assert.match(src("src/components/cookie-consent-banner.tsx"), /initSentryBrowser/);
  assert.match(src("src/lib/posthog.ts"), /consent !== "granted" && isNative\(\)/);
  assert.doesNotMatch(src("docs/posthog.md"), /does \*\*not\*\* show this banner/);
  assert.doesNotMatch(src(".env.example"), /ANDROID_CERT_SHA256S=[0-9A-F:]{10,}/);
});
