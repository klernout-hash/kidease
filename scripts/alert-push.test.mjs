import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALERT_CATEGORIES,
  alertEmailLetter,
  alertPushCopy,
  alertSettingRows,
  alertSettingsIntro,
  canRegisterWebPush,
  decideCustomerAlert,
  getAlertsPromptCopy,
  nextAlertSendAt,
  safeAlertHref,
  webAlertPromptStep,
  webPushPermissionAllowed,
} from "../src/lib/alert-push.ts";
import { signAlertUnsubToken, verifyAlertUnsubToken } from "../src/lib/alert-push-token.ts";
import { isAlertQuietHours, winnipegHour } from "../src/lib/search-alert-policy.ts";

const NIGHT = new Date("2026-10-06T02:30:00.000Z");
const MORNING = new Date("2026-10-05T15:00:00.000Z");

test("quiet hours hold customer alerts until 8 a.m. Winnipeg", () => {
  assert.equal(isAlertQuietHours(NIGHT), true);
  assert.equal(isAlertQuietHours(MORNING), false);
  assert.equal(
    decideCustomerAlert({ category: "message", prefEnabled: true, subscriptionsOn: false, quiet: true }).action,
    "hold",
  );
  assert.equal(
    decideCustomerAlert({ category: "message", prefEnabled: true, subscriptionsOn: false, quiet: false }).action,
    "send",
  );
  const next = nextAlertSendAt(NIGHT);
  assert.equal(winnipegHour(next), 8);
  assert.equal(isAlertQuietHours(next), false);
  assert.equal(nextAlertSendAt(MORNING).toISOString(), MORNING.toISOString());
});

test("billing stays off while paid plans are off, and opt-out wins", () => {
  assert.equal(
    decideCustomerAlert({ category: "billing", prefEnabled: true, subscriptionsOn: false, quiet: false }).reason,
    "billing_off",
  );
  assert.equal(
    decideCustomerAlert({ category: "billing", prefEnabled: true, subscriptionsOn: true, quiet: false }).action,
    "send",
  );
  assert.equal(
    decideCustomerAlert({ category: "enquiry", prefEnabled: false, subscriptionsOn: false, quiet: false }).reason,
    "opt_out",
  );
  assert.equal(decideCustomerAlert({ category: "nope", prefEnabled: true, subscriptionsOn: true, quiet: false }).reason, "unknown");
  assert.equal(alertSettingRows("daycare", "en", false).some((row) => row.category === "billing"), false);
  assert.equal(alertSettingRows("daycare", "fr", true).some((row) => row.category === "billing"), true);
  assert.equal(alertSettingRows("parent", "en", true).length, 9);
});

test("alert copy stays plain in English and French", () => {
  const blobs = [];
  for (const locale of ["en", "fr"]) {
    blobs.push(JSON.stringify(alertSettingsIntro(locale, "parent")));
    blobs.push(JSON.stringify(alertSettingsIntro(locale, "daycare")));
    blobs.push(JSON.stringify(getAlertsPromptCopy(locale)));
    for (const category of ALERT_CATEGORIES) {
      blobs.push(JSON.stringify(alertPushCopy(category, locale, { name: "Oaks", status: "waitlisted" })));
      blobs.push(JSON.stringify(alertSettingRows(locale === "fr" ? "daycare" : "parent", locale, true)));
    }
  }
  const letter = alertEmailLetter({
    title: "New message",
    body: "You have a message about Oaks.",
    href: "https://www.kidease.ca/inbox/1",
    unsubUrl: "https://www.kidease.ca/unsubscribe?token=ka.test",
    locale: "en",
  });
  blobs.push(letter.text, letter.html);
  const all = blobs.join("\n");
  assert.doesNotMatch(all, /—|–|police check|free forever/i);
  assert.match(all, /Canadian company/);
  assert.match(all, /entreprise canadienne/);
  assert.match(alertPushCopy("waitlist", "fr", { name: "Oaks", status: "waitlisted" }).body, /en attente/);
  assert.match(letter.text, /Unsubscribe/);
});

test("unsubscribe token and web prompt rules", () => {
  const secret = "test-secret";
  const token = signAlertUnsubToken({ userId: "user_1", category: "message", exp: Date.now() + 1000 }, secret);
  assert.ok(token?.startsWith("ka."));
  assert.equal(verifyAlertUnsubToken(token, secret)?.category, "message");
  assert.equal(verifyAlertUnsubToken(token, "other"), null);
  assert.equal(verifyAlertUnsubToken(token, secret, Date.now() + 5000), null);
  assert.equal(signAlertUnsubToken({ userId: "", category: "message", exp: Date.now() + 1000 }, secret), null);

  assert.equal(webAlertPromptStep({ native: true, choice: null, seenThisVisit: true }), "hide");
  assert.equal(webAlertPromptStep({ native: false, choice: null, seenThisVisit: false }), "hide");
  assert.equal(webAlertPromptStep({ native: false, choice: null, seenThisVisit: true }), "show");
  assert.equal(webAlertPromptStep({ native: false, choice: "no", seenThisVisit: true }), "hide");
  assert.equal(webAlertPromptStep({ native: false, signedIn: false, choice: null, seenThisVisit: true }), "hide");
  assert.equal(webPushPermissionAllowed({ pushArmed: true, vapidPublic: true, vapidPrivate: false }), false);
  assert.equal(webPushPermissionAllowed({ pushArmed: true, vapidPublic: true, vapidPrivate: true }), true);
  assert.equal(
    canRegisterWebPush({ notification: true, pushManager: true, serviceWorker: true, vapidPublic: true, pushArmed: false }),
    false,
  );
  assert.equal(
    canRegisterWebPush({ notification: true, pushManager: true, serviceWorker: true, vapidPublic: true, pushArmed: true }),
    true,
  );
  assert.equal(safeAlertHref("https://evil.example/phish"), "/notifications");
  assert.equal(safeAlertHref("/parent?tab=waitlists"), "/parent?tab=waitlists");
  assert.equal(safeAlertHref("https://www.kidease.ca/spots/abc"), "https://www.kidease.ca/spots/abc");
});
