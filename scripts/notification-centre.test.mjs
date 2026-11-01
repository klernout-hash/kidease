import assert from "node:assert/strict";
import { test } from "node:test";
import {
  centreDelivery,
  defaultChannelPrefs,
  markRead,
  notificationCentreEnabled,
  parseChannelPrefs,
} from "../src/lib/wiring/notification-centre.ts";

test("notification centre keeps texts behind consent and records a read receipt", () => {
  assert.equal(notificationCentreEnabled({}), false);
  const prefs = parseChannelPrefs({ email: true, sms: true, push: true, in_app: true });
  assert.equal(prefs.sms, true);
  const plan = centreDelivery({
    mode: "live",
    prefs,
    featureSms: true,
    smsConsent: false,
    addressBlocked: false,
    quiet: false,
    featurePush: false,
  });
  assert.equal(plan.channels.includes("sms"), false);
  assert.equal(plan.channels.includes("push"), false);
  assert.deepEqual(defaultChannelPrefs().push, false);
  const receipt = markRead({ readerId: "u1", ownerId: "u1", already: null, now: "2026-10-31T00:00:00.000Z" });
  assert.equal("readBy" in receipt && receipt.readBy, "u1");
  assert.equal("error" in markRead({ readerId: "u2", ownerId: "u1", already: null, now: "2026-10-31T00:00:00.000Z" }), true);
});
