import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultNoticePrefs,
  lifecycleEnabled,
  milestoneCopy,
  nextMilestone,
  noticeAllowed,
  winBackChannel,
} from "../src/lib/lifecycle.ts";

test("lifecycle stays off and tips do not text", () => {
  assert.equal(lifecycleEnabled({}), false);
  const prefs = defaultNoticePrefs();
  assert.equal(prefs.tips.email, false);
  assert.equal(
    noticeAllowed({
      enabled: true,
      category: "tips",
      channel: "sms",
      prefs: { ...prefs, tips: { email: true, sms: true } },
      emailConsent: true,
      smsConsent: true,
      smsFlag: true,
    }),
    false,
  );
});

test("SMS needs consent and the SMS flag", () => {
  const prefs = defaultNoticePrefs();
  prefs.tours.sms = true;
  assert.equal(
    noticeAllowed({ enabled: true, category: "tours", channel: "sms", prefs, emailConsent: true, smsConsent: false, smsFlag: true }),
    false,
  );
  assert.equal(
    noticeAllowed({ enabled: true, category: "tours", channel: "sms", prefs, emailConsent: true, smsConsent: true, smsFlag: false }),
    false,
  );
  assert.equal(
    noticeAllowed({ enabled: true, category: "tours", channel: "sms", prefs, emailConsent: true, smsConsent: true, smsFlag: true }),
    true,
  );
});

test("win-back is email after 45 days and never without consent", () => {
  const now = new Date("2026-10-31T12:00:00.000Z");
  assert.equal(
    winBackChannel({ enabled: true, lastSeen: "2026-08-01T12:00:00.000Z", now, emailConsent: true, unsubscribedAll: false }),
    "email",
  );
  assert.equal(
    winBackChannel({ enabled: true, lastSeen: "2026-10-01T12:00:00.000Z", now, emailConsent: true, unsubscribedAll: false }),
    "none",
  );
  assert.equal(
    winBackChannel({ enabled: true, lastSeen: "2026-08-01T12:00:00.000Z", now, emailConsent: false, unsubscribedAll: false }),
    "none",
  );
  assert.equal(winBackChannel({ enabled: false, lastSeen: "2026-01-01T00:00:00.000Z", now, emailConsent: true, unsubscribedAll: false }), "none");
});

test("milestones do not invent an opening", () => {
  assert.equal(nextMilestone(20, []), 12);
  assert.equal(nextMilestone(20, [12]), 18);
  assert.equal(nextMilestone(10, []), null);
  assert.match(milestoneCopy(18, "en"), /does not mean a spot is open/);
  assert.match(milestoneCopy(18, "fr"), /place libre/);
});
