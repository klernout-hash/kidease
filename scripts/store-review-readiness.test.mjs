import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseInboundOptOut } from "../src/lib/casl.ts";
import { reviewerSignInSkipsTurnstile } from "../src/lib/reviewer-accounts.ts";
import { inboundKeywordTwiml } from "../src/lib/sms-copy.ts";
import { liveAgentSmsDecision } from "../src/lib/support-chat.ts";
import { twilioSignatureMatches } from "../src/lib/server/sms-status.ts";
import {
  claimStripeEventOnce,
  gateStripeWebhook,
  releaseStripeEventClaim,
  resetStripeEventClaimsForTests,
} from "../src/lib/server/stripe-signature.ts";
import { webdriverBlocksAnalytics } from "../src/lib/posthog.ts";
import "../tests/e2e/marketplace-claim-idor.smoke.spec.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function signStripe(raw, secret) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

test("store reviewer sign-in skips Turnstile and still checks the password", () => {
  assert.equal(reviewerSignInSkipsTurnstile("  Reviewer-Parent@KidEase.ca "), true);
  assert.equal(reviewerSignInSkipsTurnstile("reviewer-provider@kidease.ca"), true);
  assert.equal(reviewerSignInSkipsTurnstile("parent@example.com"), false);
  assert.equal(reviewerSignInSkipsTurnstile("reviewer.parent@kidease.ca"), false);
  const login = src("src/routes/login.tsx");
  assert.match(login, /reviewerSignInSkipsTurnstile\(email\)/);
  assert.match(login, /turnstileRequired && !token\.trim\(\)/);
  assert.match(login, /mode === "in" && reviewerSignIn/);
  const auth = src("src/routes/api/auth/$.ts");
  assert.match(auth, /signInEmailSkipsTurnstile/);
  assert.match(auth, /assertTurnstileToken/);
  assert.match(auth, /auth\.handler/);
  assert.match(auth, /RATE_LIMITED/);
});

test("iOS bundle, privacy strings, and associated domains match the live AASA", () => {
  const plist = src("ios/App/App/Info.plist");
  assert.match(plist, /NSLocationWhenInUseUsageDescription/);
  assert.match(plist, /NSCameraUsageDescription/);
  assert.match(plist, /NSPhotoLibraryUsageDescription/);
  assert.match(plist, /NSPhotoLibraryAddUsageDescription/);
  assert.match(plist, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  const entitlements = src("ios/App/App/App.entitlements");
  assert.match(entitlements, /applinks:www\.kidease\.ca/);
  assert.match(entitlements, /applinks:kidease\.ca/);
  assert.match(entitlements, /webcredentials:www\.kidease\.ca/);
  assert.match(src("ios/App/App.xcodeproj/project.pbxproj"), /PRODUCT_BUNDLE_IDENTIFIER = ca\.kidease\.app/);
  assert.match(src("capacitor.config.ts"), /ca\.kidease\.app/);
  assert.match(src("public/apple-app-site-association"), /GAUC28WJXZ\.ca\.kidease\.app/);
  assert.match(src("android/app/build.gradle"), /applicationId "ca\.kidease\.app"/);
});

test("Stripe webhook rejects a bad signature with 400 and accepts a signed event once", () => {
  resetStripeEventClaimsForTests();
  const secret = "whsec_test_not_live";
  assert.deepEqual(gateStripeWebhook("{}", "", [secret]), { ok: false, status: 400, body: "Bad Request" });
  assert.deepEqual(gateStripeWebhook("{}", "t=1,v1=deadbeef", [secret]), { ok: false, status: 400, body: "Bad Request" });
  assert.equal(gateStripeWebhook("{}", "t=1,v1=deadbeef", [""]).status, 401);

  const checkout = JSON.stringify({
    id: "evt_checkout_1",
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_1", metadata: { kidease: "bill", bill_id: "bill_1" } } },
  });
  const opened = gateStripeWebhook(checkout, signStripe(checkout, secret), [secret]);
  assert.equal(opened.ok, true);
  if (opened.ok) {
    assert.equal(opened.event.type, "checkout.session.completed");
    assert.equal(claimStripeEventOnce(opened.event.id), true);
    assert.equal(claimStripeEventOnce(opened.event.id), false);
    releaseStripeEventClaim(opened.event.id);
    assert.equal(claimStripeEventOnce(opened.event.id), true);
  }

  const updated = JSON.stringify({
    id: "evt_sub_1",
    type: "customer.subscription.updated",
    data: { object: { id: "sub_1", status: "active" } },
  });
  const sub = gateStripeWebhook(updated, signStripe(updated, secret), [secret]);
  assert.equal(sub.ok, true);
  if (sub.ok) assert.equal(sub.event.type, "customer.subscription.updated");
  assert.match(src("src/routes/api/stripe.webhook.ts"), /status: 400|Bad Request/);
  assert.match(src("src/routes/api/stripe.webhook.ts"), /duplicate: true/);
  assert.match(src("src/routes/api/stripe.webhook.ts"), /Unauthorized/);
});

test("Twilio inbound rejects a bad signature and handles STOP, START, HELP, and French keywords", () => {
  const url = "https://www.kidease.ca/api/sms/inbound";
  const params = { Body: "hello", From: "+12045550100" };
  assert.equal(
    twilioSignatureMatches("not-a-signature", url, params, { TWILIO_AUTH_TOKEN: "test_auth_token_not_real" }),
    false,
  );
  assert.match(src("src/routes/api/sms.inbound.ts"), /status: 401/);

  assert.equal(parseInboundOptOut({ Body: "STOP" }), "stop");
  assert.equal(parseInboundOptOut({ Body: "ARRET" }), "stop");
  assert.equal(parseInboundOptOut({ Body: "ARRÊT" }), "stop");
  assert.equal(parseInboundOptOut({ Body: "START" }), "start");
  assert.equal(parseInboundOptOut({ Body: "HELP" }), "help");
  assert.equal(parseInboundOptOut({ Body: "AIDE" }), "help");

  assert.match(inboundKeywordTwiml({ Body: "STOP" }, "stop"), /opted out/i);
  assert.match(inboundKeywordTwiml({ Body: "ARRET" }, "stop"), /désabonné/);
  assert.match(inboundKeywordTwiml({ Body: "AIDE" }, "help"), /textos/);
  assert.match(inboundKeywordTwiml({ Body: "HELP" }, "help"), /Reply STOP/);
  assert.match(inboundKeywordTwiml({ Body: "STOP", OptOutType: "STOP" }, "stop"), /<Response><\/Response>/);

  const agent = liveAgentSmsDecision("+12048088398", "On my way #KE-4401");
  assert.equal(agent.route, true);
  assert.equal(agent.code, "KE-4401");
  assert.equal(liveAgentSmsDecision("+12045550100", "STOP").route, false);
  assert.match(src("src/routes/api/sms.inbound.ts"), /liveAgentSmsDecision/);
  assert.match(src("src/routes/api/sms.inbound.ts"), /routeAgentSms/);
});

test("headless WebDriver sessions skip PostHog and web vitals unless ke_analytics=1", () => {
  assert.equal(webdriverBlocksAnalytics({ webdriver: true, search: "" }), true);
  assert.equal(webdriverBlocksAnalytics({ webdriver: true, search: "?ke_analytics=1" }), false);
  assert.equal(webdriverBlocksAnalytics({ webdriver: false, search: "" }), false);
  const posthog = src("src/lib/posthog.ts");
  assert.match(posthog, /webdriverBlocksAnalytics\(\)/);
  assert.match(src("src/lib/web-vitals.ts"), /webdriverBlocksAnalytics/);
});
