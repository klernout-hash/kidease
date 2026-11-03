import test from "node:test";
import assert from "node:assert/strict";
import { alertPromptAllowed, recordDecline, SNOOZE_MS, ALERT_DECLINES_KEY } from "../src/lib/prompt-manager.ts";

const base = { consent: "granted", cookieBannerOpen: false, acted: true, now: 1e12, snoozeUntil: 0, declines: 0, choice: null, msSinceLoad: 60000 };

test("cookies win over alerts", () => {
  assert.equal(alertPromptAllowed({ ...base, cookieBannerOpen: true }), false);
  assert.equal(alertPromptAllowed({ ...base, consent: "unset" }), false);
});
test("needs a meaningful action and quiet first seconds", () => {
  assert.equal(alertPromptAllowed({ ...base, acted: false }), false);
  assert.equal(alertPromptAllowed({ ...base, msSinceLoad: 1000 }), false);
  assert.equal(alertPromptAllowed(base), true);
});
test("not now snoozes 30 days, two declines stop", () => {
  const m = new Map();
  const store = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  recordDecline(store, base.now);
  assert.equal(alertPromptAllowed({ ...base, snoozeUntil: base.now + SNOOZE_MS, declines: 1 }), false);
  assert.equal(alertPromptAllowed({ ...base, now: base.now + SNOOZE_MS + 1, snoozeUntil: base.now + SNOOZE_MS, declines: 1 }), true);
  recordDecline(store, base.now);
  assert.equal(m.get(ALERT_DECLINES_KEY), "2");
  assert.equal(alertPromptAllowed({ ...base, declines: 2 }), false);
});
